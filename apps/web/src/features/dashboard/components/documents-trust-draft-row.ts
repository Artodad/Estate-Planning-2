import { parseStoredFillReport } from "@/features/documents/fill-report";
import type { PartialIntake } from "@/features/intake/schemas/intake";

import { TRUST_DRAFT_DOCUMENT_TYPE } from "./generate-trust-draft";
import { leftoverCountFromFillReport, trustDraftStampedDownloadHref } from "./trust-draft-download-confirm";

export function isRevocableTrustDocumentType(documentType: string): boolean {
  return documentType === TRUST_DRAFT_DOCUMENT_TYPE;
}

/**
 * Matter-page Trust generate/regenerate intake id.
 * - No Trust: newest intake (`intakes[0]`). Other leftover .docx do not hide it.
 * - Has Trust: that newest Trust row's `intakeSessionId` — never `intakes[0]`,
 *   which may be a different session.
 */
export function clientDetailTrustDraftGenerateIntakeId(
  intakes: { id: string }[],
  docs: { documentType: string; intakeSessionId?: string }[],
): string | null {
  const newestTrust = clientDetailNewestTrustDraftRow(docs);
  if (newestTrust) {
    return newestTrust.intakeSessionId ?? null;
  }
  if (intakes.length < 1) return null;
  return intakes[0]?.id ?? null;
}

/** Above-table Generate vs in-row Regenerate. Docs are newest-first. */
export function clientDetailTrustDraftCtaMode(
  docs: { documentType: string }[],
): "generate" | "regenerate" {
  return clientDetailNewestTrustDraftRow(docs) ? "regenerate" : "generate";
}

/** Newest Trust on a newest-first list — one Regenerate per matter. */
export function clientDetailNewestTrustDraftRow<
  T extends { documentType: string },
>(docs: T[]): T | undefined {
  return docs.find((d) => isRevocableTrustDocumentType(d.documentType));
}

/**
 * Persist replace target: newest revocable_trust for this intake.
 * Other types always create. Empty list → create.
 */
export function existingRevocableTrustToReplace<
  T extends { documentType: string; intakeSessionId: string },
>(documentType: string, intakeSessionId: string, existingNewestFirst: readonly T[]): T | null {
  if (!isRevocableTrustDocumentType(documentType)) return null;
  return (
    existingNewestFirst.find(
      (d) =>
        d.intakeSessionId === intakeSessionId &&
        isRevocableTrustDocumentType(d.documentType),
    ) ?? null
  );
}

/** Session answers or null — never {}. is_ca_resident skip differs. */
export function documentsRowIntakeAnswers(answers: unknown): PartialIntake | null {
  return (answers ?? null) as PartialIntake | null;
}

/**
 * Intakes list leftover N from the row's newest Trust (include already filtered).
 * No Trust → null (quiet). N is punch-list length, not leftoverBraces.length.
 */
export function intakesRowLeftoverCount(
  generatedDocuments: ReadonlyArray<{
    documentType: string;
    fillReport?: unknown;
  }> | null | undefined,
  answers: unknown,
): number | null {
  const trust = (generatedDocuments ?? []).find((d) =>
    isRevocableTrustDocumentType(d.documentType),
  );
  if (!trust) return null;
  return leftoverCountFromFillReport(
    parseStoredFillReport(trust.fillReport),
    documentsRowIntakeAnswers(answers),
  );
}

/** n>0 → "N leftovers"; n===0 → "clean"; no Trust → null. */
export function intakesRowLeftoverLabel(count: number | null): string | null {
  if (count == null) return null;
  if (count > 0) return `${count} leftovers`;
  return "clean";
}

export function documentsTrustDraftHrefPrefix(intakeSessionId: string): string {
  return `/dashboard/intakes/${intakeSessionId}`;
}

export function documentsRowDownloadHref(documentType: string, fileKey: string): string {
  if (isRevocableTrustDocumentType(documentType)) {
    return trustDraftStampedDownloadHref(fileKey);
  }
  return `/api/documents/download?fileKey=${encodeURIComponent(fileKey)}`;
}

/** Leftover package ZIP / Full-Estate-Plan-Package rows stay hidden — do not stamp-on-zip. */
export function isHiddenEstatePlanPackageRow(fileKey: string): boolean {
  const key = fileKey.toLowerCase();
  return key.endsWith(".zip") || key.includes("full-estate-plan-package");
}
