import "server-only";

import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";

import { prisma } from "@/lib/prisma";

import type { AuthContext, CurrentFirm, FirmRole } from "../types";
import { mapClerkRoleToFirmRole } from "../rbac";

/**
 * Server-only helper that returns the full current auth + firm context.
 *
 * This is the **single source of truth** for combining:
 * - Clerk authentication + active organization
 * - Our internal Prisma Firm and User records (read-only for role preference + display)
 *
 * **Sync strategy (post-Phase A.4 Cleanup)**:
 * Webhooks are now the **primary sync path** for User + firm association:
 *   - `/api/webhooks/clerk` (verified Svix) handles user.created/updated + organizationMembership.*
 *     (see the route for exact "role only on create", race guards that protect the firmId non-null
 *     constraint, and email sync).
 *   - Explicit authoritative upserts remain in creation flows: create-firm-from-clerk.ts (owner)
 *     and invite claim page (client role).
 *
 * The automatic call to `ensureUserRecord` has been **removed** from this hot path
 * (and it was never called from anywhere else). `getCurrentAuthContext` is now a pure
 * read path for normal authenticated requests — **no more automatic writes on every layout/page**.
 *
 * `ensureUserRecord` is retained (and exported) strictly as an **explicit recovery / safety net
 * utility**. See its JSDoc for when (and why) to call it manually.
 *
 * **Role resolution (Phase 1C+)**: We **prefer the persisted Prisma `User.role`** for the
 * `currentFirm.role` (and top-level `role` on AuthContext) over the initial Clerk orgRole
 * mapping (when a DB row exists and matches the active firm). See ADR in
 * progress-phase-1c-rbac-invitations.md. Clerk mapping (via shared mapClerkRoleToFirmRole)
 * is used only for bootstrap in webhooks + the (now-demoted) recovery utility.
 *
 * Use this in Server Components, Server Actions, and Route Handlers
 * whenever you need to know "who is this user and which firm are they acting on?"
 * All authorization decisions must call this (or derived requireRole) — never trust
 * client state or cached role alone.
 *
 * @param options.includeProfile - Set to true only when you need email/firstName/lastName
 *   for display or audit. Defaults to false to keep the hot path fast and resilient.
 */
export async function getCurrentAuthContext(options?: {
  /** Only fetch full Clerk user profile (email, firstName, lastName) when needed for display/audit.
   *  Defaults to false for performance and to avoid transient Clerk API failures in hot paths.
   */
  includeProfile?: boolean;
}): Promise<AuthContext | null> {
  const { userId, orgId, orgSlug, orgRole } = await auth();

  if (!userId) {
    return null;
  }

  let currentFirm: CurrentFirm | null = null;

  if (orgId) {
    // Look up our internal Firm record using the Clerk Organization ID.
    // We explicitly select only the fields we need for resilience.
    const firm = await prisma.firm.findUnique({
      where: { clerkOrgId: orgId },
      select: {
        id: true,
        clerkOrgId: true,
        name: true,
        slug: true,
      },
    });

    if (firm) {
      currentFirm = {
        id: firm.id,
        clerkOrgId: firm.clerkOrgId!,
        name: firm.name,
        slug: firm.slug ?? orgSlug ?? null,
        role: mapClerkRoleToFirmRole(orgRole),
      };
    } else {
      // Clerk org exists but we have no corresponding internal Firm record yet.
      // This is an expected state during onboarding / first-time org selection.
      // Try to fetch the nice human-friendly name from Clerk for a better pre-fill.
      let clerkOrgName: string | null = null;
      try {
        const client = await clerkClient();
        const org = await client.organizations.getOrganization({ organizationId: orgId });
        clerkOrgName = org.name ?? null;
      } catch (e) {
        // Resilient: Clerk API hiccups should never block onboarding
        console.warn("[getCurrentAuthContext] Could not fetch Clerk org name:", e);
      }

      currentFirm = {
        id: null, // No internal ID yet — caller should offer to create the Firm
        clerkOrgId: orgId,
        name: clerkOrgName ?? orgSlug ?? "Unnamed Firm",
        slug: orgSlug ?? null,
        role: mapClerkRoleToFirmRole(orgRole),
      };
    }
  }

  // === ensureUserRecord AUTO-CALL REMOVED (A.4 Cleanup complete) ===
  // Webhooks (/api/webhooks/clerk) + explicit upserts in create-firm-from-clerk.ts and
  // the invite claim page are the only writers that create User rows with firmId.
  // This hot path (called from every protected layout, page, rbac guard, etc.) is now
  // strictly read-only for normal users. No more DB writes on every authenticated request.
  //
  // The `ensureUserRecord` function remains exported below as the **recovery utility only**.
  // See its JSDoc for manual call scenarios (outages, missed events, direct Clerk edits,
  // pre-webhook backfills, local dev without endpoint configured, repair scripts).
  //
  // If a User row is missing for a valid Clerk member of an onboarded Firm:
  // - This function still succeeds (currentFirm populated from Clerk org + Firm lookup).
  // - Role falls back to Clerk-mapped value (see re-query below).
  // - Downstream code that queries User must handle null (many already do gracefully).
  // - Manual recovery: import and call ensureUserRecord({userId, orgId, firmId, role}) explicitly.
  // The non-null firmId constraint is never at risk from this path (no writes here).

  // **Phase 1C RBAC: Prefer Prisma User.role as source of truth for authorization**
  // Re-query the User record (may or may not exist yet, depending on webhook timing vs.
  // explicit creation paths) and override currentFirm.role with the persisted DB value
  // when it exists and matches the active firm. This ensures invitation-set roles
  // (e.g. "client") win over Clerk mapping (which never emits "client").
  // Always re-validates firmId for multi-tenancy safety.
  // Falls back to the Clerk-mapped role if no DB record yet (onboarding edge, or
  // webhook/eventual-consistency delay for a new staff/client joiner).
  if (currentFirm?.id && orgId) {
    try {
      const dbUser = await prisma.user.findUnique({
        where: { clerkId: userId },
        select: { role: true, firmId: true },
      });
      if (dbUser && dbUser.firmId === currentFirm.id && dbUser.role) {
        const dbRole = dbUser.role as FirmRole;
        // Basic runtime validation (DB is string column)
        if (dbRole === "owner" || dbRole === "staff" || dbRole === "client") {
          currentFirm = {
            ...currentFirm,
            role: dbRole,
          };
        }
      }
    } catch (e) {
      console.warn("[getCurrentAuthContext] Could not re-query User.role for DB preference (non-fatal, using mapped role):", e);
    }
  }

  // Populate email / names in AuthContext from Clerk (freshest data for display + audit).
  // This runs for any org context (even pre-firm.id during onboarding). No writes occur
  // in this module (webhooks + explicit creation paths are the writers). Graceful on
  // Clerk fetch failure.
  //
  // By default we skip this (includeProfile: false) to:
  // - Avoid extra Clerk API calls on every protected render/action
  // - Prevent transient "fetch failed" errors from surfacing in hot paths (see recent logs)
  // Callers that actually need display names or audit emails should pass { includeProfile: true }.
  let email: string | null = null;
  let firstName: string | null = null;
  let lastName: string | null = null;

  if (options?.includeProfile && orgId) {
    try {
      const clerkUser = await currentUser();
      email =
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        null;
      firstName = clerkUser?.firstName ?? null;
      lastName = clerkUser?.lastName ?? null;
    } catch (e) {
      console.warn("[getCurrentAuthContext] Could not fetch currentUser for profile details (non-fatal):", e);
    }
  }

  const resolvedRole: FirmRole | null = currentFirm?.role ?? null;

  return {
    userId,
    email,
    firstName,
    lastName,
    currentFirm,
    role: resolvedRole,
  };
}

/**
 * Ensures a Prisma `User` row exists (upsert on clerkId) for the given Clerk user,
 * associated with the internal Firm (with bootstrap role only on create).
 *
 * **RECOVERY / SAFETY NET UTILITY ONLY — NOT FOR HOT PATHS OR AUTOMATIC USE**
 *
 * Webhooks are now the **primary sync path** (see `app/api/webhooks/clerk/route.ts` and
 * the Research Design Document in progress-phase-1-webhooks-auditlog.md, especially §5
 * Migration & Rollout Plan):
 *   - organizationMembership.created/updated: creates/updates User with firmId when the
 *     Firm (clerkOrgId) exists; role bootstrapped **only on create** via mapClerkRoleToFirmRole.
 *     Races (membership before Firm) are skipped to protect the schema's non-null firmId constraint.
 *   - user.created/updated: email sync **only for pre-existing** User records (never creates here).
 *   - organization.created: observability only (Firm creation is always explicit).
 *
 * Authoritative explicit creation paths (these set the "source of truth" roles):
 *   - `createFirmFromClerkOrganization` in create-firm-from-clerk.ts (owner during onboarding)
 *   - Invite claim logic in `app/invite/[token]/page.tsx` ("client" role, wins over any webhook)
 *
 * This function is **exported** and retained **strictly** as an explicit recovery, backfill,
 * repair, and safety-net tool. It is intentionally non-blocking (never throws; logs on error).
 *
 * **When (and why) someone might still want to call the recovery function manually**:
 * - Data repair after Clerk outages, Svix delivery failures, or missed replays.
 * - Members added directly via the Clerk Dashboard (no corresponding membership webhook
 *   event was delivered to our endpoint).
 * - Backfilling users who existed before webhooks (A.2) or before a Firm was onboarded.
 * - Local development / testing when the /api/webhooks/clerk endpoint is not registered
 *   (or secret not set) in the Clerk Dashboard for the test instance.
 * - One-off repair scripts, database backfills, or (future) admin "re-sync user" tooling.
 * - Canary/staged rollout windows (if a temporary feature flag re-enables legacy behavior).
 * - Any other edge case where the primary webhook path + explicit creation paths did not
 *   result in a User record for a user who has a valid active Clerk organization membership.
 *
 * Callers are responsible for passing a valid firmId (from an existing Firm row) and
 * the appropriate bootstrap role. The function is idempotent.
 *
 * **Role handling (Phase 1C RBAC critical)**:
 * - Role is set **only on create** (using the bootstrapped value from Clerk mapping
 *   or caller, e.g. "staff" for members, or pre-set "client" by invitation flow).
 * - **On update, role is deliberately NOT overwritten**. This preserves roles set
 *   via invitation/claim flows (e.g. "client") even if the current Clerk orgRole
 *   would map to "staff". Prisma User.role is the source of truth for authz.
 * - Explicit role mutations (promote/demote) happen in dedicated Server Actions
 *   (future) that update Prisma (and optionally Clerk membership).
 *
 * Other requirements / behavior:
 * - Lazy + idempotent (upsert)
 * - Email via currentUser() + exact same fallback pattern as create-firm-from-clerk.ts
 * - Security gate inherited from caller: only for active orgId + existing firm.id
 * - Never blocks: console.error with context on failure, continue
 * - No writes when no org / no firmId
 *
 * @example Explicit recovery call (e.g. repair script or admin action):
 *   import { ensureUserRecord } from "@/features/auth/server/get-current-auth";
 *   await ensureUserRecord({ userId: "user_xxx", orgId: "org_xxx", firmId: "firm_xxx", role: "staff" });
 *
 * JSDoc for auditability. Exported for explicit/recovery use **only**.
 */
export async function ensureUserRecord(params: {
  userId: string;
  orgId: string;
  firmId: string;
  role: FirmRole;
}): Promise<void> {
  const { userId, orgId, firmId, role } = params;

  try {
    const clerkUser = await currentUser();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ??
      "unknown@example.com";

    await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        // IMPORTANT: role deliberately omitted here. See JSDoc above.
        // Existing role (e.g. "client" from invitation) is preserved.
        firmId,
        email,
      },
      create: {
        clerkId: userId,
        email,
        role, // Bootstrap role only on first creation for this firm
        firmId,
      },
    });
  } catch (error) {
    console.error("[getCurrentAuthContext] ensureUserRecord failed (non-fatal, continuing):", {
      userId,
      orgId,
      firmId,
      role,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

