import { parseStoredFillReport } from "@/features/documents/fill-report";

import { TRUST_DRAFT_DOCUMENT_TYPE, type StoredTrustDraft } from "./generate-trust-draft";

/**
 * Surface the stored Trust draft + fillReport JSON for reload.
 * Does not rebuild the report from a .docx. Callers pass newest-first
 * (same order as generatedDocumentHelpers.listByIntakeForFirm).
 */
export function trustDraftFromStoredDocuments(
  docs: ReadonlyArray<{
    documentType: string;
    fileKey: string;
    fillReport?: unknown;
  }>,
): StoredTrustDraft | null {
  const trust = docs.find((d) => d.documentType === TRUST_DRAFT_DOCUMENT_TYPE && d.fileKey);
  if (!trust) return null;
  return {
    fileKey: trust.fileKey,
    fillReport: parseStoredFillReport(trust.fillReport),
  };
}
