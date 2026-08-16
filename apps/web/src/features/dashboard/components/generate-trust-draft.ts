import type { DocumentFillReport } from "@/features/documents/types";

/** Single-doc Trust Family draft — not the 8-doc ZIP package. */
export const TRUST_DRAFT_DOCUMENT_TYPE = "revocable_trust" as const;

export function buildGenerateTrustDraftParams(intakeId: string) {
  return {
    intakeId,
    documentType: TRUST_DRAFT_DOCUMENT_TYPE,
  };
}

/** Latest Trust draft already on GeneratedDocument (newest-first list). */
export type StoredTrustDraft = {
  fileKey: string;
  fillReport: DocumentFillReport | null;
};
