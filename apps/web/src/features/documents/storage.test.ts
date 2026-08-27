/**
 * Storage backend choice + disk/blob adapters.
 *
 * Blob path is fully mocked — no real Vercel Blob account.
 * Disk path stays the verify-instance / local-dev implementation.
 *
 * Run: pnpm --filter web test:unit
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";

import {
  computeOriginalTemplateFileKey,
  computeTemplateFileKey,
  getFileBuffer,
  resolveDocumentStorageBackend,
  uploadGenerated,
  uploadTemplate,
  type BlobObjectStore,
} from "./storage";

const STORAGE_ROOT = path.resolve(process.cwd(), ".local-document-storage");

function resolveLocalPath(fileKey: string): string {
  return path.join(STORAGE_ROOT, fileKey.replace(/\.\./g, "_"));
}

async function cleanupKeys(...keys: Array<string | undefined>): Promise<void> {
  for (const key of keys) {
    if (!key) continue;
    try {
      await rm(resolveLocalPath(key), { force: true });
    } catch {
      // best-effort
    }
  }
}

function createMemoryBlobStore(): BlobObjectStore & { puts: string[]; urlsLeaked: boolean } {
  const files = new Map<string, Buffer>();
  const puts: string[] = [];
  return {
    puts,
    urlsLeaked: false,
    async put(pathname, body) {
      puts.push(pathname);
      files.set(pathname, Buffer.from(body));
      // Adapter must not require callers to store a URL.
    },
    async get(pathname) {
      return files.get(pathname) ?? null;
    },
  };
}

test("resolveDocumentStorageBackend: local / verify default to disk", () => {
  assert.equal(resolveDocumentStorageBackend({}), "disk");
  assert.equal(resolveDocumentStorageBackend({ DOCUMENT_STORAGE: "disk" }), "disk");
  assert.equal(
    resolveDocumentStorageBackend({
      NODE_TEST_CONTEXT: "1",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_fake",
    }),
    "disk",
  );
  assert.equal(
    resolveDocumentStorageBackend({
      VERCEL: "1",
      VERCEL_ENV: "development",
    }),
    "disk",
  );
});

test("resolveDocumentStorageBackend: Vercel production/preview use blob", () => {
  assert.equal(
    resolveDocumentStorageBackend({
      VERCEL: "1",
      VERCEL_ENV: "production",
    }),
    "blob",
  );
  assert.equal(
    resolveDocumentStorageBackend({
      VERCEL: "1",
      VERCEL_ENV: "preview",
    }),
    "blob",
  );
  // Disk cannot work on read-only /var/task even if forced.
  assert.equal(
    resolveDocumentStorageBackend({
      VERCEL: "1",
      VERCEL_ENV: "production",
      DOCUMENT_STORAGE: "disk",
    }),
    "blob",
  );
  assert.equal(
    resolveDocumentStorageBackend({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_fake",
    }),
    "blob",
  );
  assert.equal(resolveDocumentStorageBackend({ DOCUMENT_STORAGE: "blob" }), "blob");
});

test("disk uploadTemplate / getFileBuffer roundtrip (verify-instance path)", async () => {
  const fileKey = `templates/_storage_unit/revocable_trust/disk-roundtrip-${Date.now()}.docx`;
  const buffer = Buffer.from("PK-disk-storage-fixture");

  try {
    const returned = await uploadTemplate(buffer, fileKey, undefined, { backend: "disk" });
    assert.equal(returned, fileKey, "must return opaque fileKey, not a URL");
    assert.ok(existsSync(resolveLocalPath(fileKey)));

    const loaded = await getFileBuffer(fileKey, { backend: "disk" });
    assert.deepEqual(loaded, buffer);
  } finally {
    await cleanupKeys(fileKey);
  }
});

test("blob uploadTemplate / getFileBuffer uses mock store and never writes disk", async () => {
  const fileKey = `templates/my-organization-1787191546766101598/revocable_trust/Trust-Family-${Date.now()}.docx`;
  const originalKey = computeOriginalTemplateFileKey(fileKey);
  const normalized = Buffer.from("PK-normalized-template");
  const original = Buffer.from("PK-original-template");
  const store = createMemoryBlobStore();

  const primary = await uploadTemplate(normalized, fileKey, undefined, {
    backend: "blob",
    blobStore: store,
  });
  const side = await uploadTemplate(original, originalKey, undefined, {
    backend: "blob",
    blobStore: store,
  });

  assert.equal(primary, fileKey);
  assert.equal(side, originalKey);
  assert.equal(primary.startsWith("http"), false);
  assert.equal(side.includes("blob.vercel-storage.com"), false);
  assert.deepEqual(store.puts, [fileKey, originalKey]);

  const loadedPrimary = await getFileBuffer(fileKey, { backend: "blob", blobStore: store });
  const loadedOriginal = await getFileBuffer(originalKey, { backend: "blob", blobStore: store });
  assert.deepEqual(loadedPrimary, normalized);
  assert.deepEqual(loadedOriginal, original);

  assert.equal(
    existsSync(resolveLocalPath(fileKey)),
    false,
    "blob backend must not mkdir / write .local-document-storage",
  );
});

test("blob uploadGenerated returns fileKey and is readable after 'cold' store reuse", async () => {
  const fileKey = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "Trust-Family.docx",
    firmSlug: "my-organization-1787191546766101598",
    timestamp: "coldstart",
  }).replace("templates/", "generated/");
  const draft = Buffer.from("PK-generated-draft");
  const store = createMemoryBlobStore();

  const returned = await uploadGenerated(draft, fileKey, undefined, {
    backend: "blob",
    blobStore: store,
  });
  assert.equal(returned, fileKey);

  // New options object, same store — models a later generate/download hitting the same key.
  const loaded = await getFileBuffer(fileKey, { backend: "blob", blobStore: store });
  assert.deepEqual(loaded, draft);
});

test("blob backend without credentials fails before touching disk or the Blob network", async () => {
  const fileKey = `templates/_storage_unit/revocable_trust/no-creds-${Date.now()}.docx`;
  const buffer = Buffer.from("PK-should-not-write");

  await assert.rejects(
    () =>
      uploadTemplate(buffer, fileKey, undefined, {
        backend: "blob",
        env: {},
      }),
    /Object storage is not configured/,
  );
  await assert.rejects(
    () =>
      getFileBuffer(fileKey, {
        backend: "blob",
        env: { VERCEL_ENV: "production" },
      }),
    /Object storage is not configured|getFileBuffer failed/,
  );

  assert.equal(existsSync(resolveLocalPath(fileKey)), false);
});

test("blob getFileBuffer misses stay blob errors (no local path /var/task hint)", async () => {
  const store = createMemoryBlobStore();
  await assert.rejects(
    () =>
      getFileBuffer("templates/missing/revocable_trust/nope.docx", {
        backend: "blob",
        blobStore: store,
      }),
    /getFileBuffer failed for key=.*\(blob\)/,
  );
});
