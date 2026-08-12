/**
 * Upload-path adapter for the template normalizer.
 *
 * Runs normalizeTemplateBuffer on an attorney-uploaded .docx and decides whether
 * the result is safe to persist as the active template.
 *
 * Policy (safer attorney-facing option):
 * - Persist only when report.ok (no compile/syntax errors after normalize).
 * - Warnings (missing fixture tags, low-confidence suggestions) do not block upload.
 * - Previously the upload path accepted any .docx without compile checks; rejecting
 *   broken templates after normalize prevents silent generation failures.
 *
 * Opt-out (`skipNormalize: true`):
 * - Persist uploaded bytes as-is (no repair/alias/validate pipeline).
 * - No normalize report highlights; summary.skipped === true.
 * - Caller should not write a `*.original.docx` side file (primary already is raw).
 */

import { normalizeTemplateBuffer } from "./normalize-template";
import type { NormalizeReport, TemplateUploadNormalizeSummary } from "./types";

export type { TemplateUploadNormalizeSummary };

export type PrepareTemplateUploadOptions = {
  /**
   * When true, skip auto-normalize and treat the uploaded bytes as the primary
   * template (for attorneys who already prepared the .docx offline).
   * Default: false (normalize on upload).
   */
  skipNormalize?: boolean;
};

export type PrepareTemplateUploadResult =
  | {
      ok: true;
      normalizedBuffer: Buffer;
      originalBuffer: Buffer;
      report: NormalizeReport;
      summary: TemplateUploadNormalizeSummary;
    }
  | {
      ok: false;
      normalizedBuffer: Buffer;
      originalBuffer: Buffer;
      report: NormalizeReport;
      summary: TemplateUploadNormalizeSummary;
      error: string;
    };

const HIGHLIGHT_CAP = 12;

function emptySkippedReport(): NormalizeReport {
  return {
    ok: true,
    items: [],
    repairs: [],
    renames: [],
    detections: [],
    warnings: [],
    errors: [],
  };
}

function toSummary(
  report: NormalizeReport,
  opts?: { skipped?: boolean },
): TemplateUploadNormalizeSummary {
  const highlightSource = [
    ...report.errors,
    ...report.repairs,
    ...report.renames,
    ...report.warnings,
    ...report.detections.filter((d) => d.code === "SAMPLE_VALUE_SUGGESTION"),
  ];

  const highlights = highlightSource.slice(0, HIGHLIGHT_CAP).map((item) => ({
    kind: item.kind,
    code: item.code,
    message: item.message,
    before: item.before,
    after: item.after,
  }));

  return {
    ok: report.ok,
    skipped: opts?.skipped === true ? true : undefined,
    repairCount: report.repairs.length,
    renameCount: report.renames.length,
    detectionCount: report.detections.length,
    warningCount: report.warnings.length,
    errorCount: report.errors.length,
    highlights,
    validation: report.validation
      ? {
          ok: report.validation.ok,
          missingTags: report.validation.missingTags,
          syntaxErrors: report.validation.syntaxErrors,
        }
      : undefined,
  };
}

function buildFailureMessage(report: NormalizeReport): string {
  const syntax = report.validation?.syntaxErrors ?? [];
  const errors = report.errors.map((e) => e.message);
  const lines = [...syntax, ...errors].filter(Boolean);
  if (lines.length === 0) {
    return (
      "Template failed validation after normalization. " +
      "Fix broken tags or unmatched loops in Word, then re-upload."
    );
  }
  const shown = lines.slice(0, 8);
  const more = lines.length > shown.length ? `\n…and ${lines.length - shown.length} more` : "";
  return (
    "Template failed validation after normalization. " +
    "It was not saved. Fix the issues below and re-upload:\n" +
    shown.map((l) => `• ${l}`).join("\n") +
    more
  );
}

/**
 * Normalize an uploaded template buffer and gate persistence on validation.
 * Pass `{ skipNormalize: true }` to store bytes as uploaded (no pipeline).
 */
export function prepareTemplateUpload(
  buffer: Buffer,
  options?: PrepareTemplateUploadOptions,
): PrepareTemplateUploadResult {
  if (options?.skipNormalize) {
    const report = emptySkippedReport();
    return {
      ok: true,
      normalizedBuffer: buffer,
      originalBuffer: buffer,
      report,
      summary: toSummary(report, { skipped: true }),
    };
  }

  const { buffer: normalizedBuffer, report } = normalizeTemplateBuffer(buffer);
  const summary = toSummary(report);

  if (!report.ok) {
    return {
      ok: false,
      normalizedBuffer,
      originalBuffer: buffer,
      report,
      summary,
      error: buildFailureMessage(report),
    };
  }

  return {
    ok: true,
    normalizedBuffer,
    originalBuffer: buffer,
    report,
    summary,
  };
}
