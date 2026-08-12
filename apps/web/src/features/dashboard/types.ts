/**
 * Dashboard Feature Types
 *
 * @fileoverview Types for the core dashboard layout + navigation (Sub-agent B).
 * These support the role-aware sidebar and shell infrastructure.
 *
 * SCAFFOLD / INFRASTRUCTURE — Part of Dashboard Expansion (Phase D.2).
 * This will grow in Phase D.3+ and when real models land in Phase 2.
 */

import type { LucideIcon } from "lucide-react";

import type { FirmRole } from "@/features/auth";

/**
 * A single top-level dashboard navigation item.
 * Used by useDashboardNav + AppSidebar / Mobile drawer.
 */
export interface DashboardNavItem {
  href: string; // Next.js route, e.g. "/dashboard" or "/dashboard/clients"
  label: string;
  icon: LucideIcon;
  /** Roles permitted to see this nav item (use OWNER_STAFF or ["owner"] etc.) */
  allowed: readonly FirmRole[];
  /** Optional description for tooltip / aria-label */
  description?: string;
}

/**
 * Document status for a client matter (scaffold values only).
 */
export type DocumentStatus = "ready" | "pending-regeneration" | "no-documents" | "intake-incomplete";

/**
 * Full mock client record for the Clients section UI (Phase D.3 / pre-Phase 2).
 *
 * SCAFFOLD / MOCK DATA — FOR UI DEVELOPMENT ONLY
 * This interface + data will be replaced by real Prisma Client + IntakeSession models in Phase 2.
 * Never persist, never send to real APIs, never treat as production records.
 */
export interface MockClient {
  id: string;
  /** Full client / matter name (e.g. "Elena M. Vargas Revocable Living Trust") */
  name: string;
  /** Primary contact email */
  email: string;
  /** Intake questionnaire completion 0-100 */
  intakeProgress: number;
  /** Current documents package status */
  documentsStatus: DocumentStatus;
  /** ISO date string for last meaningful activity */
  lastActivityISO: string;
  /** Optional short note for detail view */
  notes?: string;
  /** Fake "assigned attorney" for realism (always the current firm user in scaffold) */
  assignedAttorney?: string;
}

/**
 * Filter options for the Clients list (client-side only).
 */
export type ClientFilter = "all" | "in-progress" | "ready" | "pending";
