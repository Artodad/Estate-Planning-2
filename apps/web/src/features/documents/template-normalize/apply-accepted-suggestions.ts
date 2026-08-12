/**
 * Apply attorney-accepted soft (low-confidence) normalizer suggestions to a
 * normalized .docx buffer, then optionally re-validate.
 *
 * Soft suggestions are never auto-applied by detect-sample-values; this helper
 * is the only path that promotes them, and only for explicitly accepted ids.
 */

import PizZip from "pizzip";

import {
  applyReplacementsInParagraph,
  isDocxtemplaterSafeProposedTag,
} from "./detect-sample-values";
import { validateTemplate } from "./validate-template";
import type { NormalizeReportItem, TemplateValidationResult } from "./types";

const XML_PART_RE =
  /^word\/(document\.xml|header\d*\.xml|footer\d*\.xml|footnotes\.xml|endnotes\.xml)$/;
const PARAGRAPH_RE = /<w:p\b[\s\S]*?<\/w:p>/g;
const RUN_RE = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
const WT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

/** Client/server-safe soft suggestion row (mirrors report SAMPLE_VALUE_SUGGESTION). */
export interface SoftSuggestion {
  /** Stable id for multi-select accept (`soft:{index}:{ruleId}`) */
  id: string;
  ruleId: string;
  before: string;
  /** Proposed replacement tag when docxtemplater-safe; omit when not applicable */
  after?: string;
  rationale: string;
  part?: string;
  mapperKey?: string | null;
  /** False when there is no safe proposed tag (ignore/reject only) */
  applicable: boolean;
}

export interface ApplyAcceptedSuggestionsResult {
  buffer: Buffer;
  applied: NormalizeReportItem[];
  /** Suggestions that were requested but could not be applied */
  skipped: Array<{ id: string; reason: string }>;
  validation?: TemplateValidationResult;
}

function extractRunText(runXml: string): string {
  let text = "";
  const re = new RegExp(WT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(runXml)) !== null) {
    text += m[2];
  }
  return text;
}

function paragraphConcat(paragraphXml: string): string {
  const re = new RegExp(RUN_RE.source, "g");
  let text = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphXml)) !== null) {
    text += extractRunText(m[0]);
  }
  return text;
}

/**
 * Build soft-suggestion rows from normalize report detection items.
 * Reuses SAMPLE_VALUE_SUGGESTION shape (before / after / details) — no parallel model.
 */
export function softSuggestionsFromReportItems(
  items: NormalizeReportItem[],
): SoftSuggestion[] {
  const suggestions = items.filter((i) => i.code === "SAMPLE_VALUE_SUGGESTION");
  return suggestions.map((item, index) => {
    const ruleId = String(item.details?.ruleId ?? "unknown");
    const after =
      typeof item.after === "string" && isDocxtemplaterSafeProposedTag(item.after)
        ? item.after
        : undefined;
    const rationale =
      (typeof item.details?.rationale === "string" && item.details.rationale) ||
      item.message;
    const mapperKey =
      item.details?.mapperKey === undefined
        ? null
        : (item.details.mapperKey as string | null);
    return {
      id: `soft:${index}:${ruleId}`,
      ruleId,
      before: item.before ?? "",
      after,
      rationale,
      part: item.part,
      mapperKey,
      applicable: Boolean(after),
    };
  });
}

/**
 * Replace the Nth occurrence of `needle` in paragraph-concatenated text of a
 * Word XML part with `replacement`, using run-aware paragraph edits.
 */
function replaceNthInXmlPart(
  xml: string,
  needle: string,
  replacement: string,
  nth: number,
  ruleId: string,
): { xml: string; item: NormalizeReportItem | null } {
  if (!needle || nth < 0) return { xml, item: null };

  let seen = 0;
  let appliedItem: NormalizeReportItem | null = null;

  const next = xml.replace(PARAGRAPH_RE, (paragraph) => {
    if (appliedItem) return paragraph;
    const concat = paragraphConcat(paragraph);
    const starts: number[] = [];
    let from = 0;
    while (from <= concat.length) {
      const idx = concat.indexOf(needle, from);
      if (idx === -1) break;
      starts.push(idx);
      from = idx + Math.max(needle.length, 1);
    }
    for (const idx of starts) {
      if (seen === nth) {
        const result = applyReplacementsInParagraph(paragraph, [
          {
            start: idx,
            end: idx + needle.length,
            replacement,
            ruleId,
          },
        ]);
        const raw = result.items[0];
        if (raw) {
          appliedItem = {
            ...raw,
            kind: "detection",
            code: "SAMPLE_VALUE_SUGGESTION_APPLIED",
            message: `Accepted soft suggestion → ${replacement} (${ruleId})`,
            before: needle,
            after: replacement,
            details: { ...(raw.details ?? {}), ruleId, accepted: true },
          };
        }
        seen += 1;
        return result.xml;
      }
      seen += 1;
    }
    return paragraph;
  });

  return { xml: next, item: appliedItem };
}

/**
 * Apply only accepted soft suggestion patches to a (already normalized) buffer.
 * Unaccepted suggestions are left untouched. Invalid / non-applicable accepts are skipped.
 *
 * When `validate` is true (default), runs the same docxtemplater dry-run as the
 * normalizer; callers should reject upload when `validation.ok === false`.
 */
export function applyAcceptedSuggestions(
  buffer: Buffer,
  softSuggestions: SoftSuggestion[],
  acceptedIds: readonly string[],
  options?: { validate?: boolean },
): ApplyAcceptedSuggestionsResult {
  const acceptedSet = new Set(acceptedIds);
  const toApply = softSuggestions.filter((s) => acceptedSet.has(s.id));
  const applied: NormalizeReportItem[] = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  if (toApply.length === 0) {
    const validation =
      options?.validate === false
        ? undefined
        : validateTemplate(buffer, { renderFixture: true, templateLabel: "buffer.docx" });
    return { buffer, applied, skipped, validation };
  }

  // Occurrence index among suggestions that share the same before+part
  const occurrenceKey = (s: SoftSuggestion) =>
    `${s.part ?? ""}::${s.before}`;
  const occurrenceIndex = new Map<string, number>();
  const withOccurrence = softSuggestions.map((s) => {
    const key = occurrenceKey(s);
    const n = occurrenceIndex.get(key) ?? 0;
    occurrenceIndex.set(key, n + 1);
    return { suggestion: s, occurrence: n };
  });

  const zip = new PizZip(buffer);

  // Apply in reverse occurrence order so earlier indices stay stable
  const acceptedOrdered = withOccurrence
    .filter(({ suggestion }) => acceptedSet.has(suggestion.id))
    .sort((a, b) => b.occurrence - a.occurrence);

  for (const { suggestion, occurrence } of acceptedOrdered) {
    if (!suggestion.after || !suggestion.applicable) {
      skipped.push({
        id: suggestion.id,
        reason: "No docxtemplater-safe proposed tag — left as suggestion",
      });
      continue;
    }
    if (!suggestion.before) {
      skipped.push({ id: suggestion.id, reason: "Missing source blank text" });
      continue;
    }

    const partName = suggestion.part ?? "word/document.xml";
    const file = zip.file(partName);
    if (!file || file.dir) {
      skipped.push({ id: suggestion.id, reason: `Part not found: ${partName}` });
      continue;
    }
    if (!XML_PART_RE.test(partName)) {
      skipped.push({ id: suggestion.id, reason: `Unsupported part: ${partName}` });
      continue;
    }

    const { xml: nextXml, item } = replaceNthInXmlPart(
      file.asText(),
      suggestion.before,
      suggestion.after,
      occurrence,
      suggestion.ruleId,
    );
    if (!item) {
      skipped.push({
        id: suggestion.id,
        reason: "Blank text no longer present in normalized template",
      });
      continue;
    }
    zip.file(partName, nextXml);
    applied.push({ ...item, part: partName });
  }

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  const validation =
    options?.validate === false
      ? undefined
      : validateTemplate(out, { renderFixture: true, templateLabel: "buffer.docx" });

  return { buffer: out, applied, skipped, validation };
}
