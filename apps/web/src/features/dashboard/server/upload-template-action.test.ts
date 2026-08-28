/**
 * Clerk-mocked Server Action coverage for template upload.
 *
 * Calls `executeUploadTemplateForCurrentFirm` (the action core wired by
 * `uploadTemplateForCurrentFirm`) with mocked checkOwnerOrStaff / Prisma /
 * audit — no owner Clerk credentials, no Next runtime.
 *
 * Real: prepareTemplateUpload + local FS storage (same as upload-normalize pipeline).
 *
 * Run: pnpm test:unit:upload-normalize
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";

import {
  computeOriginalTemplateFileKey,
  getFileBuffer,
} from "@/features/documents/storage";
import {
  createBrokenTemplateFixtureDocx,
  createSplitRunFixtureDocx,
  createTrustLeftoverPunchFixtureDocx,
} from "@/features/documents/template-normalize/docx-fixture";
import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";
import {
  leftoverCountFromNormalizeReport,
  leftoverPunchFromNormalizeReport,
  taggedCountFromNormalizeReport,
  templatePunchFromStoredReport,
} from "@/features/dashboard/components/normalize-report-punch-list";
import type { AuthContext } from "@/features/auth/types";
import {
  executeUploadTemplateForCurrentFirm,
  type OwnerStaffCheckResult,
  type UploadTemplateActionDeps,
} from "./upload-template-action";

const STORAGE_ROOT = path.resolve(process.cwd(), ".local-document-storage");

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

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

function ownerAuth(overrides?: Partial<AuthContext>): OwnerStaffCheckResult {
  return {
    ok: true,
    role: "owner",
    context: {
      userId: "user_clerk_test",
      email: "owner@test.firm",
      firstName: "Test",
      lastName: "Owner",
      role: "owner",
      currentFirm: {
        id: "firm_test_upload",
        clerkOrgId: "org_test",
        name: "Test Firm",
        slug: "_action_test",
        role: "owner",
      },
      ...overrides,
    },
  };
}

function buildFormData(opts: {
  buffer: Buffer;
  fileName?: string;
  name?: string;
  documentType?: string;
  skipNormalize?: boolean;
  confirmSoftSuggestions?: boolean;
  acceptedSuggestionIds?: string[];
}): FormData {
  const fd = new FormData();
  const bytes = new Uint8Array(opts.buffer);
  fd.set(
    "file",
    new File([bytes], opts.fileName ?? "template.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  fd.set("name", opts.name ?? `Action Test ${Date.now()}`);
  fd.set("documentType", opts.documentType ?? "revocable_trust");
  if (opts.skipNormalize) {
    fd.set("skipNormalize", "on");
  }
  if (opts.confirmSoftSuggestions) {
    fd.set("confirmSoftSuggestions", "true");
  }
  for (const id of opts.acceptedSuggestionIds ?? []) {
    fd.append("acceptedSuggestionIds", id);
  }
  return fd;
}

function makeDeps(auth: OwnerStaffCheckResult) {
  const created: Array<{
    id: string;
    firmId: string;
    fileKey: string;
    name: string;
    normalizeReport?: unknown;
  }> = [];
  const audits: Array<{
    action?: string;
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  }> = [];
  const revalidated: string[] = [];
  const state = { authCalls: 0 };

  const deps: UploadTemplateActionDeps = {
    checkOwnerOrStaff: async () => {
      state.authCalls += 1;
      return auth;
    },
    createForFirm: async (firmId, data) => {
      const row = {
        id: `tpl_${created.length + 1}`,
        firmId,
        name: data.name,
        fileKey: data.fileKey,
        documentType: data.documentType,
        description: data.description ?? null,
        isActive: true,
        normalizeReport: data.normalizeReport ?? null,
      };
      created.push(row);
      return row;
    },
    logAuditEvent: (event) => {
      audits.push(event);
    },
    revalidatePath: (p) => {
      revalidated.push(p);
    },
  };

  return { deps, created, audits, revalidated, state };
}

// ---------------------------------------------------------------------------
// Auth fail
// ---------------------------------------------------------------------------

test("action auth fail: rejects and persists nothing (no DB, no storage)", async () => {
  const input = createSplitRunFixtureDocx();
  const formData = buildFormData({ buffer: input, name: "Should Not Persist" });
  const harness = makeDeps({
    ok: false,
    error: "Insufficient permissions for this action.",
    role: null,
    context: null,
  });

  const result = await executeUploadTemplateForCurrentFirm(
    formData,
    harness.deps,
  );

  assert.ok("error" in result);
  assert.match(result.error, /Insufficient permissions/i);
  assert.equal(harness.state.authCalls, 1);
  assert.equal(harness.created.length, 0);
  assert.equal(harness.audits.length, 0);
  assert.equal(harness.revalidated.length, 0);
});

test("action auth fail: missing firm context rejects without persist", async () => {
  const formData = buildFormData({ buffer: createSplitRunFixtureDocx() });
  const harness = makeDeps(
    ownerAuth({
      currentFirm: {
        id: null,
        clerkOrgId: "org_x",
        name: "No Firm Yet",
        slug: null,
        role: "owner",
      },
    }),
  );

  const result = await executeUploadTemplateForCurrentFirm(
    formData,
    harness.deps,
  );

  assert.ok("error" in result);
  assert.match(result.error, /Active firm context required/i);
  assert.equal(harness.created.length, 0);
});

// ---------------------------------------------------------------------------
// Auth success + default normalize
// ---------------------------------------------------------------------------

test("action auth success: normalize path stores primary + *.original.docx + report", async () => {
  const input = createSplitRunFixtureDocx();
  const formData = buildFormData({
    buffer: input,
    fileName: "messy-action.docx",
    name: "Normalized Via Action",
  });
  const harness = makeDeps(ownerAuth());

  const result = await executeUploadTemplateForCurrentFirm(
    formData,
    harness.deps,
  );

  assert.ok("success" in result && result.success, JSON.stringify(result));
  if (!("success" in result) || !result.success) return;

  const { template, normalizeReport, originalFileKey } = result;
  try {
    assert.equal(template.firmId, "firm_test_upload");
    assert.equal(template.name, "Normalized Via Action");
    assert.ok(template.fileKey.includes("templates/_action_test/"));
    assert.ok(originalFileKey);
    assert.equal(
      originalFileKey,
      computeOriginalTemplateFileKey(template.fileKey),
    );
    assert.match(originalFileKey!, /\.original\.docx$/);

    assert.equal(normalizeReport.skipped, undefined);
    assert.ok(normalizeReport.repairCount >= 1);
    assert.ok(normalizeReport.renameCount >= 1);
    assert.ok(Array.isArray(normalizeReport.highlights));

    const primary = await getFileBuffer(template.fileKey);
    const original = await getFileBuffer(originalFileKey!);
    assert.equal(sha256(original), sha256(input));
    assert.notEqual(sha256(primary), sha256(input));

    const primaryXml = new PizZip(primary).file("word/document.xml")!.asText();
    assert.match(primaryXml, /\{#children\}/);
    assert.ok(!primaryXml.includes("{#child}"));

    assert.equal(harness.created.length, 1);
    assert.equal(harness.audits.length, 1);
    assert.equal(harness.audits[0]!.action, "template.uploaded");
    assert.equal(harness.audits[0]!.metadata?.normalized, true);
    assert.equal(harness.audits[0]!.metadata?.skipNormalize, false);
    assert.deepEqual(harness.revalidated, [
      "/dashboard/templates",
      `/dashboard/templates/${template.id}`,
    ]);
  } finally {
    await cleanupKeys(template.fileKey, originalFileKey);
  }
});

// ---------------------------------------------------------------------------
// Auth success + skipNormalize
// ---------------------------------------------------------------------------

test("action auth success: skipNormalize stores as-is, no original side file, summary.skipped", async () => {
  const input = createSplitRunFixtureDocx();
  const formData = buildFormData({
    buffer: input,
    fileName: "skip-action.docx",
    name: "Skipped Normalize Via Action",
    skipNormalize: true,
  });
  const harness = makeDeps(ownerAuth());

  const result = await executeUploadTemplateForCurrentFirm(
    formData,
    harness.deps,
  );

  assert.ok("success" in result && result.success, JSON.stringify(result));
  if (!("success" in result) || !result.success) return;

  const { template, normalizeReport, originalFileKey } = result;
  try {
    assert.equal(originalFileKey, undefined);
    assert.equal(normalizeReport.skipped, true);
    assert.equal(normalizeReport.repairCount, 0);
    assert.equal(normalizeReport.renameCount, 0);
    assert.equal(normalizeReport.highlights.length, 0);

    const primary = await getFileBuffer(template.fileKey);
    assert.equal(sha256(primary), sha256(input));

    const sideKey = computeOriginalTemplateFileKey(template.fileKey);
    await assert.rejects(() => getFileBuffer(sideKey), /getFileBuffer failed/);

    const primaryXml = new PizZip(primary).file("word/document.xml")!.asText();
    assert.ok(primaryXml.includes("{#child}"));

    assert.equal(harness.audits[0]!.metadata?.normalized, false);
    assert.equal(harness.audits[0]!.metadata?.skipNormalize, true);
  } finally {
    await cleanupKeys(template.fileKey);
  }
});

// ---------------------------------------------------------------------------
// Auth success + syntax reject (still no persist)
// ---------------------------------------------------------------------------

test("action auth success: syntax-fail normalize rejects with no Template row / storage", async () => {
  const formData = buildFormData({
    buffer: createBrokenTemplateFixtureDocx(),
    name: "Broken Must Reject",
  });
  const harness = makeDeps(ownerAuth());

  const result = await executeUploadTemplateForCurrentFirm(
    formData,
    harness.deps,
  );

  assert.ok("error" in result);
  assert.match(result.error, /failed validation after normalization/i);
  assert.equal(result.details, "NORMALIZE_VALIDATION_FAILED");
  assert.ok(result.normalizeReport);
  assert.equal(result.normalizeReport!.ok, false);
  assert.equal(harness.created.length, 0);
  assert.equal(harness.audits.length, 0);
  assert.equal(harness.revalidated.length, 0);
});

// ---------------------------------------------------------------------------
// Persist leftover punch — reload reads stored report, not toast
// ---------------------------------------------------------------------------

test("Trust leftover punch persists on Template; reload reads stored report", async () => {
  const input = createTrustLeftoverPunchFixtureDocx();
  const preview = await executeUploadTemplateForCurrentFirm(
    buildFormData({
      buffer: input,
      fileName: "trust-leftover.docx",
      name: "Chase Trust Leftover Punch",
    }),
    makeDeps(ownerAuth()).deps,
  );

  assert.ok("needsConfirmation" in preview && preview.needsConfirmation);
  assert.ok(preview.normalizeReport.softSuggestions.length >= 1);

  const persistHarness = makeDeps(ownerAuth());
  const result = await executeUploadTemplateForCurrentFirm(
    buildFormData({
      buffer: input,
      fileName: "trust-leftover.docx",
      name: "Chase Trust Leftover Punch",
      confirmSoftSuggestions: true,
    }),
    persistHarness.deps,
  );

  assert.ok("success" in result && result.success, JSON.stringify(result));
  if (!("success" in result) || !result.success) return;

  try {
    assert.equal(persistHarness.created.length, 1);
    const storedRow = persistHarness.created[0]!;
    assert.ok(storedRow.normalizeReport, "createForFirm must receive normalizeReport");

    // Reload analog: JSON round-trip as Prisma Json would return.
    const reloaded = parseStoredNormalizeReport(
      JSON.parse(JSON.stringify(storedRow.normalizeReport)),
    );
    assert.ok(reloaded, "reload must parse persisted normalizeReport");
    assert.notEqual(reloaded, result.normalizeReport, "reload is a new object, not the toast reference");

    const leftover = leftoverCountFromNormalizeReport(reloaded);
    const tagged = taggedCountFromNormalizeReport(reloaded);
    assert.ok(leftover >= 1, `expected leftover holes, got ${leftover}`);
    assert.ok(tagged >= 1, `expected tagged blanks, got ${tagged}`);
    assert.equal(leftover, leftoverPunchFromNormalizeReport(reloaded).length);

    const punch = templatePunchFromStoredReport(storedRow.normalizeReport);
    assert.equal(punch.leftoverCount, leftover);
    assert.equal(punch.taggedCount, tagged);
    assert.match(punch.punchLabel ?? "", /\d+ tagged • \d+ leftovers/);
    assert.ok(punch.leftovers.some((row) => row.before.includes("do/do not")));
  } finally {
    await cleanupKeys(result.template.fileKey, result.originalFileKey);
  }
});
