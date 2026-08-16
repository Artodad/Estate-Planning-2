"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ErrorCallout } from "@/components/ui/callouts";
import { useRole, OWNER_STAFF } from "@/features/auth";
import { RoleGuard } from "@/features/auth/components/role-guard";
import type { MockClient, ClientFilter } from "../../types";
import {
  MOCK_CLIENTS,
  filterMockClients,
  normalizePrismaClientToMock,
} from "./MockClientData";
import { ClientFilters } from "./ClientFilters";
import { ClientsTable } from "./ClientsTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  startIntakeSession,
  createClientForCurrentFirm,
  generateFullPlanPackageForIntake,
  getPackageTemplatesForCurrentFirm,
  type CreateClientInput,
} from "@/features/dashboard/server/actions";

/**
 * Props for ClientsList (D integration).
 * initialRealClients: raw rows from the server action (getClientsForCurrentFirm).
 * When present and non-empty, they are normalized to MockClient shape for
 * zero-disruption reuse of table/filters/dialog. Banner and counts adapt.
 */
interface ClientsListProps {
  initialRealClients?: any[];
}

/**
 * ClientsList
 *
 * Search + filters + table + detail dialog for the Clients section.
 * Real firm rows when provided; otherwise labeled sample matters.
 * RoleGuard + start-intake / create-client / generate wiring unchanged.
 */
export function ClientsList({ initialRealClients = [] }: ClientsListProps) {
  const { isHydrated, canManageClients } = useRole();

  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<ClientFilter>("all");
  const [actionFeedback, setActionFeedback] = useState<{
    action: string;
    clientName: string;
  } | null>(null);

  // Real create client dialog state (additive — scaffold infrastructure untouched)
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createForm, setCreateForm] = useState({
    displayName: "",
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
    notes: "",
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Wave B (Phase 6) — Generation loading state for real "Generate Full Plan" paths.
  // Addresses the research finding that ClientsList generate had no isGenerating affordance
  // while the package action can take many seconds. Mirrors the stronger pattern in client detail.
  const [isGenerating, setIsGenerating] = useState(false);

  // Real package generation success state (Phase 5) — additive, shows immediate download links for live data
  const [lastRealPackage, setLastRealPackage] = useState<null | {
    fileKey: string;
    clientName: string;
    documentCount: number;
    manifest: Array<{ documentType: string; individualFileKey: string }>;
  }>(null);

  // D integration: prefer real firm-scoped data (normalized for compat) when provided
  // and non-empty. Falls back cleanly to the full mock set. All downstream components
  // (table, filters, dialog) receive the MockClient shape they expect — zero breakage.
  const isUsingRealData = Array.isArray(initialRealClients) && initialRealClients.length > 0;
  const baseClients = isUsingRealData
    ? initialRealClients.map(normalizePrismaClientToMock)
    : MOCK_CLIENTS;

  const filteredClients = filterMockClients(baseClients, searchTerm, activeFilter);

  const router = useRouter();

  const handleAction = async (action: string, client: MockClient) => {
    setActionFeedback({ action, clientName: client.name });
    setTimeout(() => setActionFeedback(null), 5000);

    // === ADDITIVE REAL WIRING (Phase 3 D) for "Start / Resume Intake" only ===
    // - Uses existing startIntakeSession action (which does RBAC, firm scoping, AuditLog "intake.started")
    // - For real clients (non-mock ids): prefers latest existing session from the raw data, else starts one.
    // - Then navigates to the real /dashboard/intakes/[intakeId] wizard route.
    // - Mock clients and all other actions (Generate etc.) remain pure no-op + banner.
    if (action.includes("Intake")) {
      if (isUsingRealData) {
        try {
          const rawClient = initialRealClients.find((r: any) => r && r.id === client.id);
          const sessions = (rawClient?.intakeSessions ?? []) as any[];
          let targetSessionId: string | null = sessions.length > 0 ? sessions[0].id : null;

          if (!targetSessionId) {
            // No existing session for this real client → start one (returns enriched)
            const started = await startIntakeSession(client.id);
            if (started && "success" in started && started.success && started.data?.id) {
              targetSessionId = started.data.id;
            }
          }

          if (targetSessionId) {
            // Launch the real QuestionnaireWizard with loaded session data + onPersist persistence
            router.push(`/dashboard/intakes/${targetSessionId}`);
            // Banner remains visible (from the setActionFeedback above) for full transparency
          }
        } catch (err) {
          // Non-fatal: real launch failed, user still sees the SCAFFOLD feedback banner
          // (existing behavior). They can retry or use other paths.
          console.warn("[ClientsList] Real intake launch failed (non-fatal):", err);
        }
      }
      // For mock clients: do nothing extra — pure scaffold feedback as before.
    }

    // === REAL "GENERATE FULL PLAN" WIRING (Phase 5) for live DB-backed clients ===
    // Triggered by the existing "Generate Documents" / "Generate Full Document Package" buttons
    // when the row comes from real Prisma data (isUsingRealData + non-mock id heuristic).
    // Uses the dynamic template resolver (getPackageTemplatesForCurrentFirm) + thin package action.
    // On success: stores lastRealPackage for immediate download links via the live /api/documents/download route.
    // All mock rows and non-generate actions remain 100% scaffold (existing banner + no-op).
    if (action.includes("Generate") || action.includes("Full Plan") || action.includes("Full Document Package")) {
      if (isUsingRealData) {
        setIsGenerating(true);
        try {
          const rawClient = initialRealClients.find((r: any) => r && r.id === client.id);
          const sessions = (rawClient?.intakeSessions ?? []) as any[];
          const targetIntakeId: string | null = sessions.length > 0 ? sessions[0].id : null;

          if (!targetIntakeId) {
            setActionFeedback({
              action: "Generate failed — start/complete an intake first for this client",
              clientName: client.name,
            });
            setIsGenerating(false);
            return;
          }

          // Resolve available templates (now supports partial sets — you don't need all 8)
          const tplRes = await getPackageTemplatesForCurrentFirm();
          if ("error" in tplRes) {
            setActionFeedback({
              action: `Generate failed: ${tplRes.error}`,
              clientName: client.name,
            });
            setIsGenerating(false);
            return;
          }

          const pkgRes = await generateFullPlanPackageForIntake({
            intakeId: targetIntakeId,
            templates: tplRes.templates,
          });

          if ("error" in pkgRes) {
            toast.error(`Generate failed: ${pkgRes.error}`);
            setActionFeedback({
              action: `Generate failed: ${pkgRes.error}`,
              clientName: client.name,
            });
            setIsGenerating(false);
            return;
          }

          // Real success — store for download UI (additive, below the feedback banner)
          setLastRealPackage({
            fileKey: pkgRes.package.fileKey,
            clientName: client.name,
            documentCount: pkgRes.package.documentCount,
            manifest: pkgRes.package.manifest,
          });

          toast.success(`Full estate plan package generated for ${client.name} (${pkgRes.package.documentCount} documents)`);

          setActionFeedback({
            action: `Generated ${pkgRes.package.documentCount}-document estate plan package`,
            clientName: client.name,
          });
          setTimeout(() => setActionFeedback(null), 8000);

          setIsGenerating(false);
          return; // real path handled; do not fall through to scaffold banner
        } catch (err) {
          console.warn("[ClientsList] Real generate failed (non-fatal):", err);
          // fall through to existing scaffold banner for visibility during transition
          setIsGenerating(false);
        }
      }
      // Mock rows or non-real path: existing scaffold feedback banner already set at top of handleAction
    }
  };

  // === REAL CREATE CLIENT HANDLER (Phase 5 Clients CRUD slice) ===
  // Additive only. Uses existing createClientForCurrentFirm (Zod + RBAC + firmId from auth + Audit "client.created").
  // On success: router.refresh() so the RSC page re-fetches real data; new row appears via normalizePrismaClientToMock.
  // Re-uses the existing actionFeedback banner for consistent UX during transition.
  const handleCreateRealClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      const payload: CreateClientInput = {
        displayName: createForm.displayName.trim(),
        email: createForm.email.trim(),
        firstName: createForm.firstName.trim() || undefined,
        lastName: createForm.lastName.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      };

      const result = await createClientForCurrentFirm(payload);

      if ("error" in result) {
        setCreateError(result.error || "Failed to create client.");
        return;
      }

      // Success — real client persisted for the current firm
      const newName =
        result.data?.displayName ||
        `${result.data?.firstName ?? ""} ${result.data?.lastName ?? ""}`.trim() ||
        payload.displayName;

      setActionFeedback({
        action: "Created real client",
        clientName: newName,
      });
      setTimeout(() => setActionFeedback(null), 6000);

      // Wave B: Also surface via sonner (modern toast) for better UX
      toast.success(`Client created: ${newName}`, {
        description: "The client is now available for intakes and document generation.",
      });

      // Close + reset
      setShowCreateDialog(false);
      setCreateForm({
        displayName: "",
        email: "",
        firstName: "",
        lastName: "",
        phone: "",
        notes: "",
      });

      // Re-fetch server data (RSC re-runs getClientsForCurrentFirm → live list updates)
      router.refresh();
    } catch (err) {
      console.error("[ClientsList] Real client create failed:", err);
      setCreateError("Unexpected error creating client. Please try again.");
    } finally {
      setCreateLoading(false);
    }
  };

  // While hydrating role, show skeleton table (prevents flash)
  if (!isHydrated) {
    return (
      <div className="space-y-4">
        <div className="h-9 w-full animate-pulse rounded bg-muted" />
        <div className="h-64 w-full animate-pulse rounded border bg-muted/30" />
      </div>
    );
  }

  // Belt-and-suspenders client-side role guard (page already enforces via requireRole)
  if (!canManageClients()) {
    return (
      <div className="rounded-md border p-6 text-sm text-muted-foreground">
        This section is restricted to firm owners and staff.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isGenerating && (
        <div role="status" className="rounded-md border bg-muted/40 p-3 text-sm">
          <strong>Generating estate plan package…</strong> This can take a moment. Keep this tab open.
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Client matters</h2>
          <p className="text-sm text-muted-foreground">
            {isUsingRealData
              ? `${baseClients.length} ${baseClients.length === 1 ? "client" : "clients"}`
              : "Sample matters — create a client to start a real intake."}
          </p>
        </div>

        <RoleGuard allowed={OWNER_STAFF}>
          <Button
            onClick={() => {
              setCreateError(null);
              setShowCreateDialog(true);
            }}
            className="w-full sm:w-auto"
          >
            + New Client
          </Button>
        </RoleGuard>
      </div>

      {actionFeedback && (
        <div
          role="status"
          className="rounded-md border bg-muted/40 p-3 text-sm"
        >
          <span className="font-medium">{actionFeedback.action}</span>
          {" for "}
          <span className="font-medium">{actionFeedback.clientName}</span>.
          {!isUsingRealData && (
            <span className="text-muted-foreground">
              {" "}
              Sample record — create a client to run this on a real matter.
            </span>
          )}
        </div>
      )}

      {/* Real package generation success + immediate downloads (Phase 5, additive, live data only) */}
      {lastRealPackage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <div className="font-semibold">
            ✓ Full Estate Plan Package generated for {lastRealPackage.clientName} ({lastRealPackage.documentCount} documents)
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a
              href={`/api/documents/download?fileKey=${encodeURIComponent(lastRealPackage.fileKey)}`}
              className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              download
            >
              Download Full ZIP
            </a>
            {lastRealPackage.manifest?.slice(0, 4).map((entry, idx) => (
              <a
                key={idx}
                href={`/api/documents/download?fileKey=${encodeURIComponent(entry.individualFileKey)}`}
                className="inline-flex items-center rounded border border-emerald-200 bg-white/70 px-2 py-0.5 text-xs hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40"
                download
              >
                {entry.documentType.replace(/_/g, " ")}
              </a>
            ))}
            {lastRealPackage.manifest && lastRealPackage.manifest.length > 4 && (
              <span className="text-xs text-emerald-600">+{lastRealPackage.manifest.length - 4} more</span>
            )}
          </div>
          <button
            type="button"
            className="mt-2 text-xs underline opacity-80 hover:opacity-100"
            onClick={() => setLastRealPackage(null)}
          >
            Dismiss
          </button>
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
            Every document is watermarked DRAFT. For a PDF, open the Word file and export from Word or LibreOffice.
          </p>
        </div>
      )}

      {/* Search + Filters (client state) */}
      <ClientFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        resultCount={filteredClients.length}
        totalCount={baseClients.length}
      />

      {/* The star of the show: the table */}
      <ClientsTable clients={filteredClients} onAction={handleAction} />

      <p className="border-t pt-4 text-xs text-muted-foreground">
        View opens the matter summary. Intake and Generate stay on this list for owners and staff.
      </p>

      {/* Real New Client Dialog (Phase 5 CRUD) — controlled, additive only */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => {
        setShowCreateDialog(open);
        if (!open) {
          setCreateError(null);
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Client / Matter</DialogTitle>
            <DialogDescription>
              Visible only to your firm. Intakes and drafts for this matter stay scoped to this organization.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRealClient} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="displayName">Display Name *</Label>
                <Input
                  id="displayName"
                  required
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                  placeholder="e.g. Smith Family Revocable Living Trust"
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="email">Primary Email *</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="client@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={createForm.firstName}
                  onChange={(e) => setCreateForm({ ...createForm, firstName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={createForm.lastName}
                  onChange={(e) => setCreateForm({ ...createForm, lastName: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="notes">Matter Notes (internal)</Label>
                <Input
                  id="notes"
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="Key facts, referrals, special instructions..."
                  className="mt-1"
                />
              </div>
            </div>

            {createError && (
              <ErrorCallout>{createError}</ErrorCallout>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={createLoading}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={createLoading || !createForm.displayName || !createForm.email}>
                {createLoading ? "Creating..." : "Create Client"}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground">
              Required fields: display name and email.
            </p>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
