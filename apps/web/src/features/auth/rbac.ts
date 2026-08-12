/**
 * Pure Role-Based Access Control (RBAC) utilities for the Estate Planning Engine.
 *
 * These functions are **completely pure** (no side effects, no I/O, no imports of
 * server-only modules or Clerk). They are safe to import from both Client Components
 * and Server Components / Server Actions.
 *
 * ## Security Model (Non-Negotiable)
 * - These are *decision* helpers only. They must **never** be the sole basis for
 *   authorization in a security-sensitive path.
 * - Every protected Server Action, Route Handler, Server Component, or layout **must**
 *   call `getCurrentAuthContext()` (or `requireRole`) which re-validates:
 *     1. Active Clerk `auth()` session + `orgId` (tenant)
 *     2. Prisma `User.role` (authoritative source per Phase 1C ADR)
 * - Client-side role (from `useRole()` / Zustand) is for **UI only** (hiding buttons,
 *   conditional rendering). It is never trusted for data access.
 * - Always combine `firmId` scoping + role check.
 *
 * See:
 * - `.cursor/rules/multi-tenancy-security.mdc`
 * - Architecture Document in `progress-phase-1c-rbac-invitations.md` §2–3
 * - `get-current-auth.ts` for the single source of truth implementation.
 */

import type { FirmRole } from "./types";

/**
 * Check whether the given role is allowed for the provided list of permitted roles.
 *
 * @param role - The user's resolved role (from AuthContext or currentFirm). May be null.
 * @param allowed - Array of roles that grant access (e.g. OWNER_STAFF).
 * @returns true if role is truthy and present in allowed list.
 *
 * @example
 *   if (!hasRole(ctx.role, ["owner", "staff"])) { return { error: "..." }; }
 */
export function hasRole(
  role: FirmRole | null | undefined,
  allowed: readonly FirmRole[]
): boolean {
  return !!role && allowed.includes(role);
}

/**
 * Common role sets for ergonomic guards.
 */
export const OWNER_STAFF: readonly FirmRole[] = ["owner", "staff"];
export const ALL_ROLES: readonly FirmRole[] = ["owner", "staff", "client"];

/**
 * Runtime type guard. Useful when reading role from untrusted sources (e.g. URL params
 * or localStorage before hydration).
 */
export function isValidFirmRole(value: unknown): value is FirmRole {
  return value === "owner" || value === "staff" || value === "client";
}

/**
 * Maps Clerk organization roles (e.g. "org:admin", "org:member") to our internal FirmRole.
 *
 * - "owner" for admin/owner variants
 * - "staff" default (for org:member and others)
 * - "client" is **never** returned by this mapper (it is set explicitly via the invitation claim flow
 *   or owner bootstrap in create-firm, which are the authoritative sources per Phase 1C RBAC ADR).
 *
 * Extracted to this pure module for reuse by:
 * - getCurrentAuthContext (read path only; role preference logic)
 * - Clerk webhook handlers (primary event-driven sync path for organizationMembership.*)
 * - The exported recovery ensureUserRecord utility (bootstrap role on create only)
 *
 * This function is pure (no I/O, safe for client and server).
 */
export function mapClerkRoleToFirmRole(clerkRole: string | null | undefined): FirmRole {
  if (!clerkRole) return "staff";

  const role = clerkRole.toLowerCase();

  if (role.includes("admin") || role.includes("owner")) {
    return "owner";
  }

  // Default for org:member and other roles
  return "staff";
}
