/**
 * Behavioral integration: dashboard upload → normalize → store → report.
 *
 * Mirrors the persist composition in `uploadTemplateForCurrentFirm` (PR #7)
 * without Clerk/RBAC: prepareTemplateUpload → uploadTemplate (normalized primary
 * + original side file) → getFileBuffer assertions + summary shape checks.
 *
 * Reuses Trust Family corpus + synthetic fixtures from template-normalize/.
 *
 * Run:
 *   cd apps/web && pnpm test:unit:upload-normalize
 *   # or: pnpm test:unit:normalize  (includes prepare-template-upload.*.test.ts)
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

import {
  computeOriginalTemplateFileKey,
  computeTemplateFileKey,
  getFileBuffer,
  uploadTemplate,
} from "./storage";
import { prepareTemplateUpload } from "./template-normalize/prepare-template-upload";
import {
  createBrokenTemplateFixtureDocx,
  createDocxFromDocumentXml,
  createSplitRunFixtureDocx,
  paragraphWithRuns,
  wrapDocumentXml,
} from "./template-normalize/docx-fixture";

/** Corpus fixtures: prefer cwd (apps/web via pnpm), else module-relative. */
const WEB_ROOT = existsSync(path.join(process.cwd(), ".local-document-storage"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Must match storage.ts LOCAL_ROOT (always process.cwd()). */
const STORAGE_ROOT = path.resolve(process.cwd(), ".local-document-storage");

const TRUST_FAMILY = [
  {
    id: "mprg7y50",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
  },
  {
    id: "mprnxupt",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprnxupt.docx",
  },
  {
    id: "mprpud8a",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprpud8a.docx",
  },
] as const;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function resolveLocalPath(fileKey: string): string {
  const safeKey = fileKey.replace(/\.\./g, "_");
  return path.join(STORAGE_ROOT, safeKey);
}

/**
 * Same persist steps as uploadTemplateForCurrentFirm after prepareTemplateUpload succeeds.
 * Isolated under templates/_pipeline_test/ so we can delete after assertions.
 */
async function persistPreparedUpload(opts: {
  originalBuffer: Buffer;
  normalizedBuffer: Buffer;
  documentType?: string;
  originalName?: string;
  timestamp?: string;
}): Promise<{ fileKey: string; originalFileKey: string }> {
  const fileKey = computeTemplateFileKey({
    documentType: opts.documentType ?? "revocable_trust",
    originalName: opts.originalName ?? "pipeline-test.docx",
    firmSlug: "_pipeline_test",
    timestamp: opts.timestamp ?? `t${Date.now().toString(36)}`,
  });
  const originalFileKey = computeOriginalTemplateFileKey(fileKey);

  await uploadTemplate(opts.normalizedBuffer, fileKey);
  await uploadTemplate(opts.originalBuffer, originalFileKey);

  return { fileKey, originalFileKey };
}

async function cleanupKeys(...keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await rm(resolveLocalPath(key), { force: true });
    } catch {
      // best-effort cleanup for local FS storage
    }
  }
}

// ---------------------------------------------------------------------------
// Storage key pairing (generation primary vs audit original)
// ---------------------------------------------------------------------------

test("computeOriginalTemplateFileKey pairs *.docx → *.original.docx", () => {
  const primary = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "Trust-Family.docx",
    firmSlug: "austin",
    timestamp: "fixedts",
  });
  assert.equal(
    primary,
    "templates/austin/revocable_trust/Trust-Family-fixedts.docx",
  );
  assert.equal(
    computeOriginalTemplateFileKey(primary),
    "templates/austin/revocable_trust/Trust-Family-fixedts.original.docx",
  );
  assert.equal(
    computeOriginalTemplateFileKey("templates/x/durable_poa/plain"),
    "templates/x/durable_poa/plain.original.docx",
  );
});

// ---------------------------------------------------------------------------
// upload → normalize → store (primary = normalized, side = original)
// ---------------------------------------------------------------------------

test("pipeline: messy upload stores normalized primary + raw original side file", async () => {
  const input = createSplitRunFixtureDocx();
  const prepared = prepareTemplateUpload(input);
  assert.equal(prepared.ok, true, "split-run fixture must validate after normalize");
  if (!prepared.ok) return;

  const { fileKey, originalFileKey } = await persistPreparedUpload({
    originalBuffer: prepared.originalBuffer,
    normalizedBuffer: prepared.normalizedBuffer,
    originalName: "messy-split-runs.docx",
    timestamp: "split1",
  });

  try {
    const primary = await getFileBuffer(fileKey);
    const original = await getFileBuffer(originalFileKey);

    // Primary bytes are the normalized artifact (what Template.fileKey / generation reads)
    assert.equal(sha256(primary), sha256(prepared.normalizedBuffer));
    assert.notEqual(
      sha256(primary),
      sha256(input),
      "primary must differ from raw upload when repairs/renames apply",
    );

    // Side file is the attorney original (byte-identical)
    assert.equal(sha256(original), sha256(input));
    assert.equal(sha256(original), sha256(prepared.originalBuffer));

    const primaryXml = new PizZip(primary).file("word/document.xml")!.asText();
    assert.match(primaryXml, /\{client_full_name\}/);
    assert.match(primaryXml, /\{#children\}/);
    assert.ok(!primaryXml.includes("{child}"), "alias rename must be in stored primary");

    const rawXml = new PizZip(original).file("word/document.xml")!.asText();
    assert.ok(
      rawXml.includes("{child}") || rawXml.includes("{client_"),
      "original side file should retain pre-normalize tag shape",
    );
  } finally {
    await cleanupKeys(fileKey, originalFileKey);
  }
});

test("pipeline: rejected validation must not persist any storage keys", async () => {
  const broken = createBrokenTemplateFixtureDocx();
  const prepared = prepareTemplateUpload(broken);
  assert.equal(prepared.ok, false);

  // Mirror action gate: only persist when prepared.ok
  const fileKey = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "broken.docx",
    firmSlug: "_pipeline_test",
    timestamp: "reject1",
  });
  const originalFileKey = computeOriginalTemplateFileKey(fileKey);

  if (!prepared.ok) {
    // Intentionally do not call uploadTemplate — same as the Server Action
  }

  await assert.rejects(
    () => getFileBuffer(fileKey),
    /getFileBuffer failed/,
    "primary key must not exist after rejected upload",
  );
  await assert.rejects(
    () => getFileBuffer(originalFileKey),
    /getFileBuffer failed/,
    "original side key must not exist after rejected upload",
  );
});

// ---------------------------------------------------------------------------
// Report / summary fields (repairs, renames, warnings, highlights)
// ---------------------------------------------------------------------------

test("pipeline: summary exposes repair / rename / warning / highlight fields", () => {
  const prepared = prepareTemplateUpload(createSplitRunFixtureDocx());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const { summary, report } = prepared;

  assert.equal(typeof summary.repairCount, "number");
  assert.equal(typeof summary.renameCount, "number");
  assert.equal(typeof summary.warningCount, "number");
  assert.equal(typeof summary.detectionCount, "number");
  assert.equal(typeof summary.errorCount, "number");
  assert.equal(summary.repairCount, report.repairs.length);
  assert.equal(summary.renameCount, report.renames.length);
  assert.equal(summary.warningCount, report.warnings.length);
  assert.equal(summary.errorCount, report.errors.length);
  assert.ok(summary.repairCount >= 1);
  assert.ok(summary.renameCount >= 1);
  assert.ok(Array.isArray(summary.highlights));
  assert.ok(summary.highlights.length > 0);
  for (const h of summary.highlights) {
    assert.ok(["repair", "rename", "detection", "warning", "error"].includes(h.kind));
    assert.ok(typeof h.code === "string" && h.code.length > 0);
    assert.ok(typeof h.message === "string");
  }
  // Client-safe: no buffer payloads in the UI-facing summary
  const json = JSON.stringify(summary);
  assert.ok(!json.includes("normalizedBuffer"));
  assert.ok(!json.includes("originalBuffer"));
});

test("pipeline: warnings / suggestions do not block upload (ok stays true)", () => {
  // Low-confidence underscore blank → SAMPLE_VALUE_SUGGESTION (detection), not an error.
  // Cross-paragraph-style unmatched loop openers may also warn; neither should reject.
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["_[name of second successor trustee]_"]),
    paragraphWithRuns(["County of San Diego"]),
  ].join("\n");
  const input = createDocxFromDocumentXml(wrapDocumentXml(body));
  const prepared = prepareTemplateUpload(input);

  assert.equal(prepared.ok, true, `unexpected reject: ${!prepared.ok ? prepared.error : ""}`);
  if (!prepared.ok) return;

  assert.equal(prepared.summary.ok, true);
  assert.equal(prepared.summary.errorCount, 0);
  // Either suggestion detections or warnings may appear; upload must still succeed.
  const hasSuggestion = prepared.summary.highlights.some(
    (h) => h.code === "SAMPLE_VALUE_SUGGESTION",
  );
  const hasDetectionOrWarning =
    prepared.summary.detectionCount > 0 || prepared.summary.warningCount > 0 || hasSuggestion;
  assert.ok(
    hasDetectionOrWarning,
    "expected at least detections/warnings/suggestions on soft-blank fixture",
  );
});

// ---------------------------------------------------------------------------
// Trust Family corpus through upload adapter + storage
// ---------------------------------------------------------------------------

for (const entry of TRUST_FAMILY) {
  test(`pipeline Trust Family ${entry.id}: normalize → store primary ≠ raw`, async (t) => {
    const abs = path.join(WEB_ROOT, entry.rel);
    if (!existsSync(abs)) {
      t.skip(`missing corpus file: ${entry.rel}`);
      return;
    }

    const input = readFileSync(abs);
    const prepared = prepareTemplateUpload(input);
    assert.equal(
      prepared.ok,
      true,
      `corpus ${entry.id} must pass upload validation after normalize`,
    );
    if (!prepared.ok) return;

    const { fileKey, originalFileKey } = await persistPreparedUpload({
      originalBuffer: prepared.originalBuffer,
      normalizedBuffer: prepared.normalizedBuffer,
      originalName: `Trust-Family-${entry.id}.docx`,
      timestamp: `corp-${entry.id}`,
    });

    try {
      const primary = await getFileBuffer(fileKey);
      const original = await getFileBuffer(originalFileKey);

      assert.equal(sha256(original), sha256(input), "original side file must be raw upload");
      assert.equal(
        sha256(primary),
        sha256(prepared.normalizedBuffer),
        "Template.fileKey bytes must be normalized",
      );

      // Report surface used by TemplateUploadForm
      assert.ok(prepared.summary.repairCount >= 0);
      assert.ok(prepared.summary.renameCount >= 0);
      assert.ok(prepared.summary.warningCount >= 0);
      assert.ok(prepared.summary.highlights.length >= 0);
      assert.ok(prepared.summary.validation?.ok === true);

      const primaryXml = new PizZip(primary).file("word/document.xml")!.asText();
      // Settlor spouse polarity should be positive after normalize (PR #5/#7)
      if (primaryXml.includes("spouse_full_name") && primaryXml.includes("has_spouse")) {
        assert.match(
          primaryXml,
          /\{#has_spouse\}[^]*\{spouse_full_name\}[^]*\{\/has_spouse\}/,
          "stored primary should use {#has_spouse} around settlor spouse_full_name",
        );
      }
    } finally {
      await cleanupKeys(fileKey, originalFileKey);
    }
  });
}

// ---------------------------------------------------------------------------
// Opt-out / store-original-only — not implemented on PR #7 (documented gap)
// ---------------------------------------------------------------------------

test("opt-out skipNormalize FormData flag is not implemented yet (needs from Dev)", (t) => {
  // PR #7 always normalizes and always writes *.original.docx alongside primary.
  // There is no FormData flag (e.g. skipNormalize / storeOriginalOnly) to opt out.
  // When Dev adds one, replace this todo with behavioral asserts:
  //   - skipNormalize=true → Template.fileKey bytes === raw upload
  //   - optional: no *.original.docx when already storing raw as primary
  //   - summary.ok / counts reflect skipped normalize (or a skipped:true field)
  t.todo(
    "Dev: add explicit opt-out FormData flag name + semantics if attorneys may store raw-only; then assert primary/original keys + report for that path",
  );
});
