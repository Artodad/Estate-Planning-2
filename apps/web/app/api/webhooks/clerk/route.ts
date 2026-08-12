import { NextRequest } from 'next/server';

import { verifyWebhook } from '@clerk/nextjs/webhooks';
import type { WebhookEvent } from '@clerk/nextjs/webhooks';
import { clerkClient } from '@clerk/nextjs/server';

import { prisma } from '@/lib/prisma';
import { mapClerkRoleToFirmRole } from '@/features/auth/rbac';
import { logAuditEvent } from '@/features/auth/server/audit';

/**
 * Clerk Webhook Endpoint (POST /api/webhooks/clerk)
 *
 * Verifies incoming Svix-signed webhooks from Clerk using `verifyWebhook`.
 * Handles the exact 6 events per the Research Design Document (appended to
 * progress-phase-1-webhooks-auditlog.md):
 *   - user.created
 *   - user.updated
 *   - organizationMembership.created
 *   - organizationMembership.updated
 *   - organizationMembership.deleted
 *   - organization.created (defensive)
 *
 * Sync strategy (follows Design §3 exactly, no deviations):
 * - organizationMembership.* is the **key signal** for associating a Clerk user to a Firm.
 * - Role is set **only on User create** (bootstrap from mapClerkRoleToFirmRole).
 *   On update paths, role is deliberately omitted (Prisma User.role is authoritative
 *   source of truth per Phase 1C RBAC ADR; invitation claim path wins for "client").
 * - user.* events: email sync **only if User already exists** (never create here — no org/firm context in payload).
 * - organization.created: logging/observability only. **Never** auto-creates a Firm record
 *   (Firm creation is always explicit via createFirmFromClerkOrganization + user confirmation).
 * - Race handling: If membership event arrives before a matching Firm (clerkOrgId), skip the
 *   User write entirely (log at info). The exported recovery ensureUserRecord (from
 *   get-current-auth.ts) or explicit paths (create-firm, invite claim) will populate later.
 *   This preserves the non-null firmId + FK invariant. Webhooks are the primary path.
 *
 * Error philosophy (per Design + clerk-webhooks skill):
 * - Verification failure → 400 (never trust spoofed events).
 * - After successful verification → **ALWAYS return 200** (even if individual handler
 *   processing fails or hits a known race). This prevents Svix retry storms for
 *   idempotent / non-recoverable cases. Transient issues rely on Clerk retries + replay
 *   + our recovery utility.
 * - All DB / Clerk work inside handlers is wrapped in try/catch (non-fatal).
 *
 * Logging: Includes svix-id (from headers) for correlation / replay debugging.
 * Idempotency: Relies on Prisma upserts + Clerk's delivery semantics (svix-id available for future dedupe table if needed).
 *
 * Route must be public (see middleware.ts: added to isPublicRoute).
 * No session/auth imports here — pure event sink.
 *
 * Dual secret support during transition: CLERK_WEBHOOK_SIGNING_SECRET (official per Clerk/skill)
 * falls back to legacy CLERK_WEBHOOK_SECRET (from our .env.example).
 *
 * Testing: See Design §6 for ngrok + Clerk Dashboard "Send Example" + real flows.
 * Local smoke: `curl -X POST ...` with valid signature is complex (use dev server + Dashboard test events).
 */

export async function POST(req: NextRequest) {
  const svixId = req.headers.get('svix-id') ?? 'unknown';
  const svixTimestamp = req.headers.get('svix-timestamp') ?? 'unknown';

  let evt: WebhookEvent;

  try {
    evt = await verifyWebhook(req, {
      // Support BOTH our historical .env.example name AND Clerk's documented default.
      // See Design §7 + rollout notes. Standardize on CLERK_WEBHOOK_SIGNING_SECRET going forward.
      signingSecret:
        process.env.CLERK_WEBHOOK_SIGNING_SECRET ||
        process.env.CLERK_WEBHOOK_SECRET,
    });
  } catch (err) {
    console.error('[webhooks/clerk] Verification failed:', {
      svixId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new Response('Webhook verification failed', { status: 400 });
  }

  // Receipt log (always after successful verify)
  console.log(
    `[webhooks/clerk] Verified ${evt.type} svixId=${svixId} ts=${svixTimestamp}`,
  );

  // === Handlers (exact 6 events; non-fatal; always fall through to 200) ===

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    console.log(`[webhook:${evt.type}] svix=${svixId}`);
    try {
      const { id, email_addresses } = evt.data;
      const email =
        email_addresses?.[0]?.email_address ?? 'unknown@example.com';

      // Only update existing User (user.* payloads carry no org/firm context).
      // Creation of User records with firmId is driven by membership events
      // or explicit paths (create-firm, invite claim). This prevents orphan
      // Users that would violate the schema non-null firmId constraint.
      const existing = await prisma.user.findUnique({
        where: { clerkId: id },
      });

      if (existing) {
        await prisma.user.update({
          where: { clerkId: id },
          data: { email },
          // Deliberately omit role and firmId — never touch from user.* events.
        });
        console.log(
          `[webhook:${evt.type}] email updated for clerkId=${id} svix=${svixId}`,
        );
      } else {
        console.log(
          `[webhook:${evt.type}] no existing User for clerkId=${id} (skipping create; await membership/explicit path) svix=${svixId}`,
        );
      }
    } catch (e) {
      console.error(`[webhook:${evt.type}] processing error (non-fatal)`, {
        svixId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (
    evt.type === 'organizationMembership.created' ||
    evt.type === 'organizationMembership.updated'
  ) {
    const handlerName = evt.type;
    console.log(`[webhook:${handlerName}] svix=${svixId}`);
    try {
      const { organization, public_user_data, role: clerkRole } = evt.data;
      const clerkOrgId = organization.id;
      const clerkUserId = public_user_data.user_id;

      const firm = await prisma.firm.findUnique({
        where: { clerkOrgId },
      });

      if (!firm) {
        // RACE / PRE-ONBOARDING: membership event before Firm row exists.
        // Skip entirely to preserve User.firmId non-null + FK invariant.
        // Recovery: explicit onboarding/create-firm/claim paths, or manual call to the exported
        // ensureUserRecord recovery utility (get-current-auth.ts) on first protected access or via script.
        // See Design §3 "Handling webhook-before-Firm (and vice-versa) races" and §5 (A.4 cleanup).
        console.info(
          `[webhook:${handlerName}] no Firm for clerkOrgId=${clerkOrgId} (race or pre-onboarding), skipping User sync svix=${svixId}`,
        );
      } else {
        // Always fetch freshest email from Clerk (webhook context has no session).
        // Matches pattern used in the recovery ensureUserRecord + create-firm-from-clerk.ts + invite-client.ts.
        let email = 'unknown@example.com';
        try {
          const client = await clerkClient();
          const clerkUser = await client.users.getUser(clerkUserId);
          email =
            clerkUser.primaryEmailAddress?.emailAddress ??
            clerkUser.emailAddresses?.[0]?.emailAddress ??
            email;
        } catch (emailErr) {
          console.warn(
            `[webhook:${handlerName}] Clerk user email lookup failed (fallback used)`,
            {
              svixId,
              clerkUserId,
              error:
                emailErr instanceof Error
                  ? emailErr.message
                  : String(emailErr),
            },
          );
        }

        const bootstrapRole = mapClerkRoleToFirmRole(clerkRole);

        await prisma.user.upsert({
          where: { clerkId: clerkUserId },
          update: {
            firmId: firm.id,
            email,
            // CRITICAL: role omitted on update. DB role (from invite claim or owner create) is source of truth.
            // Prevents flipping "client" back to "staff".
          },
          create: {
            clerkId: clerkUserId,
            email,
            role: bootstrapRole, // only on create; "owner"|"staff" from mapping. Never "client" from Clerk.
            firmId: firm.id,
          },
        });

        console.log(
          `[webhook:${handlerName}] User synced clerkId=${clerkUserId} → firmId=${firm.id} (bootstrapRole=${bootstrapRole}) svix=${svixId}`,
        );

        // Phase 6 Wave A: Audit membership changes coming through Clerk (previously zero coverage).
        // Non-fatal, minimal metadata. actorClerkId is the affected user (system-driven event).
        logAuditEvent({
          firmId: firm.id,
          actorClerkId: clerkUserId,
          action: evt.type === 'organizationMembership.created' ? 'membership.created' : 'membership.role_updated',
          targetType: 'user',
          targetId: clerkUserId,
          metadata: {
            clerkOrgId,
            clerkRole,
            via: 'clerk_webhook',
          },
        });
      }
    } catch (e) {
      console.error(`[webhook:${evt.type}] processing error (non-fatal)`, {
        svixId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (evt.type === 'organizationMembership.deleted') {
    console.log(`[webhook:organizationMembership.deleted] svix=${svixId}`);
    try {
      const { organization, public_user_data } = evt.data;
      // No mutation to User:
      // - We retain the User record for audit/history (documents, etc.).
      // - Current schema has single firmId (non-null); multi-org support is future work (see Design risks).
      // - Invitation model + explicit paths remain independent.
      console.info(
        `[webhook:organizationMembership.deleted] user=${public_user_data.user_id} removed from org=${organization.id}; User retained (no DB write) svix=${svixId}`,
      );

      // Phase 6 Wave A audit (system-driven removal event)
      const clerkOrgIdDel = organization.id;
      // Best-effort firmId lookup (non-blocking, non-fatal). Many removal events will still resolve.
      let firmIdForAudit = 'unknown';
      try {
        const firm = await prisma.firm.findUnique({ where: { clerkOrgId: clerkOrgIdDel } });
        if (firm) firmIdForAudit = firm.id;
      } catch {
        // ignore — audit must never throw
      }
      logAuditEvent({
        firmId: firmIdForAudit,
        actorClerkId: public_user_data.user_id,
        action: 'membership.removed',
        targetType: 'user',
        targetId: public_user_data.user_id,
        metadata: {
          clerkOrgId: clerkOrgIdDel,
          via: 'clerk_webhook',
        },
      });
    } catch (e) {
      console.error(
        `[webhook:organizationMembership.deleted] processing error (non-fatal)`,
        {
          svixId,
          error: e instanceof Error ? e.message : String(e),
        },
      );
    }
  }

  if (evt.type === 'organization.created') {
    console.log(`[webhook:organization.created] svix=${svixId}`);
    try {
      const { id, name, slug } = evt.data;
      // Purely defensive / observability.
      // Firm records are created explicitly by users via the onboarding/create-firm flow
      // (which also sets the initial owner User with role). Never auto-provision here.
      console.info(
        `[webhook:organization.created] clerkOrgId=${id} name="${name}" slug=${slug ?? 'n/a'} — no auto-Firm creation (explicit path only) svix=${svixId}`,
      );
    } catch (e) {
      console.error(`[webhook:organization.created] processing error (non-fatal)`, {
        svixId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ALWAYS 200 after successful verification (per Clerk/Svix contract + Design §2).
  // Individual handler errors were logged above but did not prevent ack.
  return new Response('OK', { status: 200 });
}
