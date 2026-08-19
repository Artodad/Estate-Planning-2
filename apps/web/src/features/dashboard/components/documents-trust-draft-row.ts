import type { PartialIntake } from "@/features/intake/schemas/intake";

import { TRUST_DRAFT_DOCUMENT_TYPE } from "./generate-trust-draft";
import { trustDraftStampedDownloadHref } from "./trust-draft-download-confirm";

export function isRevocableTrustDocumentType(documentType: string): boolean {
  return documentType === TRUST_DRAFT_DOCUMENT_TYPE;
}

/** Session answers or null — never {}. is_ca_resident skip differs. */
export function documentsRowIntakeAnswers(answers: unknown): PartialIntake | null {
  return (answers ?? null) as PartialIntake | null;
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
