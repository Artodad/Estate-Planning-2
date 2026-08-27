/**
 * DRAFT Watermark implementation (custom "module" + pure post-render utility).
 *
 * Per Design §4 (recommended custom module approach) + strict .cursor/rules/document-fidelity.mdc:
 * - ALWAYS produce a visible "DRAFT – For Attorney Review Only" marker.
 * - 100% fidelity to original template: we ONLY APPEND a small, styled paragraph to
 *   existing headers (or document body as fallback). We NEVER rewrite, replace, or
 *   mutate any attorney-authored content, styles, numbering, tables, sectPr, etc.
 * - Works for every page that uses the header (standard for attorney templates).
 * - Configurable but default on.
 * - No external watermark libs; only PizZip (already a hard dependency) + string ops on XML.
 *
 * Why not full docxtemplater Module hooks for MVP?
 *   Header/footer XML surgery is safest and most controllable when done post-render
 *   on the final zip. The "module" export is provided for future expansion (attach/postrender).
 *
 * Usage in generator:
 *   const zip = doc.getZip();
 *   if (addDraft) applyDraftWatermark(zip);
 *   const buffer = zip.generate({ type: "nodebuffer" });
 *
 * Visual verification (mandatory per rules): open output + original side-by-side in Word.
 * Confirm: DRAFT visible in header (gray), zero layout shift, original text/formatting intact.
 */

import PizZip from "pizzip";

export const DRAFT_TEXT = "DRAFT – For Attorney Review Only";

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Same gray centered header paragraph used by the DRAFT banner. */
function headerParagraphXml(text: string): string {
  return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="808080"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:b/></w:rPr><w:t>${escapeXmlText(text)}</w:t></w:r></w:p>`;
}

/**
 * Extra header line (or body fallback). Does not fill tags or call generateDocument.
 * Used by applyDraftWatermark (DRAFT banner only).
 */
function injectHeaderParagraph(zip: PizZip, text: string): void {
  if (!zip || typeof zip !== "object" || !text) return;

  const paragraph = headerParagraphXml(text);

  // Collect all header files (header1.xml, header2.xml, header.xml, etc.)
  const headerPaths: string[] = Object.keys(zip.files || {}).filter((k) =>
    /^word\/header\d*\.xml$/.test(k),
  );

  if (headerPaths.length > 0) {
    // Preferred: inject into every header so it appears on all pages using that header.
    for (const hp of headerPaths) {
      try {
        let content = zip.files[hp].asText();
        // Prepend right after the opening <w:hdr ...> tag. This appends without touching existing content.
        content = content.replace(/<w:hdr([^>]*)>/i, `<w:hdr$1>${paragraph}`);
        zip.file(hp, content);
      } catch {
        // Non-fatal per header; continue (some headers may be complex).
      }
    }
    return;
  }

  // Fallback (rare for real attorney templates): put a visible banner at the very top of the document body.
  // This guarantees at least first-page visibility without any risk to original content.
  const docPath = "word/document.xml";
  if (zip.files[docPath]) {
    try {
      let content = zip.files[docPath].asText();
      // Insert immediately after <w:body ...> opening tag.
      content = content.replace(/<w:body([^>]*)>/i, `<w:body$1>${paragraph}`);
      zip.file(docPath, content);
    } catch {
      // Last resort: do nothing rather than corrupt.
    }
  }
}

/**
 * Pure function that mutates the provided PizZip (in-memory) by injecting the DRAFT marker.
 * Safe for fidelity: only touches header*.xml or falls back to top of document body.
 */
export function applyDraftWatermark(zip: PizZip): void {
  injectHeaderParagraph(zip, DRAFT_TEXT);
}

/**
 * Trust-draft download bytes: stored generate buffer as-is.
 * Confirm phrases stay in the UI dialog — never stamped onto the .docx.
 * The stored zip already has the DRAFT banner from generate.
 */
export function trustDraftDownloadBytes(stored: Buffer): Buffer {
  return stored;
}

/**
 * Factory returning a minimal docxtemplater-compatible "module" object.
 * Currently a no-op stub (watermark applied explicitly post-render for precision).
 * Future: can evolve to use optionsTransformer + postrender hooks if needed.
 */
export function createDraftWatermarkModule(text: string = DRAFT_TEXT) {
  return {
    name: "DraftWatermark",
    // Placeholder for docxtemplater v3 module contract if integrated deeper.
    // attach(doc: any) { this.doc = doc; },
    // optionsTransformer(opts: any) { return opts; },
    // For now, the applyDraftWatermark() utility above is the active implementation.
    draftText: text,
  };
}
