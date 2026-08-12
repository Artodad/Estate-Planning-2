/**
 * Auth & Multi-Tenancy Types
 *
 * These types define the firm (organization) context that flows through
 * the application. They are the foundation for Phase 1+ multi-tenancy.
 */

/**
 * Roles within a law firm.
 * These map to Clerk Organization roles + our Prisma User.role.
 */
export type FirmRole = "owner" | "staff" | "client";

/**
 * The current firm context available throughout the app.
 * This is the primary object used for multi-tenant data scoping.
 */
export interface CurrentFirm {
  id: string | null; // Prisma Firm.id (null when a Clerk org exists but no internal Firm record has been created yet, e.g. during onboarding)
  clerkOrgId: string; // Clerk Organization ID
  name: string;
  slug: string | null;
  role: FirmRole;
}

/**
 * Combined auth context for a signed-in user.
 * This is what `useFirm()` and server helpers will expose.
 *
 * Role is authoritatively resolved in `getCurrentAuthContext` (Prisma User.role
 * preferred over Clerk orgRole mapping per ADR in Phase 1C architecture).
 */
export interface AuthContext {
  userId: string; // Clerk user ID
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  currentFirm: CurrentFirm | null;
  /**
   * Authoritative role for authorization decisions within the active firm.
   * Prefer this over `currentFirm?.role` for server-side checks (DB-sourced).
   * Populated by getCurrentAuthContext; null when no firm context.
   */
  role: FirmRole | null;
  // Future: array of all firms the user belongs to (for switching)
  memberships?: CurrentFirm[];
}
