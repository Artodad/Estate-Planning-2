/**
 * Deterministic Word XML repair for split docxtemplater placeholders.
 *
 * Word often splits `{client_full_name}` across multiple `<w:t>` runs.
 * We heal those (and a few safe tag-shape issues) without rewriting legal text.
 *
 * Conservative: only treat `{...}` as a tag when the inner content matches a
 * known placeholder shape. Ambiguous braces in prose emit warnings and are left alone.
 */

import PizZip from "pizzip";

import type { NormalizeReportItem, XmlPartRepairResult } from "./types";

/** Parts that may contain attorney-facing placeholders */
const XML_PART_RE =
  /^word\/(document\.xml|header\d*\.xml|footer\d*\.xml|footnotes\.xml|endnotes\.xml)$/;

const WT_RE = /<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const PARAGRAPH_RE = /<w:p[\s\S]*?<\/w:p>/g;

/**
 * Inner forms we treat as tags (after optional whitespace trim):
 *   name | #name | /name | ^name | /
 */
export function isLikelyPlaceholderInner(inner: string): boolean {
  const trimmed = inner.trim();
  if (!trimmed) return false;
  if (trimmed.length > 80) return false;
  if (/[.!?,:;]/.test(trimmed)) return false;

  // After optional loop/inverted/close prefix, the remainder must be a single identifier
  // (no multi-word prose like "see Section 5").
  const withoutPrefix = trimmed.replace(/^([#/^]|\/)\s*/, "").trim();
  if (withoutPrefix === "" && /^\/\s*$/.test(trimmed)) return true;
  if (!withoutPrefix) return false;
  if (/\s/.test(withoutPrefix)) return false;

  return /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(withoutPrefix);
}

/** Normalize inner tag shape: strip spaces, keep prefix (#/^/). */
export function normalizePlaceholderInner(inner: string): string {
  const trimmed = inner.trim();
  const compact = trimmed.replace(/\s+/g, "");
  if (compact === "/") return "/";
  return compact;
}

interface TextSegment {
  fullStart: number;
  fullEnd: number;
  attrs: string;
  text: string;
}

interface TagSpan {
  /** Inclusive start in concatenated text */
  start: number;
  /** Exclusive end in concatenated text */
  end: number;
  /** Raw slice including braces as found in concat */
  original: string;
  healedInner: string;
}

function findWtSegments(paragraphXml: string): TextSegment[] {
  const segments: TextSegment[] = [];
  const re = new RegExp(WT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(paragraphXml)) !== null) {
    segments.push({
      fullStart: m.index,
      fullEnd: m.index + m[0].length,
      attrs: m[1] ?? "",
      text: m[2],
    });
  }
  return segments;
}

function findTagSpans(concat: string): { tags: TagSpan[]; warnings: NormalizeReportItem[] } {
  const tags: TagSpan[] = [];
  const warnings: NormalizeReportItem[] = [];
  let i = 0;

  while (i < concat.length) {
    if (concat[i] !== "{") {
      i += 1;
      continue;
    }

    // Double-open mustache: {{...}}
    if (concat[i + 1] === "{") {
      const close = concat.indexOf("}}", i + 2);
      if (close === -1) {
        warnings.push({
          kind: "warning",
          code: "UNMATCHED_DOUBLE_OPEN",
          message: "Found '{{' without matching '}}'; left unchanged",
          details: { offset: i },
        });
        i += 2;
        continue;
      }
      const rawInner = concat.slice(i + 2, close);
      if (isLikelyPlaceholderInner(rawInner)) {
        tags.push({
          start: i,
          end: close + 2,
          original: concat.slice(i, close + 2),
          healedInner: normalizePlaceholderInner(rawInner),
        });
      } else {
        warnings.push({
          kind: "warning",
          code: "AMBIGUOUS_DOUBLE_BRACES",
          message: `Skipped ambiguous double-brace content: {{${rawInner.slice(0, 40)}}}`,
          before: `{{${rawInner}}}`,
        });
      }
      i = close + 2;
      continue;
    }

    const close = concat.indexOf("}", i + 1);
    if (close === -1) {
      warnings.push({
        kind: "warning",
        code: "UNMATCHED_OPEN_BRACE",
        message: "Found '{' without matching '}'; left unchanged",
        details: { offset: i },
      });
      break;
    }

    const rawInner = concat.slice(i + 1, close);
    if (isLikelyPlaceholderInner(rawInner)) {
      tags.push({
        start: i,
        end: close + 1,
        original: concat.slice(i, close + 1),
        healedInner: normalizePlaceholderInner(rawInner),
      });
    } else {
      warnings.push({
        kind: "warning",
        code: "AMBIGUOUS_BRACES",
        message: `Left non-placeholder braces unchanged: {${rawInner.slice(0, 48)}}`,
        before: `{${rawInner}}`,
      });
    }
    i = close + 1;
  }

  return { tags, warnings };
}

/** Map a concatenated offset to segment index + offset within that segment's text */
function locate(
  segments: TextSegment[],
  concatOffset: number,
): { segIndex: number; offsetInSeg: number } {
  let cursor = 0;
  for (let s = 0; s < segments.length; s += 1) {
    const len = segments[s].text.length;
    if (concatOffset < cursor + len) {
      return { segIndex: s, offsetInSeg: concatOffset - cursor };
    }
    if (concatOffset === cursor + len && s < segments.length - 1) {
      // Boundary: prefer start of next segment (exclusive-end friendly)
      return { segIndex: s + 1, offsetInSeg: 0 };
    }
    cursor += len;
  }
  const last = Math.max(0, segments.length - 1);
  return { segIndex: last, offsetInSeg: segments[last]?.text.length ?? 0 };
}

function repairCodeFor(original: string, replacement: string, spannedRuns: number): string {
  if (spannedRuns > 1) return "SPLIT_RUN_MERGED";
  if (original.startsWith("{{") && original.endsWith("}}")) return "DOUBLE_TO_SINGLE_BRACES";
  if (original !== replacement) return "TAG_WHITESPACE";
  return "TAG_NOOP";
}

/**
 * Heal split runs + tag shape issues inside one paragraph's XML.
 * Preserves run structure (rPr etc.); only rewrites `<w:t>` text nodes.
 */
export function repairParagraphXml(paragraphXml: string): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  const segments = findWtSegments(paragraphXml);
  if (segments.length === 0) {
    return { xml: paragraphXml, items };
  }

  const concat = segments.map((s) => s.text).join("");
  const { tags, warnings } = findTagSpans(concat);
  items.push(...warnings);

  if (tags.length === 0) {
    return { xml: paragraphXml, items };
  }

  const texts = segments.map((s) => s.text);

  // Right-to-left so earlier string offsets remain valid relative to original concat/segments
  const ordered = [...tags].sort((a, b) => b.start - a.start);

  for (const tag of ordered) {
    const replacement = `{${tag.healedInner}}`;
    const startLoc = locate(segments, tag.start);
    const endLoc = locate(segments, tag.end);
    const i0 = startLoc.segIndex;
    let i1 = endLoc.segIndex;
    let endOffset = endLoc.offsetInSeg;

    // If exclusive end sits at offset 0 of a segment, the tag ended at the previous boundary
    if (endOffset === 0 && i1 > i0) {
      i1 -= 1;
      endOffset = texts[i1].length;
    }

    const spannedRuns = i1 - i0 + 1;

    if (i0 === i1) {
      const seg = texts[i0];
      const before = seg.slice(0, startLoc.offsetInSeg);
      const after = seg.slice(endOffset);
      texts[i0] = before + replacement + after;
    } else {
      const prefix = texts[i0].slice(0, startLoc.offsetInSeg);
      const suffix = texts[i1].slice(endOffset);
      texts[i0] = prefix + replacement;
      for (let k = i0 + 1; k < i1; k += 1) {
        texts[k] = "";
      }
      texts[i1] = suffix;
    }

    const code = repairCodeFor(tag.original, replacement, spannedRuns);
    if (code !== "TAG_NOOP") {
      items.push({
        kind: "repair",
        code,
        message:
          code === "SPLIT_RUN_MERGED"
            ? `Merged placeholder split across ${spannedRuns} text runs: ${replacement}`
            : code === "DOUBLE_TO_SINGLE_BRACES"
              ? `Normalized double braces to single: ${replacement}`
              : `Normalized whitespace inside tag: ${replacement}`,
        before: tag.original,
        after: replacement,
      });
    }
  }

  const healedConcat = texts.join("");
  items.push(...detectUnmatchedLoops(healedConcat));

  // Reconstruct paragraph XML by replacing w:t nodes in reverse order
  let result = paragraphXml;
  for (let s = segments.length - 1; s >= 0; s -= 1) {
    const seg = segments[s];
    let attrs = seg.attrs;
    const newText = texts[s];
    if ((newText === "" || /^\s|\s$/.test(newText)) && !/\bxml:space=/.test(attrs)) {
      attrs = `${attrs} xml:space="preserve"`;
    }
    const replacement = `<w:t${attrs}>${newText}</w:t>`;
    result = result.slice(0, seg.fullStart) + replacement + result.slice(seg.fullEnd);
  }

  return { xml: result, items };
}

function detectUnmatchedLoops(text: string): NormalizeReportItem[] {
  const items: NormalizeReportItem[] = [];
  const opens = [...text.matchAll(/\{#([a-zA-Z_][a-zA-Z0-9_.]*)\}/g)].map((m) => m[1]);
  const closes = new Set(
    [...text.matchAll(/\{\/([a-zA-Z_][a-zA-Z0-9_.]*)\}/g)].map((m) => m[1]),
  );
  const genericCloseCount = (text.match(/\{\/\}/g) || []).length;

  // Pair opens with closes conservatively within this paragraph only
  const closeCounts = new Map<string, number>();
  for (const name of closes) {
    closeCounts.set(name, (text.match(new RegExp(`\\{\\/${name}\\}`, "g")) || []).length);
  }
  const openCounts = new Map<string, number>();
  for (const name of opens) {
    openCounts.set(name, (openCounts.get(name) ?? 0) + 1);
  }

  for (const [name, count] of openCounts) {
    const namedCloses = closeCounts.get(name) ?? 0;
    if (namedCloses < count && genericCloseCount === 0) {
      items.push({
        kind: "warning",
        code: "UNMATCHED_LOOP_OPEN",
        message: `Loop opener {#${name}} has no matching {/${name}} or {/} in this paragraph; left unchanged`,
        before: `{#${name}}`,
      });
    }
  }
  return items;
}

/**
 * Repair all paragraphs in a Word XML part.
 */
export function repairXmlPart(xml: string, partName: string): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  const repaired = xml.replace(PARAGRAPH_RE, (paragraph) => {
    const result = repairParagraphXml(paragraph);
    for (const item of result.items) {
      items.push({ ...item, part: partName });
    }
    return result.xml;
  });
  return { xml: repaired, items };
}

/**
 * Open a .docx buffer, heal split runs / tag shape in document + headers/footers.
 */
export function repairDocxRuns(buffer: Buffer): { buffer: Buffer; items: NormalizeReportItem[] } {
  const zip = new PizZip(buffer);
  const items: NormalizeReportItem[] = [];

  for (const relativePath of Object.keys(zip.files)) {
    const file = zip.files[relativePath];
    if (file.dir) continue;
    if (!XML_PART_RE.test(relativePath)) continue;

    const xml = file.asText();
    const result = repairXmlPart(xml, relativePath);
    if (result.xml !== xml) {
      zip.file(relativePath, result.xml);
    }
    items.push(...result.items);
  }

  const repairCount = items.filter((i) => i.kind === "repair").length;
  items.push({
    kind: "detection",
    code: "REPAIR_PASS_COMPLETE",
    message: `Split-run repair applied ${repairCount} repair(s)`,
  });

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  return { buffer: out, items };
}
