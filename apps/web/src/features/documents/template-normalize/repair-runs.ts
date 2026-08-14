/**
 * Deterministic Word XML repair for split docxtemplater placeholders.
 *
 * Word often splits `{client_full_name}` across multiple `<w:r>` / `<w:t>` runs
 * because of mid-tag bold/italic/underline or spellcheck — e.g.
 * `{cli` + bold `ent` + `_full` + `_name}`. That breaks docxtemplater and makes
 * tags unreadable in Word.
 *
 * Strategy for conflicting run properties (w:rPr):
 *   Inherit formatting from the **first** run of the fragment. The healed
 *   `{tag}` is rewritten as a single `<w:r>` using that first run's `<w:rPr>`
 *   (or none if the first run had none). Mid-tag bold/italic differences are
 *   dropped so the placeholder is one visually contiguous token. Text after
 *   the tag (suffix in the last fragment run) keeps the **last** run's rPr,
 *   since it is outside the placeholder.
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
const RUN_RE = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
const PARAGRAPH_RE = /<w:p\b[\s\S]*?<\/w:p>/g;
const RPR_RE = /<w:rPr\b[\s\S]*?<\/w:rPr>/;

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

interface RunInfo {
  fullStart: number;
  fullEnd: number;
  xml: string;
  /** Full `<w:rPr>...</w:rPr>` or empty string */
  rPr: string;
  text: string;
  /** True when the run is only rPr + w:t (safe to coalesce) */
  simple: boolean;
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

function extractRunText(runXml: string): string {
  let text = "";
  const re = new RegExp(WT_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(runXml)) !== null) {
    text += m[2];
  }
  return text;
}

/** Non-text run chrome we preserve when coalescing (tabs/breaks), not drop. */
const PRESERVABLE_CHROME_RE =
  /<w:tab\s*\/>|<w:br\b[^>]*\/>|<w:cr\s*\/>|<w:lastRenderedPageBreak\s*\/>/g;

function isSimpleTextRun(runXml: string): boolean {
  const stripped = runXml
    .replace(/<w:r\b[^>]*>/, "")
    .replace(/<\/w:r>/, "")
    .replace(RPR_RE, "")
    .replace(/<w:t(\s[^>]*)?>[\s\S]*?<\/w:t>/g, "")
    .replace(PRESERVABLE_CHROME_RE, "")
    .trim();
  return stripped === "";
}

/**
 * Split a run into leading chrome (before first w:t), text, and trailing chrome
 * (after last w:t). Used so mid-tag coalesce keeps leading tabs on the first run.
 */
export function splitRunChrome(runXml: string): {
  open: string;
  rPr: string;
  before: string;
  after: string;
  close: string;
} {
  const openMatch = runXml.match(/^<w:r\b[^>]*>/);
  const open = openMatch ? openMatch[0] : "<w:r>";
  const close = "</w:r>";
  const inner = runXml.slice(open.length, runXml.endsWith(close) ? -close.length : undefined);
  const rPrMatch = inner.match(RPR_RE);
  const rPr = rPrMatch ? rPrMatch[0] : "";
  const afterRPr = rPr ? inner.slice(rPr.length) : inner;
  const firstT = afterRPr.search(/<w:t\b/);
  if (firstT === -1) {
    return { open, rPr, before: afterRPr, after: "", close };
  }
  const lastTClose = afterRPr.lastIndexOf("</w:t>");
  const before = afterRPr.slice(0, firstT);
  const after = lastTClose === -1 ? "" : afterRPr.slice(lastTClose + "</w:t>".length);
  return { open, rPr, before, after, close };
}

/** Build a text run preserving optional leading/trailing chrome (e.g. w:tab). */
export function buildTextRunWithChrome(
  text: string,
  rPr: string = "",
  beforeChrome: string = "",
  afterChrome: string = "",
): string {
  const space = text === "" || /^\s|\s$/.test(text) ? ` xml:space="preserve"` : "";
  return `<w:r>${rPr}${beforeChrome}<w:t${space}>${escapeXmlText(text)}</w:t>${afterChrome}</w:r>`;
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
      simple: isSimpleTextRun(xml),
    });
  }
  return runs;
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

/**
 * Map a concatenated offset to run index + offset within that run's text.
 * Skips zero-length runs (tab-only runs common in Trust Family notary blocks)
 * so character offsets never resolve onto empty runs.
 */
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

/** Back up from an exclusive end at offset 0, skipping empty runs. */
function backupEndRun(runs: RunInfo[], i0: number, i1: number, endOffset: number): {
  i1: number;
  endOffset: number;
} {
  if (endOffset !== 0 || i1 <= i0) return { i1, endOffset };
  let idx = i1 - 1;
  while (idx > i0 && runs[idx].text.length === 0) idx -= 1;
  return { i1: idx, endOffset: runs[idx].text.length };
}

function escapeXmlText(text: string): string {
  // Run texts are taken from existing XML captures (entities preserved).
  // Only escape raw specials if somehow present.
  return text
    .replace(/&(?!(amp|lt|gt|quot|apos);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build a simple text run, optionally with inherited rPr. */
export function buildTextRun(text: string, rPr: string = ""): string {
  const space = text === "" || /^\s|\s$/.test(text) ? ` xml:space="preserve"` : "";
  return `<w:r>${rPr}<w:t${space}>${escapeXmlText(text)}</w:t></w:r>`;
}

function repairCodeFor(original: string, replacement: string, spannedRuns: number): string {
  if (spannedRuns > 1) return "SPLIT_RUN_MERGED";
  if (original.startsWith("{{") && original.endsWith("}}")) return "DOUBLE_TO_SINGLE_BRACES";
  if (original !== replacement) return "TAG_WHITESPACE";
  return "TAG_NOOP";
}

function runsHaveConflictingRPr(runs: RunInfo[], from: number, to: number): boolean {
  const first = runs[from].rPr;
  for (let i = from + 1; i <= to; i += 1) {
    if (runs[i].rPr !== first) return true;
  }
  return false;
}

/**
 * Heal split runs + tag shape issues inside one paragraph's XML.
 *
 * Cross-run placeholders (including mixed bold/italic mid-tag) are coalesced into
 * a single `<w:r>` inheriting the first fragment run's `w:rPr`.
 */
export function repairParagraphXml(paragraphXml: string): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  let runs = findRuns(paragraphXml);
  if (runs.length === 0) {
    return { xml: paragraphXml, items };
  }

  // Work on a mutable paragraph string; re-scan runs after each multi-run coalesce
  // (right-to-left single-pass on stable indices when only text in-place edits happen).
  const concat = runs.map((r) => r.text).join("");
  const { tags, warnings } = findTagSpans(concat);
  items.push(...warnings);

  if (tags.length === 0) {
    // Still strip orphan closers (notary venue paragraphs often have no tags).
    const orphanOnly = removeOrphanClosers(paragraphXml);
    items.push(...orphanOnly.items);
    return { xml: orphanOnly.xml, items };
  }

  // Right-to-left so earlier offsets stay valid until we rewrite the paragraph.
  const ordered = [...tags].sort((a, b) => b.start - a.start);
  let result = paragraphXml;
  // Track text overrides for same-run edits before a structural rewrite invalidates indices.
  // Simpler approach: apply all tags right-to-left with structural replace each time,
  // re-parsing runs from `result` after each multi-run merge; for same-run, edit in place.

  for (const tag of ordered) {
    runs = findRuns(result);
    if (runs.length === 0) break;

    const currentConcat = runs.map((r) => r.text).join("");
    // Re-find this tag in current concat by healed/original forms
    const replacement = `{${tag.healedInner}}`;
    const candidates = [tag.original, `{${tag.healedInner}}`];
    let start = -1;
    let end = -1;
    for (const cand of candidates) {
      const idx = currentConcat.lastIndexOf(cand);
      if (idx !== -1) {
        start = idx;
        end = idx + cand.length;
        break;
      }
    }
    // Also try scanning with findTagSpans for this healed inner
    if (start === -1) {
      const again = findTagSpans(currentConcat).tags.find(
        (t) => t.healedInner === tag.healedInner || t.original === tag.original,
      );
      if (!again) continue;
      start = again.start;
      end = again.end;
    }

    const startLoc = locate(runs, start);
    const endLoc = locate(runs, end);
    let i0 = startLoc.runIndex;
    let i1 = endLoc.runIndex;
    let endOffset = endLoc.offsetInRun;
    ({ i1, endOffset } = backupEndRun(runs, i0, i1, endOffset));

    const spannedRuns = i1 - i0 + 1;
    const prefix = runs[i0].text.slice(0, startLoc.offsetInRun);
    const suffix = runs[i1].text.slice(endOffset);
    const originalSlice = currentConcat.slice(start, end);

    if (spannedRuns === 1) {
      // In-place text heal inside one run (keep that run's rPr + chrome as-is)
      const run = runs[i0];
      const chrome = splitRunChrome(run.xml);
      const newText = prefix + replacement + suffix;
      const newRun = buildTextRunWithChrome(newText, run.rPr, chrome.before, chrome.after);
      result = result.slice(0, run.fullStart) + newRun + result.slice(run.fullEnd);
    } else {
      // Multi-run fragment (possibly mixed bold/italic): coalesce into one tag run.
      const spanSimple = runs.slice(i0, i1 + 1).every((r) => r.simple);
      if (!spanSimple) {
        items.push({
          kind: "warning",
          code: "SPLIT_RUN_COMPLEX",
          message:
            `Placeholder ${replacement} spans ${spannedRuns} runs that include non-text content; ` +
            `attempted conservative coalesce using first-run formatting`,
          before: originalSlice,
          after: replacement,
        });
      }

      const conflicting = runsHaveConflictingRPr(runs, i0, i1);
      // Inherit first fragment run's rPr for the whole tag (documented strategy).
      const tagRPr = runs[i0].rPr;
      const suffixRPr = runs[i1].rPr;
      const firstChrome = splitRunChrome(runs[i0].xml);
      const lastChrome = splitRunChrome(runs[i1].xml);

      // Keep leading tabs/breaks from the first fragment run (common in Trust Family docs).
      let replacementXml = buildTextRunWithChrome(
        prefix + replacement,
        tagRPr,
        firstChrome.before,
        suffix ? "" : lastChrome.after,
      );
      if (suffix) {
        replacementXml += buildTextRunWithChrome(suffix, suffixRPr, "", lastChrome.after);
      }

      const spanStart = runs[i0].fullStart;
      const spanEnd = runs[i1].fullEnd;
      result = result.slice(0, spanStart) + replacementXml + result.slice(spanEnd);

      items.push({
        kind: "repair",
        code: "SPLIT_RUN_MERGED",
        message:
          `Merged placeholder split across ${spannedRuns} runs into one contiguous tag` +
          (conflicting ? " (inherited w:rPr from first fragment run; dropped mid-tag formatting)" : "") +
          `: ${replacement}`,
        before: originalSlice,
        after: replacement,
        details: {
          spannedRuns,
          inheritedRPrFrom: "first_fragment_run",
          droppedMidTagFormatting: conflicting,
          preservedLeadingChrome: Boolean(firstChrome.before),
        },
      });
      continue;
    }

    const code = repairCodeFor(originalSlice, replacement, spannedRuns);
    if (code !== "TAG_NOOP") {
      items.push({
        kind: "repair",
        code,
        message:
          code === "DOUBLE_TO_SINGLE_BRACES"
            ? `Normalized double braces to single: ${replacement}`
            : `Normalized whitespace inside tag: ${replacement}`,
        before: originalSlice,
        after: replacement,
      });
    }
  }

  // Remove stray `}` that are not part of any likely placeholder (real Trust Family
  // notary venue pattern: "State of California}" / lone "}" / "County of San Diego}").
  const orphanResult = removeOrphanClosers(result);
  result = orphanResult.xml;
  items.push(...orphanResult.items);

  return { xml: result, items };
}

/**
 * Delete `}` characters that are not closers of a likely placeholder tag.
 * Leaves `{...}` placeholders and ambiguous `{prose}` pairs untouched.
 */
export function removeOrphanClosers(paragraphXml: string): XmlPartRepairResult {
  const items: NormalizeReportItem[] = [];
  let result = paragraphXml;
  let runs = findRuns(result);
  if (runs.length === 0) return { xml: result, items };

  const concat = runs.map((r) => r.text).join("");
  const { tags } = findTagSpans(concat);
  const covered = new Array(concat.length).fill(false);
  for (const tag of tags) {
    for (let i = tag.start; i < tag.end; i += 1) covered[i] = true;
  }

  // Also cover ambiguous `{...}` pairs so we don't strip their closers.
  let scan = 0;
  while (scan < concat.length) {
    if (concat[scan] !== "{") {
      scan += 1;
      continue;
    }
    if (concat[scan + 1] === "{") {
      const close = concat.indexOf("}}", scan + 2);
      if (close === -1) break;
      for (let i = scan; i < close + 2; i += 1) covered[i] = true;
      scan = close + 2;
      continue;
    }
    const close = concat.indexOf("}", scan + 1);
    if (close === -1) break;
    for (let i = scan; i <= close; i += 1) covered[i] = true;
    scan = close + 1;
  }

  const orphanOffsets: number[] = [];
  for (let i = 0; i < concat.length; i += 1) {
    if (concat[i] === "}" && !covered[i]) orphanOffsets.push(i);
  }
  if (orphanOffsets.length === 0) return { xml: result, items };

  // Remove right-to-left so offsets stay valid within the current concat/run map.
  for (const offset of orphanOffsets.sort((a, b) => b - a)) {
    runs = findRuns(result);
    const currentConcat = runs.map((r) => r.text).join("");
    // Re-locate this orphan by scanning uncovered } from the end when concat shifted.
    // After prior deletions, use the character at the same relative remaining orphans.
    if (offset >= currentConcat.length || currentConcat[offset] !== "}") {
      // Fallback: remove the rightmost uncovered } in current text
      const { tags: again } = findTagSpans(currentConcat);
      const cov = new Array(currentConcat.length).fill(false);
      for (const tag of again) {
        for (let i = tag.start; i < tag.end; i += 1) cov[i] = true;
      }
      let amb = 0;
      while (amb < currentConcat.length) {
        if (currentConcat[amb] !== "{") {
          amb += 1;
          continue;
        }
        const close = currentConcat.indexOf("}", amb + 1);
        if (close === -1) break;
        for (let i = amb; i <= close; i += 1) cov[i] = true;
        amb = close + 1;
      }
      let found = -1;
      for (let i = currentConcat.length - 1; i >= 0; i -= 1) {
        if (currentConcat[i] === "}" && !cov[i]) {
          found = i;
          break;
        }
      }
      if (found === -1) continue;
      const loc = locate(runs, found);
      const run = runs[loc.runIndex];
      const chrome = splitRunChrome(run.xml);
      const newText =
        run.text.slice(0, loc.offsetInRun) + run.text.slice(loc.offsetInRun + 1);
      const ctxBefore = currentConcat.slice(Math.max(0, found - 24), found);
      const newRun = buildTextRunWithChrome(newText, run.rPr, chrome.before, chrome.after);
      result = result.slice(0, run.fullStart) + newRun + result.slice(run.fullEnd);
      items.push({
        kind: "repair",
        code: "ORPHAN_CLOSER_REMOVED",
        message: `Removed orphan '}' after ${JSON.stringify(ctxBefore)}`,
        before: `${ctxBefore}}`,
        after: ctxBefore,
      });
      continue;
    }

    const loc = locate(runs, offset);
    const run = runs[loc.runIndex];
    if (run.text[loc.offsetInRun] !== "}") {
      continue;
    }
    const chrome = splitRunChrome(run.xml);
    const newText =
      run.text.slice(0, loc.offsetInRun) + run.text.slice(loc.offsetInRun + 1);
    const ctxBefore = currentConcat.slice(Math.max(0, offset - 24), offset);
    // Drop the whole run when it only existed to hold the orphan closer
    // (keeps leading tab-only sibling runs intact).
    const replacementXml =
      newText === "" && !chrome.before && !chrome.after
        ? ""
        : buildTextRunWithChrome(newText, run.rPr, chrome.before, chrome.after);
    result = result.slice(0, run.fullStart) + replacementXml + result.slice(run.fullEnd);
    items.push({
      kind: "repair",
      code: "ORPHAN_CLOSER_REMOVED",
      message: `Removed orphan '}' after ${JSON.stringify(ctxBefore)}`,
      before: `${ctxBefore}}`,
      after: ctxBefore,
    });
  }

  return { xml: result, items };
}

/**
 * Pair {#name} / {/name} / {/} left-to-right (LIFO), matching docxtemplater:
 * `{/}` latches the innermost open; a named closer must match that innermost
 * name. Naive open/close counts miss closer-before-opener, two-opens-one-close,
 * and a single `{/}` silencing every leftover open.
 */
function detectUnmatchedLoops(text: string): NormalizeReportItem[] {
  const items: NormalizeReportItem[] = [];
  const tokenRe = /\{#([a-zA-Z_][a-zA-Z0-9_.]*)\}|\{\/([a-zA-Z_][a-zA-Z0-9_.]*)?\}/g;
  const stack: string[] = [];

  for (const match of text.matchAll(tokenRe)) {
    const openName = match[1];
    const closeName = match[2];
    const token = match[0];

    if (openName !== undefined) {
      stack.push(openName);
      continue;
    }

    if (stack.length === 0) {
      items.push({
        kind: "warning",
        code: "UNMATCHED_LOOP_CLOSE",
        message: `Loop closer ${token} has no matching opener in this part; left unchanged`,
        before: token,
      });
      continue;
    }

    if (closeName === undefined) {
      stack.pop();
      continue;
    }

    const inner = stack[stack.length - 1];
    if (inner === closeName) {
      stack.pop();
      continue;
    }

    items.push({
      kind: "warning",
      code: "UNMATCHED_LOOP_CLOSE",
      message: `Loop closer {/${closeName}} does not match innermost opener {#${inner}}; left unchanged`,
      before: token,
    });
  }

  for (const name of stack) {
    items.push({
      kind: "warning",
      code: "UNMATCHED_LOOP_OPEN",
      message: `Loop opener {#${name}} has no matching {/${name}} or {/} in this part; left unchanged`,
      before: `{#${name}}`,
    });
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
  // paragraphLoop: true matches {#tag}…{/tag} across paragraphs. Per-paragraph
  // matching falsely warned on Trust Family {#children} / {#distribution_residuary}.
  const partText = repaired.replace(/<[^>]+>/g, "");
  for (const item of detectUnmatchedLoops(partText)) {
    items.push({ ...item, part: partName });
  }
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
