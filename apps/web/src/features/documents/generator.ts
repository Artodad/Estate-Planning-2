/**
 * Core Document Generation Service (Phase 4 Sub-agent B).
 *
 * Implements EXACTLY the Generation Service Architecture from Design §3:
 *   generateDocument({ templateFileKey, variables, firmId, options })
 *   - Load via storage abstraction (using fileKey patterns from seed/schema)
 *   - PizZip + docxtemplater (paragraphLoop: true) + post-render DRAFT watermark
 *   - setData + compile + render (full loop/conditional support)
 *   - DRAFT watermark via dedicated utility (Design §4 custom module approach)
 *   - Upload + return {fileKey, buffer} using fidelity naming
 *   - Robust error handling: MissingTemplateVariablesError surfaces exact vars (fidelity non-negotiable)
 *
 * STRICT adherence to .cursor/rules/document-fidelity.mdc (highest priority):
 *   - docxtemplater + pizzip EXCLUSIVELY (no other docx libs, no PDF primary, no rewriting language)
 *   - 100% original template fidelity preserved (formatting, headers, footers, numbering, tables, CA language)
 *   - Visible "DRAFT – For Attorney Review Only" on every generated page (via watermark util)
 *   - Errors on missing variables with attorney-actionable messages — never silent/approximate
 *   - AI never generates legal text; only data injection + DRAFT marker
 *
 * Multi-tenancy: firmId passed through (caller enforces via checkOwnerOrStaff + helpers).
 * No Prisma here (pure generation + storage); persistence in caller (actions C).
 *
 * Ready for:
 *   - Server Actions (C)
 *   - Coordinated package generation (D)
 *   - E2E + mandatory visual fidelity tests on real attorney templates (E)
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import type { GenerateDocumentParams, GenerateDocumentResult, DocumentType } from "./types";
import {
  getFileBuffer,
  uploadGenerated,
  computeDraftFileKey,
} from "./storage";
import { applyDraftWatermark, DRAFT_TEXT } from "./draft-watermark-module";
import {
  normalizeDocxtemplaterError,
  TemplateLoadError,
  StorageError,
  DocumentGenerationError,
} from "./errors";

// -----------------------------
// Main production function
// -----------------------------

export async function generateDocument(
  params: GenerateDocumentParams,
): Promise<GenerateDocumentResult> {
  const { templateFileKey, variables, firmId, options = {} } = params;

  // 1. Defense-in-depth validation (Design §3)
  if (!templateFileKey || typeof templateFileKey !== "string") {
    throw new DocumentGenerationError("templateFileKey is required", { params });
  }
  if (!variables || typeof variables !== "object") {
    throw new DocumentGenerationError("variables (from mapper) are required", { templateFileKey });
  }
  if (!firmId || typeof firmId !== "string") {
    throw new DocumentGenerationError("firmId is required for multi-tenant scoping", { templateFileKey });
  }

  const addDraftWatermark = options.addDraftWatermark ?? true; // fidelity default
  const documentType = options.documentType;
  const clientLast = options.clientLastName || (variables.client_last_name as string) || "Client";
  const clientFirst = options.clientFirstName || (variables.client_first_name as string) || "X";
  const firmSlug = options.firmSlug;

  // 2. Template load (storage abstraction; throws descriptive on failure)
  let templateBuffer: Buffer;
  try {
    templateBuffer = await getFileBuffer(templateFileKey);
  } catch (cause) {
    throw new TemplateLoadError(templateFileKey, cause);
  }

  // 3. PizZip + docxtemplater setup (exact per Design + fidelity)
  let zip: PizZip;
  let doc: Docxtemplater;
  try {
    zip = new PizZip(templateBuffer);

    // DRAFT is applied post-render via applyDraftWatermark (draft-watermark-module.ts).
    // Do not pass createDraftWatermarkModule() here — it is a stub without parse/render hooks
    // and docxtemplater rejects it with "module cannot be wrapped".
    doc = new Docxtemplater(zip, {
      paragraphLoop: true, // Enables {#children}...{/children} and similar loops
      // Standard delimiters { } — attorney templates use these (or documented custom)
      // nullGetter left default (throws on missing → we catch below for clear errors)
    });
  } catch (err) {
    const causeMsg = err instanceof Error ? err.message : String(err);
    throw new DocumentGenerationError(
      `Failed to initialize docxtemplater for template ${templateFileKey}. ${causeMsg} ` +
        `(If the cause mentions zip/XML, verify the file is a valid .docx. ` +
        `If it mentions tags or "Multi error", fix placeholder syntax in the template.)`,
      { templateFileKey, cause: causeMsg },
    );
  }

  // 4. Inject data (mapper output guarantees safe values for loops/conditionals)
  try {
    doc.setData(variables);
  } catch (err) {
    throw normalizeDocxtemplaterError(err, templateFileKey, undefined, documentType);
  }

  // 5. Compile (validates template structure + tags)
  try {
    doc.compile();
  } catch (err) {
    throw normalizeDocxtemplaterError(err, templateFileKey, undefined, documentType);
  }

  // 6. Render (the moment of truth — data merged into template XML)
  try {
    doc.render();
  } catch (err) {
    // This is where missing placeholder errors surface from docxtemplater
    throw normalizeDocxtemplaterError(err, templateFileKey, undefined, documentType);
  }

  // 7. DRAFT watermark (applied post-render on the final zip for precision & fidelity)
  //    The module stub is present in constructor; explicit apply guarantees "every page" + no layout mutation of original.
  let finalZip = doc.getZip();
  if (addDraftWatermark) {
    applyDraftWatermark(finalZip);
    // Re-obtain in case apply mutated (it does via zip.file)
    finalZip = doc.getZip();
  }

  // 8. Generate output buffer (nodebuffer for server use / ZIP assembly)
  let generatedBuffer: Buffer;
  try {
    generatedBuffer = finalZip.generate({
      type: "nodebuffer",
      compression: "DEFLATE", // Reasonable size; attorney docs are small
    });
  } catch (err) {
    throw new DocumentGenerationError(
      `Failed to serialize generated document for ${templateFileKey}`,
      { templateFileKey, cause: err instanceof Error ? err.message : err },
    );
  }

  // 9. Compute canonical fileKey + upload (fidelity naming + storage)
  const fileKey = computeDraftFileKey({
    clientLastName: clientLast,
    clientFirstName: clientFirst,
    documentType: documentType || "document",
    firmSlug,
  });

  try {
    await uploadGenerated(generatedBuffer, fileKey);
  } catch (cause) {
    throw new StorageError("write", fileKey, cause);
  }

  // 10. Return for immediate use (download or package ZIP in D) + record in GeneratedDocument (by caller)
  return {
    fileKey,
    buffer: generatedBuffer,
    documentType,
  };
}

// -----------------------------
// Convenience re-exports / helpers
// -----------------------------

export { DRAFT_TEXT } from "./draft-watermark-module";
export { applyDraftWatermark } from "./draft-watermark-module";

// For tests / future package logic that wants to pre-validate variables without full generation.
export function validateVariablesForTemplate(
  variables: Record<string, unknown>,
  _templateFileKey: string, // reserved for future static analysis of tags
): { ok: true } | { ok: false; missing: string[] } {
  // Placeholder — real static analysis would require parsing the docx XML for placeholders.
  // For now we rely on runtime render errors (which are precise thanks to our error wrapper).
  // Extend here if a tag linter is added later.
  if (!variables || Object.keys(variables).length === 0) {
    return { ok: false, missing: ["(no variables provided)"] };
  }
  return { ok: true };
}
