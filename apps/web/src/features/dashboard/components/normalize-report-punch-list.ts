/**
 * Trust template leftover punch from a stored upload normalize report.
 *
 * Analog of leftoverCountFromFillReport: N is untagged Word blanks still in
 * the .docx — not highlight cap, not generate-time leftoverBraces, and not
 * already-tagged mapper loops like `{#children}`.
 */

import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import type {
  TemplateUploadNormalizeSummary,
  TemplateUploadSoftSuggestion,
} from "@/features/documents/template-normalize/types";

export type NormalizeLeftoverPunchRow = TemplateUploadSoftSuggestion;

export type NormalizeTaggedPunchRow = {
  before?: string;
  after?: string;
  code: string;
};

/** `{#children}` / `{name}` — already tagged. Needs attention is Word blanks only. */
export function isAlreadyTaggedMapperToken(value: string | undefined): boolean {
  if (!value) return false;
  return /^\s*\{[#/^]?[a-zA-Z_]/.test(value);
}

/** Display leftover as `_[label]_` — the Word blank, not `before → after`. */
export function wordBlankDisplay(before: string): string {
  const inner = before
    .replace(/\u00a0/g, " ")
    .replace(/^[_ \t]+/, "")
    .replace(/[_ \t]+$/, "")
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .trim();
  return `_[${inner || before.trim()}]_`;
}

export function leftoverPunchFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): NormalizeLeftoverPunchRow[] {
  if (!report || report.skipped) return [];
  const accepted = new Set(report.acceptedSuggestionIds ?? []);
  const rows =
    accepted.size === 0 && (report.appliedSuggestionCount ?? 0) === 0
      ? report.softSuggestions
      : report.softSuggestions.filter((s) => !accepted.has(s.id));
  return rows.filter((s) => !isAlreadyTaggedMapperToken(s.before));
}

export function leftoverCountFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): number {
  return leftoverPunchFromNormalizeReport(report).length;
}

export function taggedPunchFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): NormalizeTaggedPunchRow[] {
  if (!report || report.skipped) return [];
  if (report.taggedPunch && report.taggedPunch.length > 0) return report.taggedPunch;
  return report.highlights
    .filter(
      (h) =>
        h.code === "SAMPLE_VALUE_TAGGED" || h.code === "SAMPLE_VALUE_SUGGESTION_APPLIED",
    )
    .map((h) => ({ before: h.before, after: h.after, code: h.code }));
}

export function taggedCountFromNormalizeReport(
  report: TemplateUploadNormalizeSummary | null | undefined,
): number {
  if (!report || report.skipped) return 0;
  if (typeof report.taggedCount === "number") return report.taggedCount;
  return taggedPunchFromNormalizeReport(report).length;
}

/** n>0 → "N leftovers"; scanned clean → "Ready for intake"; no/skipped report → null. */
export function templateRowLeftoverLabel(
  report: TemplateUploadNormalizeSummary | null | undefined,
): string | null {
  if (!report || report.skipped) return null;
  const leftover = leftoverCountFromNormalizeReport(report);
  if (leftover > 0) return `${leftover} leftovers`;
  return "Ready for intake";
}

/** Verdict only — do not lead with tagged count. */
export function templateRowPunchLabel(
  report: TemplateUploadNormalizeSummary | null | undefined,
): string | null {
  return templateRowLeftoverLabel(report);
}

export function templateDisplayFileName(
  fileKey: string,
  sourceFileName?: string | null,
): string {
  if (sourceFileName && sourceFileName.trim()) return sourceFileName.trim();
  const base = fileKey.split("/").pop() ?? "template.docx";
  return base.replace(/-[0-9a-z]+(?=\.docx$)/i, "");
}

export function templatePunchFromStoredReport(value: unknown): {
  report: TemplateUploadNormalizeSummary | null;
  leftoverCount: number;
  taggedCount: number;
  leftovers: NormalizeLeftoverPunchRow[];
  tagged: NormalizeTaggedPunchRow[];
  punchLabel: string | null;
} {
  const report = parseStoredNormalizeReport(value);
  return {
    report,
    leftoverCount: leftoverCountFromNormalizeReport(report),
    taggedCount: taggedCountFromNormalizeReport(report),
    leftovers: leftoverPunchFromNormalizeReport(report),
    tagged: taggedPunchFromNormalizeReport(report),
    punchLabel: templateRowPunchLabel(report),
  };
}
