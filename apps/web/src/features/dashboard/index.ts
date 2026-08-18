/**
 * Dashboard Feature — Public API (Sub-agent B)
 *
 * Barrel exports for the core layout infrastructure.
 * Import from here for shell + nav.
 *
 * @example
 *   import { DashboardShell } from "@/features/dashboard";
 */

export { DashboardShell } from "./components/DashboardShell";

// Re-export hook + types for advanced usage / tests
export { useDashboardNav, ALL_DASHBOARD_NAV_ITEMS } from "./hooks/useDashboardNav";
export type { DashboardNavItem, MockClient, DocumentStatus, ClientFilter } from "./types";

// Clients section (Sub-agent C priority implementation)
export { ClientsList } from "./components/clients/ClientsList";
export { ClientDetailDialog } from "./components/clients/ClientDetailDialog";

// Overview polish (Sub-agent C)
export { OverviewStats } from "./components/overview/OverviewStats";

// Shared dashboard UI primitives
export { SectionCallout } from "./components/shared/SectionCallout";
export { StatusBadge } from "./components/shared/StatusBadge";
export { GenerateTrustDraftButton } from "./components/GenerateTrustDraftButton";
export { buildGenerateTrustDraftParams, TRUST_DRAFT_DOCUMENT_TYPE } from "./components/generate-trust-draft";
export { trustDraftFromStoredDocuments } from "./components/stored-trust-draft";
export {
  punchListFromFillReport,
  resolveFillTagToMapperKey,
  existingFieldIdForMapperKey,
  punchJumpForMapperKey,
} from "./components/fill-report-punch-list";
export {
  leftoverCountFromFillReport,
  trustDraftDownloadConfirmPhrase,
} from "./components/trust-draft-download-confirm";
export { TrustDraftDownloadConfirmDialog } from "./components/TrustDraftDownloadConfirmDialog";
