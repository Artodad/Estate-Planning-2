"use client";

import { useFirm } from "./use-firm";
import type { FirmRole } from "./types";
import { hasRole } from "./rbac";

/**
 * Client-side hook for convenient, reactive role checks.
 *
 * Powered by the Zustand `useFirm` store (which is hydrated from the server via
 * GlobalFirmHydrator + getCurrentFirm Server Action, which in turn uses the
 * DB-preferred role from getCurrentAuthContext).
 *
 * **Security Warning**: This is derived from client state for UI purposes only
 * (conditional rendering, disabling buttons, etc.). All data access and mutations
 * MUST re-validate role + firmId on the server using `getCurrentAuthContext`,
 * `requireRole`, or `checkRole`.
 *
 * @example
 *   const { role, isOwner, isStaff, isClient, hasRole: can, canManageClients } = useRole();
 *   if (isOwner) { ... }
 *   return <RoleGuard allowed={["owner", "staff"]}>...</RoleGuard>;
 */
export function useRole() {
  const { currentFirm, isHydrated, isLoading } = useFirm();

  const role: FirmRole | null = currentFirm?.role ?? null;

  return {
    /** The current role within the active firm (null until hydrated or no firm). */
    role,

    /** Hydration state from the underlying firm store (prevents flashes). */
    isHydrated,
    isLoading,

    /** Convenience booleans (reactive). */
    isOwner: role === "owner",
    isStaff: role === "staff",
    isClient: role === "client",

    /**
     * Check an arbitrary list of allowed roles.
     * Usage: `const canEdit = hasRole(["owner", "staff"]);`
     */
    hasRole: (allowed: readonly FirmRole[]) => hasRole(role, allowed),

    /**
     * Common derived permissions (extend here as RBAC matrix grows).
     */
    canManageClients: () => hasRole(role, ["owner", "staff"]),
    canInviteClients: () => hasRole(role, ["owner", "staff"]),
    canAccessDashboard: () => hasRole(role, ["owner", "staff"]), // clients get limited view
    // Future examples:
    // canUploadTemplates: () => hasRole(role, ["owner"]),
    // canViewAllIntakes: () => hasRole(role, ["owner", "staff"]),
  };
}

/**
 * Alias for ergonomics / discoverability.
 * Both `useRole()` and `useCurrentRole()` are exported and equivalent.
 */
export const useCurrentRole = useRole;
