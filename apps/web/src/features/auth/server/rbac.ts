import "server-only";

import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "./get-current-auth";
import type { AuthContext, FirmRole } from "../types";
import { hasRole } from "../rbac";

/**
 * Custom error for role authorization failures.
 * Useful for try/catch in Server Actions when you want structured handling
 * instead of (or in addition to) redirect.
 */
export class UnauthorizedError extends Error {
  constructor(message = "Insufficient permissions") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Server-only RBAC enforcement helper.
 *
 * Re-validates the full auth context (Clerk org + Prisma-preferred role) on every call.
 * This is the primary primitive for protecting Server Components, layouts, and
 * Server Actions.
 *
 * Behavior:
 * - If the current user's role (from `getCurrentAuthContext`) is not in `allowed`,
 *   it will `redirect(...)` (for RSC/layouts/pages) or `throw UnauthorizedError`
 *   (configurable).
 * - On success, returns the full `AuthContext` (so caller gets fresh `currentFirm`,
 *   `role`, user details, etc.).
 *
 * @param allowed - List of roles permitted (e.g. ["owner", "staff"] or OWNER_STAFF).
 * @param options - Optional redirect target and error message. For actions, prefer
 *                  `onUnauthorized: 'throw'` + catch, or use `checkRole` pattern.
 *
 * Security: Always re-fetches from Clerk + DB. Never trusts client `useRole()` state.
 *
 * @example In a layout or RSC page (redirects on fail):
 *   const ctx = await requireRole(["owner", "staff"]);
 *   // ctx.role is guaranteed allowed
 *
 * @example In a Server Action (graceful error return):
 *   const result = await checkRoleOrError(["owner", "staff"]);
 *   if (!result.ok) return { error: result.error };
 *   // proceed with result.context
 */
export async function requireRole(
  allowed: FirmRole[],
  options?: {
    redirectTo?: string;
    errorMessage?: string;
    /** 'redirect' (default, works in RSC + actions) | 'throw' */
    onUnauthorized?: "redirect" | "throw";
  }
): Promise<AuthContext> {
  const ctx = await getCurrentAuthContext({ includeProfile: false });
  const role = ctx?.role ?? ctx?.currentFirm?.role ?? null;

  if (!hasRole(role, allowed)) {
    const message = options?.errorMessage ?? "You do not have permission to access this resource.";
    const to = options?.redirectTo ?? "/dashboard?error=unauthorized";

    const behavior = options?.onUnauthorized ?? "redirect";

    if (behavior === "redirect") {
      // redirect() works from Server Components, layouts, and Server Actions.
      // In actions it will cause the client to navigate.
      redirect(to);
    }

    throw new UnauthorizedError(message);
  }

  return ctx!;
}

/**
 * Convenience wrapper for the most common protected case (attorney + staff).
 */
export const requireOwnerOrStaff = (options?: Parameters<typeof requireRole>[1]) =>
  requireRole(["owner", "staff"], options);

/**
 * Non-redirecting check for Server Actions that want to return structured errors.
 *
 * Returns a result object instead of side-effecting (redirect/throw).
 * Still calls getCurrentAuthContext for full re-validation.
 *
 * @example
 *   const check = await checkRole(["owner", "staff"]);
 *   if (!check.ok) {
 *     return { error: check.error, role: check.role };
 *   }
 *   const ctx = check.context;
 */
export async function checkRole(allowed: FirmRole[]): Promise<
  | { ok: true; context: AuthContext; role: FirmRole }
  | { ok: false; error: string; role: FirmRole | null; context: AuthContext | null }
> {
  // Use lightweight auth context by default (no expensive currentUser() call).
  // Profile details are rarely needed for pure authorization decisions.
  const ctx = await getCurrentAuthContext({ includeProfile: false });
  const role = ctx?.role ?? ctx?.currentFirm?.role ?? null;

  if (hasRole(role, allowed)) {
    return { ok: true, context: ctx!, role: role! };
  }

  return {
    ok: false,
    error: "Insufficient permissions for this action.",
    role,
    context: ctx,
  };
}

/**
 * Convenience for owner/staff check in actions.
 */
export const checkOwnerOrStaff = () => checkRole(["owner", "staff"]);

/**
 * Lightweight convenience to get just the current authoritative role.
 * Still performs the full secure lookup (recommended over reading from client store).
 */
export async function getCurrentRole(): Promise<FirmRole | null> {
  const ctx = await getCurrentAuthContext();
  return ctx?.role ?? ctx?.currentFirm?.role ?? null;
}
