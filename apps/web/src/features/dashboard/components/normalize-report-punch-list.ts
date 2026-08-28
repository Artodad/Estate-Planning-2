/**
 * Trust template leftover punch from a stored upload normalize report.
 *
 * Analog of leftoverCountFromFillReport / punchListFromFillReport:
 * N is leftover punch length (still-blank soft suggestions), not highlight
 * cap and not generate-time leftoverBraces.
 */

import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import type {
  TemplateUploadNormalizeSummary,
  TemplateUploadSoftSuggestion,
} from "@/features/documents/template-normalize/types";

export type NormalizeLeftoverPunchRow = TemplateUploadSoftSuggestion;

export function leftoverPunchFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): NormalizeLeftoverPunchRow[] {
  if (!report || report.skipped) return [];
  const accepted = new Set(report.acceptedSuggestionIds ?? []);
  if (accepted.size === 0 && (report.appliedSuggestionCount ?? 0) === 0) {
    return report.softSuggestions;
  }
  return report.softSuggestions.filter((s) => !accepted.has(s.id));
}

export function leftoverCountFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): number {
  return leftoverPunchFromNormalizeReport(report).length;
}

export function taggedCountFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): number {
  if (!report || report.skipped) return 0;
  if (typeof report.taggedCount === "number") return report.taggedCount;
  return report.highlights.filter(
    (h) =>
      h.code === "SAMPLE_VALUE_TAGGED" || h.code === "SAMPLE_VALUE_SUGGESTION_APPLIED",
  ).length;
}

/** n>0 → "N leftovers"; n===0 with a scanned report → "clean"; no/skipped report → null. */
export function templateRowLeftoverLabel(
  report: TemplateUploadNormalizeSummary | null | undefined,
): string | null {
  if (!report || report.skipped) return null;
  const leftover = leftoverCountFromNormalizeReport(report);
  if (leftover > 0) return `${leftover} leftovers`;
  return "clean";
}

/** Tagged vs still-blank leftover punch for list/detail. */
export function templateRowPunchLabel(
  report: TemplateUploadNormalizeSummary | null | undefined,
): string | null {
  if (!report || report.skipped) return null;
  const tagged = taggedCountFromNormalizeReport(report);
  const leftoverLabel = templateRowLeftoverLabel(report);
  if (!leftoverLabel) return null;
  return `${tagged} tagged • ${leftoverLabel}`;
}

export function templatePunchFromStoredReport(value: unknown): {
  report: TemplateUploadNormalizeSummary | null;
  leftoverCount: number;
  taggedCount: number;
  leftovers: NormalizeLeftoverPunchRow[];
  punchLabel: string | null;
} {
  const report = parseStoredNormalizeReport(value);
  return {
    report,
    leftoverCount: leftoverCountFromNormalizeReport(report),
    taggedCount: taggedCountFromNormalizeReport(report),
    leftovers: leftoverPunchFromNormalizeReport(report),
    punchLabel: templateRowPunchLabel(report),
  };
}
