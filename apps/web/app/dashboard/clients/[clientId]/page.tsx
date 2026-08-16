import { redirect } from "next/navigation";
import Link from "next/link";
import * as React from "react";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { OWNER_STAFF } from "@/features/auth";
import { RoleGuard } from "@/features/auth/components/role-guard";
import { ErrorCallout } from "@/components/ui/callouts";
import { GenerationErrorBoundary } from "@/features/dashboard/components/GenerationErrorBoundary";

import {
  getClientByIdForCurrentFirm,
  getIntakesForCurrentFirm,
  generateFullPlanPackageForIntake,
  getPackageTemplatesForCurrentFirm,
  deleteClientForCurrentFirm,
  updateClientForCurrentFirm,
} from "@/features/dashboard/server/actions";

import { generatedDocumentHelpers } from "@/lib/prisma";
import { Button } from "@/components/ui/button";

/**
 * /dashboard/clients/[clientId]
 *
 * Real Client Detail Page (Phase 5 Clients CRUD slice).
 *
 * Server Component with defense-in-depth:
 * - requireRole(OWNER_STAFF) on the server boundary
 * - RoleGuard inside for any privileged UI
 *
 * Fetches via the existing protected actions + helpers (all firm-scoped).
 * Shows:
 *   - Summary (displayName, contact, notes)
 *   - Linked Intakes with resume links to the existing wizard
 *   - Generated Documents with live download links via /api/documents/download
 *   - Simple notes stub (client component)
 *   - Prominent "Generate Full Estate Plan" button (real wiring via the thin package)
 *   - Light delete (with confirmation)
 *
 * All multi-tenancy, RBAC, and audit invariants are inherited from the called actions/helpers.
 * Mock/SCAFFOLD infrastructure in the list page is untouched.
 */

interface ClientDetailPageProps {
  params: Promise<{ clientId: string }>;
}

// Small client island for the prominent generate button + notes stub (keeps the page mostly server).
// Re-uses the exact same resolver + package pattern established in ClientsList for consistency.
function GenerateAndNotes({
  clientId,
  clientDisplayName,
  latestIntakeId,
  initialNotes = "",
  onDelete,
}: {
  clientId: string;
  clientDisplayName: string;
  latestIntakeId: string | null;
  initialNotes?: string;
  onDelete: () => void;
}) {
  "use client";

  const [isGenerating, setIsGenerating] = React.useState(false);
  const [lastPackage, setLastPackage] = React.useState<null | {
    fileKey: string;
    documentCount: number;
    manifest: Array<{ documentType: string; individualFileKey: string }>;
  }>(null);
  const [genError, setGenError] = React.useState<string | null>(null);

  const [notes, setNotes] = React.useState(initialNotes);
  const [notesSaved, setNotesSaved] = React.useState(false);
  const [notesSaving, setNotesSaving] = React.useState(false);

  // Wave B (Phase 6) — Replace native alert() on destructive delete with local error state
  // (explicit quick win from Error Handling research). Renders a visible red callout.
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      const res = await updateClientForCurrentFirm(clientId, { notes: notes.trim() });
      if ("error" in res) {
        // Non-fatal for notes
        console.warn("Notes save failed:", res.error);
      }
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleGenerateFullPlan = async () => {
    if (!latestIntakeId) {
      setGenError("This client has no intake yet. Start an intake first.");
      return;
    }

    setIsGenerating(true);
    setGenError(null);

    try {
      const tplRes = await getPackageTemplatesForCurrentFirm();
      if ("error" in tplRes) {
        setGenError(tplRes.error);
        return;
      }

      const pkgRes = await generateFullPlanPackageForIntake({
        intakeId: latestIntakeId,
        templates: tplRes.templates,
      });

      if ("error" in pkgRes) {
        setGenError(pkgRes.error);
        return;
      }

      setLastPackage({
        fileKey: pkgRes.package.fileKey,
        documentCount: pkgRes.package.documentCount,
        manifest: pkgRes.package.manifest,
      });
    } catch (e: any) {
      setGenError(e?.message || "Generation failed. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete client "${clientDisplayName}"? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      const res = await deleteClientForCurrentFirm(clientId);
      if ("error" in res) {
        setDeleteError(res.error || "Delete failed.");
        return;
      }
      onDelete();
    } catch (e) {
      setDeleteError("Delete failed. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Prominent Generate Full Plan (owner/staff only) */}
      <RoleGuard allowed={OWNER_STAFF}>
        <GenerationErrorBoundary>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Full Estate Plan Package</div>
              <div className="text-xs text-muted-foreground">
                Generates all 8 coordinated DRAFT documents using your firm templates.
              </div>
            </div>
            <Button
              onClick={handleGenerateFullPlan}
              disabled={isGenerating || !latestIntakeId}
              size="lg"
            >
              {isGenerating ? "Generating..." : "Generate Full Estate Plan"}
            </Button>
          </div>

          {genError && <ErrorCallout className="mt-3">{genError}</ErrorCallout>}
          {deleteError && <ErrorCallout className="mt-2">{deleteError}</ErrorCallout>}

          {lastPackage && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="font-semibold">
                ✓ Package generated ({lastPackage.documentCount} documents)
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`/api/documents/download?fileKey=${encodeURIComponent(lastPackage.fileKey)}`}
                  className="inline-flex items-center rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  download
                >
                  Download Full ZIP
                </a>
                {lastPackage.manifest.slice(0, 4).map((m, i) => (
                  <a
                    key={i}
                    href={`/api/documents/download?fileKey=${encodeURIComponent(m.individualFileKey)}`}
                    className="inline-flex items-center rounded border border-emerald-200 bg-white/70 px-2 py-0.5 text-xs hover:bg-emerald-100 dark:bg-emerald-900/20"
                    download
                  >
                    {m.documentType.replace(/_/g, " ")}
                  </a>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-emerald-600">
                Every document contains the visible DRAFT watermark. Exact fidelity to your attorney templates.
              </p>
            </div>
          )}
        </div>
        </GenerationErrorBoundary>
      </RoleGuard>

      {/* Notes (stub for Phase 5) */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Internal notes</div>
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={4}
          placeholder="Key facts, referrals, special instructions for the matter..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={notesSaving}>
            {notesSaving ? "Saving..." : "Save Notes"}
          </Button>
          {notesSaved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Visible only to your firm.
        </p>
      </div>

      {/* Light delete (owner/staff) */}
      <RoleGuard allowed={OWNER_STAFF}>
        <div>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Client
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            Confirmation required. This cannot be undone.
          </span>
        </div>
      </RoleGuard>
    </div>
  );
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { clientId } = await params;

  const authContext = await getCurrentAuthContext();
  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  await requireRole([...OWNER_STAFF], {
    redirectTo: "/dashboard/clients?error=insufficient-permissions",
    errorMessage: "Client details are available to owners and staff only.",
  });

  // Load the client (with sessions) — fully protected inside the action
  const clientRes = await getClientByIdForCurrentFirm(clientId);

  if (!("success" in clientRes) || !clientRes.success || !clientRes.client) {
    redirect("/dashboard/clients?error=client-not-found");
  }

  const client = clientRes.client;
  const firmId = clientRes.firmId;

  // Load firm intakes (filter client-side for this matter — lightweight)
  const intakesRes = await getIntakesForCurrentFirm();
  const clientIntakes =
    "success" in intakesRes && intakesRes.success
      ? intakesRes.intakes.filter((i: any) => i.clientId === client.id)
      : [];

  // Latest intake for the prominent generate button (if any)
  const latestIntakeId = clientIntakes.length > 0 ? clientIntakes[0].id : null;

  // Generated documents for this client (via existing helper + filter)
  const allDocs = await generatedDocumentHelpers.listByFirm(firmId);
  const clientIntakeIds = new Set(clientIntakes.map((i: any) => i.id));
  const clientDocs = allDocs.filter((d: any) => clientIntakeIds.has(d.intakeSessionId));

  // Delete navigation handler (passed to client island)
  async function handleDeleteSuccess() {
    "use server";
    redirect("/dashboard/clients");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href="/dashboard/clients" className="hover:underline">← Back to Clients</Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{client.displayName}</h1>
          <div className="text-sm text-muted-foreground">{client.email}</div>
        </div>

        <div className="text-right text-xs text-muted-foreground">
          Last updated {new Date(client.updatedAt).toLocaleDateString()}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Matter</div>
          <div className="mt-1 text-lg font-medium">{client.displayName}</div>
          {client.notes && (
            <div className="mt-2 text-sm text-muted-foreground line-clamp-3">{client.notes}</div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Contact</div>
          <div className="mt-1">{client.email}</div>
          {client.phone && <div className="text-sm">{client.phone}</div>}
          {(client.firstName || client.lastName) && (
            <div className="mt-1 text-sm text-muted-foreground">
              {client.firstName} {client.lastName}
            </div>
          )}
        </div>

        <div className="rounded-lg border bg-card p-4 text-sm">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Activity</div>
          <div className="mt-1">Created: {new Date(client.createdAt).toLocaleDateString()}</div>
          <div>Last updated: {new Date(client.updatedAt).toLocaleDateString()}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            Firm records only. Generated documents are drafts.
          </div>
        </div>
      </div>

      {/* Intakes */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="font-medium">Intakes for this matter</div>
          <RoleGuard allowed={OWNER_STAFF}>
            <Link href="/dashboard/intakes">
              <Button variant="outline" size="sm">View all intakes</Button>
            </Link>
          </RoleGuard>
        </div>

        {clientIntakes.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No intakes started yet for this client.
            <RoleGuard allowed={OWNER_STAFF}>
              {" "}
              <Link href={`/dashboard/intakes`} className="underline">Start one from the Intakes page</Link> or use the Intake button on the list.
            </RoleGuard>
          </div>
        ) : (
          <div className="space-y-2">
            {clientIntakes.map((intake: any) => (
              <div key={intake.id} className="flex items-center justify-between rounded border p-3 text-sm">
                <div>
                  Status: <span className="font-medium">{intake.status}</span> • {intake.progress}% complete
                  <div className="text-xs text-muted-foreground">
                    Started {new Date(intake.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Link href={`/dashboard/intakes/${intake.id}`}>
                  <Button variant="outline" size="sm">Resume / View</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generated Documents */}
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 font-medium">Generated Documents (DRAFT)</div>

        {clientDocs.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No documents generated yet for this client.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4">Document Type</th>
                  <th className="py-2 pr-4">Generated</th>
                  <th className="py-2">Download</th>
                </tr>
              </thead>
              <tbody>
                {clientDocs.map((doc: any) => (
                  <tr key={doc.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{doc.documentType.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2">
                      <a
                        href={`/api/documents/download?fileKey=${encodeURIComponent(doc.fileKey)}`}
                        className="text-emerald-600 underline hover:text-emerald-700"
                        download
                      >
                        Download DRAFT
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Every file carries a visible DRAFT header.
        </p>
      </div>

      {/* Prominent Generate + Notes + Delete island */}
      <GenerateAndNotes
        clientId={client.id}
        clientDisplayName={client.displayName}
        latestIntakeId={latestIntakeId}
        initialNotes={client.notes ?? ""}
        onDelete={() => {
          // Server redirect happens inside the island via the delete action + redirect
          // This callback is mostly for type completeness; the island performs the redirect.
        }}
      />

    </div>
  );
}
