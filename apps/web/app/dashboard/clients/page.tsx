import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { OWNER_STAFF } from "@/features/auth";

// The real Clients implementation (highest priority per Design Document §3)
import { ClientsList } from "@/features/dashboard/components/clients/ClientsList";

// Phase 5: real Client data support via protected server actions (firm-scoped + RBAC)
import { getClientsForCurrentFirm } from "@/features/dashboard/server/actions";

/**
 * /dashboard/clients
 *
 * CLIENTS SECTION — Sub-agent C (Key Sections Implementation)
 *
 * Thin Server Component wrapper:
 * - Re-validates auth + requires OWNER_STAFF (belt-and-suspenders on top of
 *   sidebar nav filtering via useDashboardNav + layout).
 * - Renders the full interactive ClientsList (search, filters, table, dialogs, mocks).
 *
 * All heavy lifting (mock data, state, RoleGuard usage inside) lives in the feature.
 * This page stays a pure server boundary for security.
 *
 * Demo / Mock mode — shows fictional records when no real clients exist for the firm.
 */
export default async function ClientsPage() {
  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  // Server enforcement (even if sidebar hides the link for clients)
  await requireRole([...OWNER_STAFF], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "Clients section is available to owners and staff only.",
  });

  // D integration: fetch real Clients via the thin protected server action.
  // - Action internally does checkOwnerOrStaff() + getCurrentAuthContext + firmId scoping via helpers.
  // - Graceful: if no real rows for this firm (or error), we pass undefined and UI falls back to mocks
  //   with clear SCAFFOLD messaging (never removes the mock infra).
  // - AuditLog "clients.listed" emitted inside action for real path.
  let realClients: any[] | undefined = undefined;
  let fetchNote = "";
  try {
    const result = await getClientsForCurrentFirm();
    if (result && "success" in result && result.success && result.clients?.length) {
      realClients = result.clients;
      fetchNote = ` (live: ${result.count} for firm ${result.firmId?.slice(0, 8)}...)`;
    } else if ("error" in result) {
      fetchNote = ` (real fetch error: ${result.error}; using mocks)`;
    }
  } catch (e) {
    // Never break the page; fall back to excellent mocks
    fetchNote = " (real data fetch threw; graceful mock fallback active)";
  }

  return (
    <div className="space-y-6">
      {/* The star implementation: searchable table + filters + detail dialogs + role-aware scaffolds.
          Now receives real data when available for the authenticated firm. */}
      <ClientsList initialRealClients={realClients} />
      {/* Subtle dev-only transparency (additive; does not alter UX for normal use) */}
      {fetchNote && (
        <p className="text-[10px] text-muted-foreground font-mono opacity-60">
          Data source note: {fetchNote}
        </p>
      )}
    </div>
  );
}
