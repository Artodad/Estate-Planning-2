import type { DocumentFillReport } from "@/features/documents/types";

/** Single-doc Trust Family draft — not the 8-doc ZIP package. */
export const TRUST_DRAFT_DOCUMENT_TYPE = "revocable_trust" as const;

export function buildGenerateTrustDraftParams(intakeId: string) {
  return {
    intakeId,
    documentType: TRUST_DRAFT_DOCUMENT_TYPE,
  };
}

/** Client-detail island: first Trust vs refresh of an existing row. */
export type GenerateTrustDraftCtaMode = "generate" | "regenerate";

export function generateTrustDraftCtaLabel(
  mode: GenerateTrustDraftCtaMode,
  isGenerating: boolean,
): string {
  if (mode === "regenerate") {
    return isGenerating ? "Regenerating…" : "Regenerate";
  }
  return isGenerating ? "Generating Trust draft…" : "Generate Trust draft";
}

/** Latest Trust draft already on GeneratedDocument (newest-first list). */
export type StoredTrustDraft = {
  fileKey: string;
  fillReport: DocumentFillReport | null;
};
