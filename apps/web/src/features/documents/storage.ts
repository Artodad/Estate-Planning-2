/**
 * Thin storage abstraction for document generation + template upload.
 *
 * Design §3 + §6: template loading via fileKey (from Template records) and upload of generated DRAFTs.
 * Also supports owner-uploaded attorney .docx templates via uploadTemplate / computeTemplateFileKey.
 * Used by generator.ts and the template upload Server Action.
 *
 * Local / isolated verify: filesystem under .local-document-storage/ (namespaced by key).
 *   - Stage real attorney .docx templates here for verification.
 *   - Generated outputs also land here for inspection/download in dev.
 *
 * Production (Vercel): private Vercel Blob. Keys stay the same opaque fileKeys.
 *   - put/get with access: "private". No public URLs. Server-only after firm RBAC.
 *   - addRandomSuffix is off so the stored pathname === fileKey (generate can reload by key).
 *   - Vercel /var/task is read-only; disk mkdir will never be used on that host.
 *
 * Security: Keys are opaque. No public URLs. Access only after checkOwnerOrStaff + firmId scope.
 * File naming follows fidelity.mdc exactly (see computeDraftFileKey + generator).
 *
 * NEVER log file contents or blob URLs. Only keys + metadata.
 */

import fs from "fs/promises";
import path from "path";

const LOCAL_ROOT = path.resolve(process.cwd(), ".local-document-storage");
const DOCX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentStorageBackend = "disk" | "blob";

/**
 * Injectable Blob adapter for tests. Production uses @vercel/blob (private).
 * Callers still persist/load by opaque fileKey — never a public URL.
 */
export type BlobObjectStore = {
  put: (pathname: string, body: Buffer, contentType: string) => Promise<void>;
  get: (pathname: string) => Promise<Buffer | null>;
};

export type DocumentStorageOptions = {
  backend?: DocumentStorageBackend;
  blobStore?: BlobObjectStore;
  env?: NodeJS.ProcessEnv;
};

/**
 * Choose disk (local / verify / unit tests) vs private object storage (Vercel).
 * Explicit DOCUMENT_STORAGE wins except disk cannot be used on read-only Vercel.
 */
export function resolveDocumentStorageBackend(
  env: NodeJS.ProcessEnv = process.env,
): DocumentStorageBackend {
  const readOnlyHost = isReadOnlyVercelFilesystem(env);

  if (env.DOCUMENT_STORAGE === "disk" && !readOnlyHost) {
    return "disk";
  }
  if (env.DOCUMENT_STORAGE === "blob") {
    return "blob";
  }
  // node:test / tsx --test — keep existing disk fixtures even if a token is in the env.
  if (env.NODE_TEST_CONTEXT && !readOnlyHost) {
    return "disk";
  }
  if (env.BLOB_READ_WRITE_TOKEN) {
    return "blob";
  }
  if (readOnlyHost) {
    return "blob";
  }
  return "disk";
}

function isReadOnlyVercelFilesystem(env: NodeJS.ProcessEnv): boolean {
  // vercel dev sets VERCEL=1 but VERCEL_ENV=development and can write to disk.
  // Production and preview Functions cannot mkdir under /var/task.
  return env.VERCEL === "1" && env.VERCEL_ENV !== "development";
}

function blobCredentialsAvailable(env: NodeJS.ProcessEnv): boolean {
  // Static token (any host) or OIDC on Vercel (store connected → BLOB_STORE_ID + VERCEL_OIDC_TOKEN).
  return Boolean(env.BLOB_READ_WRITE_TOKEN || env.VERCEL === "1");
}

function resolveBackend(options?: DocumentStorageOptions): DocumentStorageBackend {
  return options?.backend ?? resolveDocumentStorageBackend(options?.env ?? process.env);
}

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

function safeStorageKey(fileKey: string): string {
  return fileKey.replace(/\.\./g, "_");
}

async function readableStreamToBuffer(
  stream: ReadableStream<Uint8Array> | null | undefined,
): Promise<Buffer> {
  if (!stream) {
    throw new Error("[storage] getFileBuffer received an empty blob stream");
  }
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function getVercelBlobClient(): Promise<typeof import("@vercel/blob")> {
  return import("@vercel/blob");
}

async function getFromBlob(
  fileKey: string,
  options?: DocumentStorageOptions,
): Promise<Buffer> {
  const safeKey = safeStorageKey(fileKey);
  const env = options?.env ?? process.env;

  if (options?.blobStore) {
    const buf = await options.blobStore.get(safeKey);
    if (!buf) {
      throw new Error(`[storage] getFileBuffer failed for key="${fileKey}" (blob).`);
    }
    return buf;
  }

  if (!blobCredentialsAvailable(env)) {
    throw new Error(
      `[storage] getFileBuffer failed for key="${fileKey}". ` +
        `Object storage is not configured (read-only host cannot use .local-document-storage).`,
    );
  }

  try {
    const { get } = await getVercelBlobClient();
    const token = env.BLOB_READ_WRITE_TOKEN;
    const result = await get(safeKey, {
      access: "private",
      useCache: false,
      ...(token ? { token } : {}),
    });
    if (!result || result.statusCode !== 200 || !result.stream) {
      throw new Error(`[storage] getFileBuffer failed for key="${fileKey}" (blob).`);
    }
    return await readableStreamToBuffer(result.stream);
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("[storage] getFileBuffer failed")) {
      throw cause;
    }
    throw new Error(
      `[storage] getFileBuffer failed for key="${fileKey}" (blob). ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function putToBlob(
  buffer: Buffer,
  fileKey: string,
  contentType: string,
  options?: DocumentStorageOptions,
): Promise<void> {
  const safeKey = safeStorageKey(fileKey);
  const env = options?.env ?? process.env;

  if (options?.blobStore) {
    await options.blobStore.put(safeKey, buffer, contentType);
    return;
  }

  if (!blobCredentialsAvailable(env)) {
    throw new Error(
      `[storage] Object storage is not configured. ` +
        `Vercel Functions cannot write .local-document-storage under /var/task.`,
    );
  }

  const { put } = await getVercelBlobClient();
  const token = env.BLOB_READ_WRITE_TOKEN;
  // Discard put() URL/metadata — callers only persist the opaque fileKey.
  await put(safeKey, buffer, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
    ...(token ? { token } : {}),
  });
}

async function getFromDisk(fileKey: string): Promise<Buffer> {
  const localPath = resolveLocalPath(fileKey);

  try {
    return await fs.readFile(localPath);
  } catch (cause) {
    throw new Error(
      `[storage] getFileBuffer failed for key="${fileKey}" (local path: ${localPath}). ` +
        `For local dev/testing: place your attorney .docx template at that exact path. ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

async function putToDisk(buffer: Buffer, fileKey: string): Promise<void> {
  const localPath = resolveLocalPath(fileKey);
  await ensureParentDir(localPath);
  await fs.writeFile(localPath, buffer);
}

async function putStoredFile(
  buffer: Buffer,
  fileKey: string,
  contentType: string,
  options: DocumentStorageOptions | undefined,
  caller: "uploadGenerated" | "uploadTemplate",
): Promise<string> {
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error(`[storage] ${caller} called with invalid fileKey`);
  }
  if (!buffer || buffer.length === 0) {
    throw new Error(`[storage] ${caller} called with empty buffer`);
  }

  const backend = resolveBackend(options);

  try {
    if (backend === "blob") {
      await putToBlob(buffer, fileKey, contentType, options);
      return fileKey;
    }
    await putToDisk(buffer, fileKey);
    return fileKey;
  } catch (cause) {
    if (
      cause instanceof Error &&
      (cause.message.includes("[storage] Object storage") ||
        cause.message.includes(`[storage] ${caller}`))
    ) {
      throw cause;
    }
    throw new Error(
      `[storage] ${caller} failed for key="${fileKey}". ` +
        `Original: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
}

/**
 * Load a template (or any stored .docx) by its fileKey.
 * Throws TemplateLoadError (wrapped by caller) or StorageError.
 */
export async function getFileBuffer(
  fileKey: string,
  options?: DocumentStorageOptions,
): Promise<Buffer> {
  if (!fileKey || typeof fileKey !== "string") {
    throw new Error("[storage] getFileBuffer called with invalid fileKey");
  }

  const backend = resolveBackend(options);
  if (backend === "blob") {
    return getFromBlob(fileKey, options);
  }
  return getFromDisk(fileKey);
}

/**
 * Persist a generated DRAFT .docx (or ZIP later).
 * Returns the fileKey (for recording in GeneratedDocument).
 */
export async function uploadGenerated(
  buffer: Buffer,
  fileKey: string,
  contentType = DOCX_CONTENT_TYPE,
  options?: DocumentStorageOptions,
): Promise<string> {
  return putStoredFile(buffer, fileKey, contentType, options, "uploadGenerated");
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
 * Side-file key for the attorney's pre-normalization .docx (audit / re-normalize).
 * Primary `fileKey` always points at the normalized bytes used for generation.
 * Format: same path with `.original.docx` instead of `.docx`.
 */
export function computeOriginalTemplateFileKey(normalizedFileKey: string): string {
  if (!normalizedFileKey || typeof normalizedFileKey !== "string") {
    throw new Error("[storage] computeOriginalTemplateFileKey called with invalid fileKey");
  }
  if (/\.docx$/i.test(normalizedFileKey)) {
    return normalizedFileKey.replace(/\.docx$/i, ".original.docx");
  }
  return `${normalizedFileKey}.original.docx`;
}

/**
 * Persist an attorney .docx template uploaded via the owner-only Templates UI.
 * Returns the fileKey (to be recorded in the Prisma Template row).
 * Symmetric to uploadGenerated but intended for input templates (never overwritten by generation).
 *
 * Callers that normalize on upload should pass the **normalized** buffer as the primary
 * key content; optionally also persist the original via computeOriginalTemplateFileKey.
 */
export async function uploadTemplate(
  buffer: Buffer,
  fileKey: string,
  contentType = DOCX_CONTENT_TYPE,
  options?: DocumentStorageOptions,
): Promise<string> {
  return putStoredFile(buffer, fileKey, contentType, options, "uploadTemplate");
}

// Optional: helper to ensure the dev root exists (call on app boot or in generator if desired).
export async function ensureLocalStorageRoot(): Promise<void> {
  await fs.mkdir(LOCAL_ROOT, { recursive: true });
}
