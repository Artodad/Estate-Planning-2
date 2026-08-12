/**
 * Mock Client Data for Dashboard Clients Section (+ real data normalizer)
 *
 * DEMO / MOCK DATA — FOR UI DEVELOPMENT & NON-SEEDED FIRMS
 *
 * This file provides realistic but entirely fictional estate planning client records
 * for building, demonstrating, and exploring the Clients list/table, filters, search,
 * badges, detail dialog, and role-aware action buttons.
 *
 * - 7 realistic California estate planning clients.
 * - Used in the UI layer when no real Prisma data exists for the current firm.
 * - All actions on mock rows surface clear demo messaging.
 *
 * The normalizePrismaClientToMock bridge allows the **exact same** UI to render both
 * real DB-backed clients and these mock records. The dual real/mock infrastructure is
 * intentionally preserved so the great demo experience always works.
 *
 * This is now a permanent, supported demo mode — not temporary scaffolding.
 */

import type { MockClient, DocumentStatus, ClientFilter } from "../../types";

/**
 * Realistic mock clients (7 total).
 * Dates are recent relative to 2026-05-26 for "last activity" demo.
 * All names/emails fictional; any resemblance is coincidental.
 */
export const MOCK_CLIENTS: readonly MockClient[] = [
  {
    id: "cli_001",
    name: "Elena M. Vargas Revocable Living Trust",
    email: "elena.vargas@familytrust.example",
    intakeProgress: 95,
    documentsStatus: "ready",
    lastActivityISO: "2026-05-24T14:30:00.000Z",
    notes: "Primary residence in San Francisco; community property with spouse. Minor child provisions included. Ready for final review and funding instructions.",
    assignedAttorney: "You",
  },
  {
    id: "cli_002",
    name: "Robert Chen & Lisa Patel (Joint Estate Plan)",
    email: "robert.chen+estate@techpartners.example",
    intakeProgress: 62,
    documentsStatus: "intake-incomplete",
    lastActivityISO: "2026-05-22T09:15:00.000Z",
    notes: "High net worth couple; significant stock options + rental properties. Awaiting beneficiary designations and specific bequest details.",
    assignedAttorney: "You",
  },
  {
    id: "cli_003",
    name: "The Morrison Family Trust (David & Susan)",
    email: "dmorrison@legacyholdings.example",
    intakeProgress: 100,
    documentsStatus: "pending-regeneration",
    lastActivityISO: "2026-05-19T16:45:00.000Z",
    notes: "Pour-over will + RLT complete. Recent asset addition (vacation home) requires updated Schedule A and funding memo.",
    assignedAttorney: "Sarah Kline, Esq.",
  },
  {
    id: "cli_004",
    name: "Aisha K. Thompson (Single Estate Plan)",
    email: "aisha@thompsonadvisors.example",
    intakeProgress: 38,
    documentsStatus: "no-documents",
    lastActivityISO: "2026-05-25T11:05:00.000Z",
    notes: "New client via referral. Young professional with real estate + retirement accounts. Intake paused at healthcare directive section.",
    assignedAttorney: "You",
  },
  {
    id: "cli_005",
    name: "Hector & Maria Ruiz Community Property Trust",
    email: "ruiz.family@californiahomes.example",
    intakeProgress: 78,
    documentsStatus: "ready",
    lastActivityISO: "2026-05-20T08:20:00.000Z",
    notes: "Long-time clients. 2023 plan update in progress. Two adult children; specific personal property memo requested.",
    assignedAttorney: "Sarah Kline, Esq.",
  },
  {
    id: "cli_006",
    name: "Dr. Priya Nair, MD (Physician Estate Plan)",
    email: "priya.nair@medicalpartners.example",
    intakeProgress: 0,
    documentsStatus: "no-documents",
    lastActivityISO: "2026-05-18T13:50:00.000Z",
    notes: "Initial consultation completed. High-complexity: malpractice tail coverage, 529 plans for nieces/nephews, charitable remainder trust interest.",
    assignedAttorney: "You",
  },
  {
    id: "cli_007",
    name: "William J. Foster Revocable Trust (Widower)",
    email: "william.foster@retiredexec.example",
    intakeProgress: 87,
    documentsStatus: "ready",
    lastActivityISO: "2026-05-23T19:40:00.000Z",
    notes: "Straightforward plan with large charitable bequest to university. Certificate of Trust requested for bank accounts.",
    assignedAttorney: "Sarah Kline, Esq.",
  },
] as const;

/**
 * Helper: returns human-friendly label for document status.
 */
export function getDocumentsStatusLabel(status: DocumentStatus): string {
  switch (status) {
    case "ready":
      return "Documents Ready";
    case "pending-regeneration":
      return "Pending Regeneration";
    case "no-documents":
      return "No Documents";
    case "intake-incomplete":
      return "Intake Incomplete";
    default:
      return "Unknown";
  }
}

/**
 * Helper: Tailwind class for status badge coloring (professional attorney palette).
 */
export function getDocumentsStatusClass(status: DocumentStatus): string {
  switch (status) {
    case "ready":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200";
    case "pending-regeneration":
      return "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200";
    case "no-documents":
      return "bg-slate-100 text-slate-700 dark:bg-slate-950/60 dark:text-slate-300 border-slate-200";
    case "intake-incomplete":
      return "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/**
 * Client-side filter + search for mock clients.
 * Pure function — easy to test and reuse.
 */
export function filterMockClients(
  clients: readonly MockClient[],
  searchTerm: string,
  filter: ClientFilter
): MockClient[] {
  const term = searchTerm.trim().toLowerCase();

  return clients.filter((client) => {
    // Search across name + email
    const matchesSearch =
      !term ||
      client.name.toLowerCase().includes(term) ||
      client.email.toLowerCase().includes(term);

    if (!matchesSearch) return false;

    // Filter by status category
    switch (filter) {
      case "all":
        return true;
      case "in-progress":
        return client.intakeProgress > 0 && client.intakeProgress < 100;
      case "ready":
        return client.documentsStatus === "ready";
      case "pending":
        return (
          client.documentsStatus === "pending-regeneration" ||
          client.documentsStatus === "intake-incomplete" ||
          client.intakeProgress < 100
        );
      default:
        return true;
    }
  });
}

/**
 * Format relative time for "Last Activity".
 * Uses native Date; in real app would import { formatDistanceToNow } from "date-fns".
 * For scaffold we keep it dependency-light but realistic.
 */
export function formatLastActivity(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date("2026-05-26T12:00:00.000Z"); // Fixed "today" for deterministic demo
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return "1 week ago";
  return `${Math.floor(diffDays / 7)} weeks ago`;
}

/**
 * Simple progress color helper for intake bar (optional visual).
 */
export function getIntakeProgressClass(progress: number): string {
  if (progress >= 90) return "bg-emerald-500";
  if (progress >= 60) return "bg-amber-500";
  if (progress > 0) return "bg-blue-500";
  return "bg-slate-300";
}

/**
 * Normalizer (Phase 2 D integration): safely maps a real Prisma `Client` row
 * (with `intakeSessions` included from the C helpers) into the existing MockClient
 * contract.
 *
 * This enables the entire ClientsTable + ClientFilters + ClientDetailDialog + filter
 * logic to continue working **unchanged** during the transition. The excellent mock
 * infrastructure is **preserved** (not removed).
 *
 * Derivation rules (deterministic, conservative):
 * - name <- displayName (primary for trusts/matters)
 * - progress <- latest intakeSession.progress (or 0)
 * - documentsStatus <- heuristic from progress (ready | intake-incomplete | no-documents)
 * - lastActivity <- most recent session/client timestamp
 * - notes preserved for detail dialog
 *
 * SCAFFOLD NOTE: When real data is present we still surface "LIVE + SCAFFOLD actions"
 * messaging in the list. Full cutover (new types, no normalize) is for later phases
 * after E2E + more dashboard wiring.
 */
export function normalizePrismaClientToMock(prismaClient: any): MockClient {
  const sessions = (prismaClient?.intakeSessions ?? []) as any[];
  const latest = sessions.length > 0 ? sessions[0] : null;

  const progress = typeof latest?.progress === "number" ? latest.progress : 0;

  let documentsStatus: DocumentStatus = "no-documents";
  if (progress >= 100) {
    documentsStatus = "ready";
  } else if (progress > 0) {
    documentsStatus = "intake-incomplete";
  }

  const lastDate =
    latest?.createdAt ||
    latest?.updatedAt ||
    prismaClient?.createdAt ||
    prismaClient?.updatedAt ||
    new Date();

  const lastActivityISO = new Date(lastDate).toISOString();

  const derivedName =
    prismaClient?.displayName ||
    `${prismaClient?.firstName ?? ""} ${prismaClient?.lastName ?? ""}`.trim() ||
    "Unnamed Client";

  return {
    id: prismaClient?.id ?? `real_${Date.now()}`,
    name: derivedName,
    email: prismaClient?.email ?? "unknown@example",
    intakeProgress: progress,
    documentsStatus,
    lastActivityISO,
    notes: prismaClient?.notes ?? undefined,
    assignedAttorney: "You", // Scaffold attribution (real assignment via User relation is future)
  };
}
