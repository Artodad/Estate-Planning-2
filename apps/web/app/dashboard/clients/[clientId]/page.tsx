import { redirect } from "next/navigation";
import Link from "next/link";
import * as React from "react";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { OWNER_STAFF } from "@/features/auth";
import { RoleGuard } from "@/features/auth/components/role-guard";

import {
  getClientByIdForCurrentFirm,
  getIntakesForCurrentFirm,
} from "@/features/dashboard/server/actions";

import { leftoverCountFromFillReport } from "@/features/dashboard/components/trust-draft-download-confirm";
import { TrustDraftDocumentsDownload } from "@/features/dashboard/components/TrustDraftDocumentsDownload";
import { TrustDraftFillReport } from "@/features/dashboard/components/TrustDraftFillReport";
import { GenerateAndNotes } from "@/features/dashboard/components/GenerateAndNotes";
import { GenerateTrustDraftCta } from "@/features/dashboard/components/GenerateTrustDraftCta";
import {
  clientDetailNewestTrustDraftRow,
  clientDetailTrustDraftCtaMode,
  clientDetailTrustDraftGenerateIntakeId,
  documentsRowDownloadHref,
  documentsRowIntakeAnswers,
  documentsTrustDraftHrefPrefix,
  isHiddenEstatePlanPackageRow,
  isRevocableTrustDocumentType,
} from "@/features/dashboard/components/documents-trust-draft-row";
import { parseStoredFillReport } from "@/features/documents/fill-report";
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
 *   - Internal notes (client component)
 *   - Light delete (with confirmation)
 *
 * All multi-tenancy, RBAC, and audit invariants are inherited from the called actions/helpers.
 * Mock/SCAFFOLD infrastructure in the list page is untouched.
 */

interface ClientDetailPageProps {
  params: Promise<{ clientId: string }>;
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

  // Generated documents for this client (via existing helper + filter).
  // Hide leftover package ZIP / Full-Estate-Plan-Package rows — do not stamp-on-zip.
  const allDocs = await generatedDocumentHelpers.listByFirm(firmId);
  const clientIntakeIds = new Set(clientIntakes.map((i: any) => i.id));
  const clientDocs = allDocs.filter(
    (d: any) =>
      clientIntakeIds.has(d.intakeSessionId) && !isHiddenEstatePlanPackageRow(d.fileKey),
  );
  const trustDraftGenerateIntakeId = clientDetailTrustDraftGenerateIntakeId(
    clientIntakes,
    clientDocs,
  );
  const trustDraftCtaMode = clientDetailTrustDraftCtaMode(clientDocs);
  const newestTrustDraft = clientDetailNewestTrustDraftRow(clientDocs);

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
        {trustDraftGenerateIntakeId && trustDraftCtaMode === "generate" ? (
          <div className="mb-3">
            <GenerateTrustDraftCta intakeId={trustDraftGenerateIntakeId} mode="generate" />
          </div>
        ) : null}

        {clientDocs.length === 0 ? (
          trustDraftGenerateIntakeId && trustDraftCtaMode === "generate" ? null : (
            <div className="text-sm text-muted-foreground">
              No generated documents yet.
            </div>
          )
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
                {clientDocs.map((doc: any) => {
                  const isTrust = isRevocableTrustDocumentType(doc.documentType);
                  const intake = isTrust
                    ? clientIntakes.find((i: any) => i.id === doc.intakeSessionId) ??
                      client.intakeSessions?.find((i: { id: string }) => i.id === doc.intakeSessionId)
                    : undefined;
                  const report = isTrust ? parseStoredFillReport(doc.fillReport) : null;
                  const answers = isTrust
                    ? documentsRowIntakeAnswers(intake?.answers)
                    : null;
                  const leftoverCount = leftoverCountFromFillReport(report, answers);
                  return (
                  <React.Fragment key={doc.id}>
                  <tr className="border-b last:border-0" data-document-type={doc.documentType}>
                    <td className="py-2 pr-4 font-medium">{doc.documentType.replace(/_/g, " ")}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {doc.generatedAt ? new Date(doc.generatedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="py-2">
                      {isTrust ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {newestTrustDraft && doc.id === newestTrustDraft.id ? (
                            <GenerateTrustDraftCta
                              intakeId={doc.intakeSessionId}
                              mode="regenerate"
                            />
                          ) : null}
                          <TrustDraftDocumentsDownload
                            fileKey={doc.fileKey}
                            leftoverCount={leftoverCount}
                          />
                        </div>
                      ) : (
                        <a
                          href={documentsRowDownloadHref(doc.documentType, doc.fileKey)}
                          className="text-emerald-600 underline hover:text-emerald-700"
                          download
                        >
                          Download DRAFT
                        </a>
                      )}
                    </td>
                  </tr>
                  {report ? (
                    <tr className="border-b last:border-0">
                      <td colSpan={3} className="py-2">
                        <TrustDraftFillReport
                          report={report}
                          answers={answers}
                          hrefPrefix={documentsTrustDraftHrefPrefix(doc.intakeSessionId)}
                        />
                      </td>
                    </tr>
                  ) : null}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Every file carries a visible DRAFT header.
        </p>
      </div>

      {/* Notes + Delete island */}
      <GenerateAndNotes
        clientId={client.id}
        clientDisplayName={client.displayName}
        initialNotes={client.notes ?? ""}
        onDelete={() => {
          // Server redirect happens inside the island via the delete action + redirect
          // This callback is mostly for type completeness; the island performs the redirect.
        }}
      />

    </div>
  );
}
