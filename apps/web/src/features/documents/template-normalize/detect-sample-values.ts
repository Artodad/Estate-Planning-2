/**
 * Conservative sample-value / underscore-blank → tag detection.
 *
 * Real Trust Family attorney docs mix:
 *   - already-tagged placeholders (`{client_full_name}`)
 *   - underscore blanks (`_[Name of Trust]_`)
 *   - occasional filled venue samples (`County of San Diego`)
 *
 * This pass only applies **high-confidence** replacements mapped to the mapper
 * contract. Low-confidence blanks are reported as suggestions — never invent
 * legal language or mapper keys that do not exist.
 */

import PizZip from "pizzip";

import { buildTextRunWithChrome, splitRunChrome } from "./repair-runs";
import type { NormalizeReportItem, XmlPartRepairResult } from "./types";

const XML_PART_RE =
  /^word\/(document\.xml|header\d*\.xml|footer\d*\.xml|footnotes\.xml|endnotes\.xml)$/;

const RUN_RE = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
const RPR_RE = /<w:rPr\b[\s\S]*?<\/w:rPr>/;
const PARAGRAPH_RE = /<w:p\b[\s\S]*?<\/w:p>/g;
const WT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;

/** NBSP and regular spaces that appear between underscore blanks in Word. */
const BLANK_GAP = "[ \\t\\u00a0]*";

export interface SampleDetectionRule {
  /** Stable id for tests / reports */
  id: string;
  /** Mapper contract key when high-confidence; omit for suggestion-only */
  mapperKey?: string;
  /** Confidence of an automatic replacement */
  confidence: "high" | "low";
  /** Find all matches in concatenated paragraph text */
  find: (text: string) => Array<{ start: number; end: number; matched: string }>;
  /** Replacement text when confidence=high (ignored for low) */
  replaceWith?: string;
  /** Human-readable reason */
  reason: string;
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

interface RunInfo {
  fullStart: number;
  fullEnd: number;
  xml: string;
  rPr: string;
  text: string;
}

function findRuns(paragraphXml: string): RunInfo[] {
  const runs: RunInfo[] = [];
  const re = new RegExp(RUN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphXml)) !== null) {
    const xml = m[0];
    const rPrMatch = xml.match(RPR_RE);
    runs.push({
      fullStart: m.index,
      fullEnd: m.index + xml.length,
      xml,
      rPr: rPrMatch ? rPrMatch[0] : "",
      text: extractRunText(xml),
    });
  }
  return runs;
}

function locate(
  runs: RunInfo[],
  concatOffset: number,
): { runIndex: number; offsetInRun: number } {
  let cursor = 0;
  let lastNonEmpty = -1;
  for (let s = 0; s < runs.length; s += 1) {
    const len = runs[s].text.length;
    if (len === 0) continue;
    lastNonEmpty = s;
    if (concatOffset < cursor + len) {
      return { runIndex: s, offsetInRun: concatOffset - cursor };
    }
    cursor += len;
  }
  if (lastNonEmpty >= 0) {
    return {
      runIndex: lastNonEmpty,
      offsetInRun: runs[lastNonEmpty].text.length,
    };
  }
  const last = Math.max(0, runs.length - 1);
  return { runIndex: last, offsetInRun: runs[last]?.text.length ?? 0 };
}

function findUnderscoreBlank(labelPattern: string): SampleDetectionRule["find"] {
  // Matches _[label]_ with optional NBSP/spaces around the brackets.
  // Also consumes a trailing decorative underscore when present (`_ _[x]_ _`).
  // Prefer the longest non-overlapping match so `_ _[Name]_ _` does not
  // leave dangling decorative underscores from a shorter `_[Name]_` hit.
  const re = new RegExp(
    `_${BLANK_GAP}\\[${labelPattern}\\]${BLANK_GAP}_${BLANK_GAP}_?`,
    "gi",
  );
  return (text: string) => {
    const candidates: Array<{ start: number; end: number; matched: string }> = [];
    const local = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = local.exec(text)) !== null) {
      candidates.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
      // Allow overlapping candidates (e.g. outer `_ _[x]_` vs inner `_[x]_`).
      if (m[0].length > 0) local.lastIndex = m.index + 1;
    }
    candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
    const out: Array<{ start: number; end: number; matched: string }> = [];
    const covered = new Array(text.length).fill(false);
    for (const c of candidates) {
      let overlap = false;
      for (let i = c.start; i < c.end; i += 1) {
        if (covered[i]) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;
      for (let i = c.start; i < c.end; i += 1) covered[i] = true;
      out.push(c);
    }
    return out.sort((a, b) => a.start - b.start);
  };
}

/** Underscore blank whose immediately preceding prose matches `prefixRe`. */
function findUnderscoreBlankWithPrefix(
  labelPattern: string,
  prefixRe: RegExp,
  lookbehindChars = 48,
): SampleDetectionRule["find"] {
  const findBlank = findUnderscoreBlank(labelPattern);
  return (text: string) =>
    findBlank(text).filter((m) => {
      const before = text.slice(Math.max(0, m.start - lookbehindChars), m.start);
      // Real Trust Family docs often put a decorative `_ ` between prose and `_[blank]_`.
      const withoutDecorative = before.replace(/[_\t \u00a0]+$/g, "");
      return prefixRe.test(withoutDecorative);
    });
}

/**
 * High-confidence auto-replacements + low-confidence suggestions derived from
 * the real Trust-_Family-changed corpus blanks.
 */
export const SAMPLE_DETECTION_RULES: SampleDetectionRule[] = [
  {
    id: "blank_name_of_trust",
    mapperKey: "trust_name",
    confidence: "high",
    find: findUnderscoreBlank("Name of Trust"),
    replaceWith: "{trust_name}",
    reason: "Underscore blank [Name of Trust] → mapper trust_name",
  },
  {
    id: "blank_name_before_trust",
    mapperKey: "trust_name",
    confidence: "high",
    find: (text) => {
      // Real docs use decorative underscores: `_ _[Name]_ _ TRUST`
      // Consume the blank + trailing decorative underscore before TRUST.
      const re = new RegExp(
        `_${BLANK_GAP}\\[Name\\]${BLANK_GAP}_${BLANK_GAP}_?${BLANK_GAP}(?=TRUST|Family Trust)`,
        "g",
      );
      const candidates: Array<{ start: number; end: number; matched: string }> = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        candidates.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
        if (m[0].length > 0) re.lastIndex = m.index + 1;
      }
      candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
      const out: Array<{ start: number; end: number; matched: string }> = [];
      const covered = new Array(text.length).fill(false);
      for (const c of candidates) {
        let overlap = false;
        for (let i = c.start; i < c.end; i += 1) {
          if (covered[i]) {
            overlap = true;
            break;
          }
        }
        if (overlap) continue;
        for (let i = c.start; i < c.end; i += 1) covered[i] = true;
        out.push(c);
      }
      return out.sort((a, b) => a.start - b.start);
    },
    replaceWith: "{trust_name}",
    reason: "Underscore blank [Name] immediately before TRUST → trust_name",
  },
  {
    id: "blank_name_of_settlor",
    mapperKey: "client_full_name",
    confidence: "high",
    find: findUnderscoreBlank("Name of settlor"),
    replaceWith: "{client_full_name}",
    reason: "Underscore blank [Name of settlor] → client_full_name",
  },
  {
    id: "filled_county_of",
    mapperKey: "county_of_residence",
    confidence: "high",
    find: (text) => {
      // Notary venue paragraphs are typically exactly "County of San Diego".
      // Require the whole paragraph (trimmed) so body prose is never rewritten.
      const trimmed = text.trim();
      const m = /^County of (?!\{)([A-Z][A-Za-z .'-]{1,40})$/.exec(trimmed);
      if (!m) return [];
      const absStart = text.indexOf(m[0]);
      const countyStart = absStart + "County of ".length;
      return [
        {
          start: countyStart,
          end: countyStart + m[1].length,
          matched: m[1],
        },
      ];
    },
    replaceWith: "{county_of_residence}",
    reason: "Filled notary venue 'County of <Name>' paragraph → county_of_residence",
  },
  // --- High-confidence promotions (iteration-2): label-anchored → mapper keys ---
  {
    id: "blank_second_successor_trustee",
    mapperKey: "second_successor_trustee_full_name",
    confidence: "high",
    find: findUnderscoreBlank("name of second successor trustee"),
    replaceWith: "{second_successor_trustee_full_name}",
    reason:
      "Underscore blank [name of second successor trustee] → second_successor_trustee_full_name",
  },
  {
    id: "blank_city_state_marriage",
    mapperKey: "marriage_city_state",
    confidence: "high",
    find: findUnderscoreBlank("city and state of marriage"),
    replaceWith: "{marriage_city_state}",
    reason: "Underscore blank [city and state of marriage] → marriage_city_state",
  },
  {
    id: "blank_date_of_marriage",
    mapperKey: "marriage_date",
    confidence: "high",
    find: findUnderscoreBlank("date of marriage"),
    replaceWith: "{marriage_date}",
    reason: "Underscore blank [date of marriage] → marriage_date",
  },
  {
    id: "blank_deemed_survivor",
    mapperKey: "deemed_survivor_full_name",
    confidence: "high",
    find: findUnderscoreBlank("name of deemed survivor"),
    replaceWith: "{deemed_survivor_full_name}",
    reason:
      "Underscore blank [name of deemed survivor] → deemed_survivor_full_name (dedicated key; not spouse/client guess)",
  },
  {
    id: "blank_first_distribution_age",
    mapperKey: "first_distribution_age",
    confidence: "high",
    find: findUnderscoreBlank("first age"),
    replaceWith: "{first_distribution_age}",
    reason: "Underscore blank [first age] → first_distribution_age",
  },
  {
    id: "blank_second_distribution_age",
    mapperKey: "second_distribution_age",
    confidence: "high",
    find: findUnderscoreBlank("second age"),
    replaceWith: "{second_distribution_age}",
    reason: "Underscore blank [second age] → second_distribution_age",
  },
  {
    id: "blank_third_distribution_age",
    mapperKey: "third_distribution_age",
    confidence: "high",
    find: findUnderscoreBlank("third age"),
    replaceWith: "{third_distribution_age}",
    reason: "Underscore blank [third age] → third_distribution_age",
  },
  {
    id: "blank_young_person_retention_age",
    mapperKey: "young_person_retention_age",
    confidence: "high",
    find: findUnderscoreBlankWithPrefix("age", /under the age of\s*$/i),
    replaceWith: "{young_person_retention_age}",
    reason:
      "Bare [age] immediately after 'under the age of' (Young Persons) → young_person_retention_age",
  },
  {
    id: "blank_educational_trust_eligibility_age",
    mapperKey: "educational_trust_eligibility_age",
    confidence: "high",
    // Educational Trust uses "under age" (not Young Persons "under the age of").
    find: findUnderscoreBlankWithPrefix("age", /under age\s*$/i),
    replaceWith: "{educational_trust_eligibility_age}",
    reason:
      "Bare [age] after 'under age' (Educational Trust eligibility) → educational_trust_eligibility_age",
  },
  {
    id: "blank_educational_trust_remainder_age",
    mapperKey: "educational_trust_remainder_age",
    confidence: "high",
    // Must run before outright "attains" — educational prose is "has attained the age of".
    find: findUnderscoreBlankWithPrefix("age", /has attained the age of\s*$/i),
    replaceWith: "{educational_trust_remainder_age}",
    reason:
      "Bare [age] after 'has attained the age of' (Educational Trust remainder) → educational_trust_remainder_age",
  },
  {
    id: "blank_educational_trust_termination_age",
    mapperKey: "educational_trust_termination_age",
    confidence: "high",
    find: findUnderscoreBlankWithPrefix("age", /(?:he\/she|they)\s+turns\s*$/i),
    replaceWith: "{educational_trust_termination_age}",
    reason:
      "Bare [age] after 'he/she turns' / 'they turns' (Educational Trust hold-until) → educational_trust_termination_age",
  },
  {
    id: "blank_outright_distribution_age",
    mapperKey: "outright_distribution_age",
    confidence: "high",
    // Exclude educational "has attained" (handled above).
    find: (text) =>
      findUnderscoreBlankWithPrefix("age", /attains the age of\s*$/i)(text).filter((m) => {
        const before = text
          .slice(Math.max(0, m.start - 48), m.start)
          .replace(/[_\t \u00a0]+$/g, "");
        return !/has attained the age of\s*$/i.test(before);
      }),
    replaceWith: "{outright_distribution_age}",
    reason:
      "Bare [age] immediately after 'attains the age of' (single-age principal) → outright_distribution_age",
  },
  // Low-confidence: report only (ambiguous / free-form / needs conditionals)
  {
    id: "blank_distribution_description",
    confidence: "low",
    find: findUnderscoreBlank("Description of distribution\\."),
    reason: "Free-text distribution description — keep attorney-authored; not auto-tagged",
  },
  {
    id: "blank_do_do_not",
    confidence: "low",
    find: findUnderscoreBlank("do/do not"),
    reason: "Choice language blank — do not invent conditional legal text",
  },
  {
    id: "blank_age_ambiguous",
    confidence: "low",
    find: findUnderscoreBlank("age"),
    reason: "Bare [age] blank without a high-confidence prose anchor — not auto-tagged",
  },
  {
    id: "blank_ceb_appoint_person",
    confidence: "low",
    find: findUnderscoreBlank(
      "Can Choose a Specific Person if Beneficiary Dies Before Distribution",
    ),
    reason: "Attorney drafting / CEB choice note — not a mapper scalar",
  },
];

function applyReplacementsInParagraph(
  paragraphXml: string,
  replacements: Array<{ start: number; end: number; replacement: string; ruleId: string }>,
): { xml: string; items: NormalizeReportItem[] } {
  const items: NormalizeReportItem[] = [];
  if (replacements.length === 0) return { xml: paragraphXml, items };

  let result = paragraphXml;
  const ordered = [...replacements].sort((a, b) => b.start - a.start);

  for (const rep of ordered) {
    const runs = findRuns(result);
    if (runs.length === 0) break;
    const concat = runs.map((r) => r.text).join("");
    // Re-find by exact matched slice when possible
    let start = rep.start;
    let end = rep.end;
    const expectedLen = rep.end - rep.start;
    if (
      start >= concat.length ||
      end > concat.length ||
      concat.slice(start, end).length !== expectedLen
    ) {
      // Search for a remaining occurrence of a plausible source near the replacement target
      // by looking for the replacement if already applied, else skip.
      const idx = concat.indexOf(rep.replacement);
      if (idx !== -1) continue; // already applied
      // Last resort: skip this replacement if offsets drifted
      continue;
    }

    // Verify we still see non-tag text at this span (don't double-apply)
    if (concat.slice(start, end) === rep.replacement) continue;

    const startLoc = locate(runs, start);
    const endLoc = locate(runs, end);
    let i0 = startLoc.runIndex;
    let i1 = endLoc.runIndex;
    let endOffset = endLoc.offsetInRun;
    if (endOffset === 0 && i1 > i0) {
      let idx = i1 - 1;
      while (idx > i0 && runs[idx].text.length === 0) idx -= 1;
      i1 = idx;
      endOffset = runs[i1].text.length;
    }

    const prefix = runs[i0].text.slice(0, startLoc.offsetInRun);
    const suffix = runs[i1].text.slice(endOffset);
    const originalSlice = concat.slice(start, end);
    const firstChrome = splitRunChrome(runs[i0].xml);
    const lastChrome = splitRunChrome(runs[i1].xml);

    let replacementXml = buildTextRunWithChrome(
      prefix + rep.replacement,
      runs[i0].rPr,
      firstChrome.before,
      suffix ? "" : lastChrome.after,
    );
    if (suffix) {
      replacementXml += buildTextRunWithChrome(
        suffix,
        runs[i1].rPr,
        "",
        lastChrome.after,
      );
    }

    result =
      result.slice(0, runs[i0].fullStart) +
      replacementXml +
      result.slice(runs[i1].fullEnd);

    items.push({
      kind: "repair",
      code: "SAMPLE_VALUE_TAGGED",
      message: `Tagged sample/blank as ${rep.replacement} (${rep.ruleId})`,
      before: originalSlice,
      after: rep.replacement,
      details: { ruleId: rep.ruleId },
    });
  }

  return { xml: result, items };
}

/**
 * Detect and (when high-confidence) replace sample values / underscore blanks
 * inside one paragraph.
 */
export function detectSampleValuesInParagraph(paragraphXml: string): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  const runs = findRuns(paragraphXml);
  if (runs.length === 0) return { xml: paragraphXml, items };

  const concat = runs.map((r) => r.text).join("");
  const replacements: Array<{
    start: number;
    end: number;
    replacement: string;
    ruleId: string;
  }> = [];

  // Track covered offsets so overlapping rules don't double-hit
  const covered = new Array(concat.length).fill(false);

  for (const rule of SAMPLE_DETECTION_RULES) {
    const matches = rule.find(concat);
    for (const match of matches) {
      let overlaps = false;
      for (let i = match.start; i < match.end; i += 1) {
        if (covered[i]) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;

      if (rule.confidence === "high" && rule.replaceWith) {
        // Skip if the span is already the target tag
        if (concat.slice(match.start, match.end) === rule.replaceWith) continue;
        replacements.push({
          start: match.start,
          end: match.end,
          replacement: rule.replaceWith,
          ruleId: rule.id,
        });
        for (let i = match.start; i < match.end; i += 1) covered[i] = true;
      } else {
        items.push({
          kind: "detection",
          code: "SAMPLE_VALUE_SUGGESTION",
          message: `Low-confidence blank/sample not auto-tagged: ${JSON.stringify(match.matched)} — ${rule.reason}`,
          before: match.matched,
          details: {
            ruleId: rule.id,
            confidence: rule.confidence,
            mapperKey: rule.mapperKey ?? null,
          },
        });
        for (let i = match.start; i < match.end; i += 1) covered[i] = true;
      }
    }
  }

  const applied = applyReplacementsInParagraph(paragraphXml, replacements);
  items.push(...applied.items);
  return { xml: applied.xml, items };
}

export function detectSampleValuesInXml(
  xml: string,
  partName: string,
): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  const next = xml.replace(PARAGRAPH_RE, (paragraph) => {
    const result = detectSampleValuesInParagraph(paragraph);
    for (const item of result.items) {
      items.push({ ...item, part: partName });
    }
    return result.xml;
  });
  return { xml: next, items };
}

/**
 * Walk document + header/footer parts and apply sample/blank detection.
 */
export function detectSampleValuesInDocx(buffer: Buffer): {
  buffer: Buffer;
  items: NormalizeReportItem[];
} {
  const zip = new PizZip(buffer);
  const items: NormalizeReportItem[] = [];

  for (const relativePath of Object.keys(zip.files)) {
    const file = zip.files[relativePath];
    if (file.dir) continue;
    if (!XML_PART_RE.test(relativePath)) continue;

    const xml = file.asText();
    const result = detectSampleValuesInXml(xml, relativePath);
    if (result.xml !== xml) {
      zip.file(relativePath, result.xml);
    }
    items.push(...result.items);
  }

  const tagged = items.filter((i) => i.code === "SAMPLE_VALUE_TAGGED").length;
  const suggestions = items.filter((i) => i.code === "SAMPLE_VALUE_SUGGESTION").length;
  items.push({
    kind: "detection",
    code: "SAMPLE_DETECT_PASS_COMPLETE",
    message: `Sample/blank detection tagged ${tagged} value(s); ${suggestions} low-confidence suggestion(s)`,
    details: { tagged, suggestions },
  });

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  return { buffer: out, items };
}
