/**
 * Auth Feature - Public API
 *
 * This is the single entry point for all auth/multi-tenancy logic.
 * Import from here instead of reaching into individual files.
 *
 * Client-safe exports only. Server-only code lives in ./server/*
 * and must be imported directly (e.g. from Server Components or Route Handlers).
 */

export * from "./types";
export { useFirm, useCurrentFirmId } from "./use-firm";
export { useRole, useCurrentRole } from "./use-role";
export { GlobalFirmHydrator } from "./components/global-firm-hydrator";
export { RoleGuard } from "./components/role-guard";
export { InviteClientForm } from "./components/invite-client-form";

// Pure RBAC utilities (client + server safe)
export { hasRole, OWNER_STAFF, ALL_ROLES, isValidFirmRole } from "./rbac";

