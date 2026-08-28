/**
 * Upload-path adapter for the template normalizer.
 *
 * Runs normalizeTemplateBuffer on an attorney-uploaded .docx and decides whether
 * the result is safe to persist as the active template.
 *
 * Policy (safer attorney-facing option):
 * - Persist only when report.ok (no compile/syntax errors after normalize).
 * - Warnings (missing fixture tags, low-confidence suggestions) do not block upload.
 * - Soft (low-confidence) suggestions are never auto-applied; attorneys accept
 *   selected patches at confirm time via `acceptedSuggestionIds`.
 * - Previously the upload path accepted any .docx without compile checks; rejecting
 *   broken templates after normalize prevents silent generation failures.
 *
 * Opt-out (`skipNormalize: true`):
 * - Persist uploaded bytes as-is (no repair/alias/validate pipeline).
 * - No normalize report highlights; summary.skipped === true.
 * - Caller should not write a `*.original.docx` side file (primary already is raw).
 */

import {
  applyAcceptedSuggestions,
  softSuggestionsFromReportItems,
} from "./apply-accepted-suggestions";
import { normalizeTemplateBuffer } from "./normalize-template";
import type {
  NormalizeReport,
  TemplateUploadNormalizeSummary,
  TemplateUploadSoftSuggestion,
} from "./types";

export type { TemplateUploadNormalizeSummary, TemplateUploadSoftSuggestion };

export type PrepareTemplateUploadOptions = {
  /**
   * When true, skip auto-normalize and treat the uploaded bytes as the primary
   * template (for attorneys who already prepared the .docx offline).
   * Default: false (normalize on upload).
   */
  skipNormalize?: boolean;
  /**
   * Soft suggestion ids to apply after normalize (from a prior preview).
   * Default: none — soft suggestions stay suggestion-only until accepted.
   */
  acceptedSuggestionIds?: readonly string[];
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

function taggedCountFromReport(
  report: NormalizeReport,
  appliedSuggestionCount: number,
): number {
  const autoTagged = report.items.filter((i) => i.code === "SAMPLE_VALUE_TAGGED").length;
  return autoTagged + appliedSuggestionCount;
}

function toSummary(
  report: NormalizeReport,
  opts?: {
    skipped?: boolean;
    softSuggestions?: TemplateUploadSoftSuggestion[];
    appliedSuggestionCount?: number;
    leftAsSuggestionCount?: number;
    acceptedSuggestionIds?: readonly string[];
  },
): TemplateUploadNormalizeSummary {
  const softSuggestions = opts?.softSuggestions ?? softSuggestionsFromReportItems(report.items);
  const appliedSuggestionCount = opts?.appliedSuggestionCount ?? 0;
  const leftAsSuggestionCount =
    opts?.leftAsSuggestionCount ?? Math.max(0, softSuggestions.length - appliedSuggestionCount);
  const acceptedSuggestionIds = [...(opts?.acceptedSuggestionIds ?? [])];

  const highlightSource = [
    ...report.errors,
    ...report.repairs,
    ...report.renames,
    ...report.warnings,
    ...report.detections.filter((d) => d.code === "SAMPLE_VALUE_SUGGESTION"),
    ...report.detections.filter((d) => d.code === "SAMPLE_VALUE_SUGGESTION_APPLIED"),
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
    softSuggestions,
    appliedSuggestionCount,
    leftAsSuggestionCount,
    taggedCount: taggedCountFromReport(report, appliedSuggestionCount),
    acceptedSuggestionIds,
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
 * Pass `acceptedSuggestionIds` to apply selected soft suggestions before final validate.
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
      summary: toSummary(report, {
        skipped: true,
        softSuggestions: [],
        appliedSuggestionCount: 0,
        leftAsSuggestionCount: 0,
        acceptedSuggestionIds: [],
      }),
    };
  }

  const { buffer: normalizedBuffer, report } = normalizeTemplateBuffer(buffer);
  const softSuggestions = softSuggestionsFromReportItems(report.items);
  const acceptedIds = options?.acceptedSuggestionIds ?? [];

  if (acceptedIds.length === 0) {
    const summary = toSummary(report, {
      softSuggestions,
      appliedSuggestionCount: 0,
      leftAsSuggestionCount: softSuggestions.length,
      acceptedSuggestionIds: [],
    });

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

  const appliedResult = applyAcceptedSuggestions(
    normalizedBuffer,
    softSuggestions,
    acceptedIds,
    { validate: true },
  );

  const appliedItems = appliedResult.applied;
  const nextItems = [...report.items, ...appliedItems];
  for (const skip of appliedResult.skipped) {
    nextItems.push({
      kind: "warning",
      code: "SOFT_SUGGESTION_APPLY_SKIPPED",
      message: `Could not apply accepted suggestion ${skip.id}: ${skip.reason}`,
      details: { suggestionId: skip.id, reason: skip.reason },
    });
  }

  const validation = appliedResult.validation;
  if (validation && !validation.ok) {
    for (const msg of validation.syntaxErrors) {
      nextItems.push({
        kind: "error",
        code: "VALIDATION_SYNTAX",
        message: msg,
      });
    }
  }

  const repairs = nextItems.filter((i) => i.kind === "repair");
  const renames = nextItems.filter((i) => i.kind === "rename");
  const detections = nextItems.filter((i) => i.kind === "detection");
  const warnings = nextItems.filter((i) => i.kind === "warning");
  const errors = nextItems.filter((i) => i.kind === "error");
  const ok = errors.length === 0 && (validation?.ok ?? report.ok);

  const nextReport: NormalizeReport = {
    ok,
    items: nextItems,
    repairs,
    renames,
    detections,
    warnings,
    errors,
    validation: validation ?? report.validation,
  };

  const appliedCount = appliedItems.length;
  const summary = toSummary(nextReport, {
    // Keep the pre-apply soft list for the UI (accepted ones counted separately).
    softSuggestions,
    appliedSuggestionCount: appliedCount,
    leftAsSuggestionCount: Math.max(0, softSuggestions.length - appliedCount),
    acceptedSuggestionIds: acceptedIds,
  });

  if (!ok) {
    return {
      ok: false,
      normalizedBuffer: appliedResult.buffer,
      originalBuffer: buffer,
      report: nextReport,
      summary,
      error:
        "Template failed validation after applying accepted soft suggestions. " +
        "It was not saved. Review the proposed tags or leave those suggestions unchecked.\n" +
        buildFailureMessage(nextReport).replace(
          /^Template failed validation after normalization\.\s*/,
          "",
        ),
    };
  }

  return {
    ok: true,
    normalizedBuffer: appliedResult.buffer,
    originalBuffer: buffer,
    report: nextReport,
    summary,
  };
}
