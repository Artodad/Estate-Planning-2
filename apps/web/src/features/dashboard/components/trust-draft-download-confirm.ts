/**
 * Trust-draft download sign-off copy.
 * N = punchListFromFillReport(...).length — not leftoverBraces.length.
 */

import type { DocumentFillReport } from "@/features/documents/types";
import type { PartialIntake } from "@/features/intake/schemas/intake";

import { punchListFromFillReport } from "./fill-report-punch-list";

export const TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE = "download clean.";

export function leftoverCountFromFillReport(
  report: DocumentFillReport | null | undefined,
  answers?: PartialIntake | null,
): number {
  if (!report) return 0;
  return punchListFromFillReport(report, answers).length;
}

export function trustDraftDownloadConfirmPhrase(leftoverCount: number): string {
  if (leftoverCount > 0) {
    return `${leftoverCount} leftovers, download anyway`;
  }
  return TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE;
}

export function trustDraftStampedDownloadHref(fileKey: string): string {
  return `/api/documents/download-trust-draft?fileKey=${encodeURIComponent(fileKey)}`;
}
