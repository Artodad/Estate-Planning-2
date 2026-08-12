"use client";

import type { ReactNode } from "react";

import type { FirmRole } from "../types";
import { useRole } from "../use-role";
import { hasRole } from "../rbac";

/**
 * Client Component guard for role-based conditional rendering.
 *
 * Renders children only when the current user's role (from hydrated Zustand store)
 * matches one of the allowed roles. Otherwise renders `fallback` (defaults to null/hidden).
 *
 * Composes cleanly with the server-side `requireRole` / `checkRole`.
 *
 * ## Usage
 * ```tsx
 * <RoleGuard allowed={["owner", "staff"]} fallback={<AccessDenied />}>
 *   <InviteClientButton />
 * </RoleGuard>
 *
 * // Or hide completely for clients
 * <RoleGuard allowed={OWNER_STAFF}>
 *   <SensitiveAdminPanel />
 * </RoleGuard>
 * ```
 *
 * **Important Security Note**:
 * This only affects what the *browser renders*. It provides no protection against
 * direct navigation, tampered client state, or API calls. Server boundaries
 * (`requireRole` in layouts, pages, and actions) are the real enforcement.
 *
 * During hydration (`!isHydrated`) we render nothing to avoid flicker or
 * incorrect "allowed" states.
 */
interface RoleGuardProps {
  /** Roles that are permitted to see the children. Accepts readonly arrays (e.g. OWNER_STAFF). */
  allowed: readonly FirmRole[];
  children: ReactNode;
  /** What to render when the user does not have a matching role. Defaults to `null`. */
  fallback?: ReactNode;
}

export function RoleGuard({ allowed, children, fallback = null }: RoleGuardProps) {
  const { role, isHydrated } = useRole(); // reactive + has hydration state

  if (!isHydrated) {
    // Avoid flash of wrong content or leaking children during store rehydration
    return null;
  }

  if (!hasRole(role, allowed)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
