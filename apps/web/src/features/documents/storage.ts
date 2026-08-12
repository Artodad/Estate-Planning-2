/**
 * Thin storage abstraction for document generation (Phase 4 Sub-agent B) + template upload (Phase 5+).
 *
 * Design §3 + §6: template loading via fileKey (from Template records) and upload of generated DRAFTs.
 * Also supports owner-uploaded attorney .docx templates via uploadTemplate / computeTemplateFileKey.
 * Used by generator.ts and the template upload Server Action.
 *
 * Dev implementation: local filesystem under .local-document-storage/ (namespaced by key).
 *   - Stage real attorney .docx templates here for verification (e.g. copy a template to .local-document-storage/templates/seed/austin/revocable_trust_ca_v1.docx).
 *   - Generated outputs also land here for inspection/download in dev.
 *
 * Production: Replace body with Supabase Storage (or S3) client using service-role key.
 *   - Add `@supabase/supabase-js` (if not present).
 *   - Buckets: private "document-templates", "generated-drafts".
 *   - Use createClient( url, serviceRoleKey, { auth: { persistSession: false } } ).
 *   - get: .storage.from(bucket).download(key) -> Buffer
 *   - upload: .storage.from(bucket).upload(key, buffer, { contentType, upsert: true })
 *   - All server-only after firm RBAC (never expose keys to client).
 *
 * Security: Keys are opaque. No public URLs. Access only after checkOwnerOrStaff + firmId scope.
 * File naming follows fidelity.mdc exactly (see computeDraftFileKey + generator).
 *
 * NEVER log file contents. Only keys + metadata.
 */

import fs from "fs/promises";
import path from "path";

const LOCAL_ROOT = path.resolve(process.cwd(), ".local-document-storage");

// Ensure parent dirs exist for a given file path.
async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

function resolveLocalPath(fileKey: string): string {
  // Prevent path traversal in dev (keys are trusted from our DB/templates).
  const safeKey = fileKey.replace(/\.\./g, "_");
  return path.join(LOCAL_ROOT, safeKey);
}

/**
 * Load a template (or any stored .docx) by its fileKey.
 * Throws TemplateLoadError (wrapped by caller) or StorageError.
 */
export async function getFileBuffer(fileKey: string): Promise<Buffer> {
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error("[storage] getFileBuffer called with invalid fileKey");
  }

  const localPath = resolveLocalPath(fileKey);

  try {
    const buf = await fs.readFile(localPath);
    return buf;
  } catch (cause) {
    // In dev this surfaces "file not found" with actionable path.
    // In real prod this would be the Supabase 404 equivalent.
    throw new Error(
      `[storage] getFileBuffer failed for key="${fileKey}" (local path: ${localPath}). ` +
        `For local dev/testing: place your attorney .docx template at that exact path. ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Persist a generated DRAFT .docx (or ZIP later).
 * Returns the fileKey (for recording in GeneratedDocument).
 */
export async function uploadGenerated(
  buffer: Buffer,
  fileKey: string,
  contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
): Promise<string> {
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error("[storage] uploadGenerated called with invalid fileKey");
  }
  if (!buffer || buffer.length === 0) {
    throw new Error("[storage] uploadGenerated called with empty buffer");
  }

  const localPath = resolveLocalPath(fileKey);
  await ensureParentDir(localPath);

  try {
    await fs.writeFile(localPath, buffer);
    // In Supabase impl this would return the key or a signed ref; here we just confirm.
    return fileKey;
  } catch (cause) {
    throw new Error(
      `[storage] uploadGenerated failed for key="${fileKey}". ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Compute the canonical DRAFT fileKey per fidelity.mdc + Design.
 * Format: generated/{optional firmSlug/}{YYYY-MM-DD}/{Last}-{First}-{DocType}-DRAFT-{YYYY-MM-DD}.docx
 *
 * Used by generator + future package manifest.
 * Matches examples in seed.ts (generated/seed/...).
 */
export function computeDraftFileKey(opts: {
  clientLastName: string;
  clientFirstName: string;
  documentType: string;
  date?: string; // YYYY-MM-DD
  firmSlug?: string;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const d = opts.date || today;

  const ln = (opts.clientLastName || "Client").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "Client";
  const fn = (opts.clientFirstName || "X").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "X";
  const dt = opts.documentType.replace(/_/g, "-");

  const prefix = opts.firmSlug ? `generated/${opts.firmSlug}/` : "generated/";
  return `${prefix}${d}/${ln}-${fn}-${dt}-DRAFT-${d}.docx`;
}

/**
 * Compute a safe storage key for an attorney-uploaded .docx template.
 * Namespaced under templates/ for separation from generated/ artifacts.
 * Format: templates/{optional firmSlug/}{documentType}/{sanitizedBase}-{timestamp}.docx
 *
 * Used by uploadTemplateForCurrentFirm. Keeps keys opaque and collision-resistant per firm.
 * Matches the style and safety of computeDraftFileKey.
 */
export function computeTemplateFileKey(opts: {
  documentType: string;
  originalName?: string;
  firmSlug?: string;
  timestamp?: string; // for determinism in tests
}): string {
  const ts = opts.timestamp || Date.now().toString(36);
  const dt = opts.documentType.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "template";
  const base = (opts.originalName || "template")
    .replace(/\.[^.]+$/, "") // drop extension
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60) || "template";

  const prefix = opts.firmSlug ? `templates/${opts.firmSlug}/` : "templates/";
  return `${prefix}${dt}/${base}-${ts}.docx`;
}

/**
 * Persist an attorney .docx template uploaded via the owner-only Templates UI.
 * Returns the fileKey (to be recorded in the Prisma Template row).
 * Symmetric to uploadGenerated but intended for input templates (never overwritten by generation).
 */
export async function uploadTemplate(
  buffer: Buffer,
  fileKey: string,
  contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
): Promise<string> {
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error("[storage] uploadTemplate called with invalid fileKey");
  }
  if (!buffer || buffer.length === 0) {
    throw new Error("[storage] uploadTemplate called with empty buffer");
  }

  const localPath = resolveLocalPath(fileKey);
  await ensureParentDir(localPath);

  try {
    await fs.writeFile(localPath, buffer);
    // In Supabase impl this would return the key or a signed ref; here we just confirm.
    return fileKey;
  } catch (cause) {
    throw new Error(
      `[storage] uploadTemplate failed for key="${fileKey}". ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

// Optional: helper to ensure the dev root exists (call on app boot or in generator if desired).
export async function ensureLocalStorageRoot(): Promise<void> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
}
