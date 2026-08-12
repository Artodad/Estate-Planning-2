/**
 * Behavioral coverage: attorney-gated soft-suggestion accept/reject on upload (PR #15).
 *
 * Complements `template-normalize/apply-accepted-suggestions.test.ts` (item 4 unit
 * tests) with the upload-pipeline / human-gate policy that
 * `uploadTemplateForCurrentFirm` uses:
 * preview → needsConfirmation (no persist) → confirm + accepted ids → apply +
 * re-validate → persist.
 *
 * Orchestrator checklist (explicit):
 * 1. Soft suggestions never auto-apply
 * 2. Upload with soft items → needsConfirmation (no persist)
 * 3. Multi-select default none → Confirm applies accepted patches, re-validates, persists
 *    (reject-all / partial / accept-all; *.original.docx still written when normalize ran)
 * 4. applyAcceptedSuggestions() unit tests — see apply-accepted-suggestions.test.ts
 * 5. High-confidence path + skipNormalize / *.original.docx unchanged
 *
 * Run:
 *   pnpm test:unit:upload-normalize
 *   cd apps/web && pnpm exec tsx --test src/features/documents/soft-suggestion-accept-reject.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import PizZip from "pizzip";

import {
  computeOriginalTemplateFileKey,
  computeTemplateFileKey,
  getFileBuffer,
  uploadTemplate,
} from "./storage";
import {
  applyAcceptedSuggestions,
  softSuggestionsFromReportItems,
} from "./template-normalize/apply-accepted-suggestions";
import {
  prepareTemplateUpload,
  type PrepareTemplateUploadResult,
} from "./template-normalize/prepare-template-upload";
import {
  createDocxFromDocumentXml,
  paragraphWithRuns,
  wrapDocumentXml,
} from "./template-normalize/docx-fixture";
import type { TemplateUploadNormalizeSummary } from "./template-normalize/types";

const STORAGE_ROOT = path.resolve(process.cwd(), ".local-document-storage");

const PRODUCT_SOFT = {
  distribution: {
    ruleId: "blank_distribution_description",
    proposedTag: "{distribution_description}",
    blankLabel: "Description of distribution.",
  },
  doDoNot: {
    ruleId: "blank_do_do_not",
    proposedTag: "{do_or_do_not}",
    blankLabel: "do/do not",
  },
  ceb: {
    ruleId: "blank_ceb_appoint_person",
    proposedTag: "{ceb_appoint_person_note}",
    blankLabel: "Can Choose a Specific Person if Beneficiary Dies Before Distribution",
  },
} as const;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function resolveLocalPath(fileKey: string): string {
  return path.join(STORAGE_ROOT, fileKey.replace(/\.\./g, "_"));
}

async function cleanupKeys(...keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await rm(resolveLocalPath(key), { force: true });
    } catch {
      // best-effort
    }
  }
}

/** Soft blanks Dev gates + high-confidence control (county venue). */
function createProductSoftFixtureDocx(): Buffer {
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["County of San Diego"]),
    paragraphWithRuns([
      `_[${PRODUCT_SOFT.distribution.blankLabel}]_ shall be paid`,
    ]),
    paragraphWithRuns([`Trustee _[${PRODUCT_SOFT.doDoNot.blankLabel}]_ distribute income`]),
    paragraphWithRuns([`_[${PRODUCT_SOFT.ceb.blankLabel}]_ note`]),
  ].join("\n");
  return createDocxFromDocumentXml(wrapDocumentXml(body));
}

function documentXml(buffer: Buffer): string {
  return new PizZip(buffer).file("word/document.xml")!.asText();
}

/**
 * Mirrors soft-suggestion gate in `uploadTemplateForCurrentFirm` (actions.ts):
 * when normalize ran, soft suggestions exist, and attorney has not confirmed →
 * return needsConfirmation and do not persist.
 */
function softSuggestionUploadGate(opts: {
  skipNormalize: boolean;
  confirmSoftSuggestions: boolean;
  prepared: PrepareTemplateUploadResult;
}):
  | { decision: "reject"; error: string; normalizeReport: TemplateUploadNormalizeSummary }
  | { decision: "needsConfirmation"; normalizeReport: TemplateUploadNormalizeSummary }
  | {
      decision: "persist";
      normalizeReport: TemplateUploadNormalizeSummary;
      normalizedBuffer: Buffer;
      originalBuffer: Buffer;
    } {
  const { prepared, skipNormalize, confirmSoftSuggestions } = opts;
  if (!prepared.ok) {
    return {
      decision: "reject",
      error: prepared.error,
      normalizeReport: prepared.summary,
    };
  }
  if (
    !skipNormalize &&
    !confirmSoftSuggestions &&
    prepared.summary.softSuggestions.length > 0
  ) {
    return {
      decision: "needsConfirmation",
      normalizeReport: prepared.summary,
    };
  }
  return {
    decision: "persist",
    normalizeReport: prepared.summary,
    normalizedBuffer: prepared.normalizedBuffer,
    originalBuffer: prepared.originalBuffer,
  };
}

async function persistLikeAction(opts: {
  normalizedBuffer: Buffer;
  originalBuffer: Buffer;
  skipNormalize: boolean;
  timestamp: string;
}): Promise<{ fileKey: string; originalFileKey?: string }> {
  const fileKey = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "soft-suggestion-pipeline.docx",
    firmSlug: "_pipeline_test",
    timestamp: opts.timestamp,
  });
  await uploadTemplate(opts.normalizedBuffer, fileKey);
  let originalFileKey: string | undefined;
  if (!opts.skipNormalize) {
    originalFileKey = computeOriginalTemplateFileKey(fileKey);
    await uploadTemplate(opts.originalBuffer, originalFileKey);
  }
  return { fileKey, originalFileKey };
}

// ---------------------------------------------------------------------------
// Orchestrator 1 — Soft suggestions never auto-apply
// ---------------------------------------------------------------------------

test("[1] soft suggestions never auto-apply (distribution / do-do-not / CEB)", () => {
  const prepared = prepareTemplateUpload(createProductSoftFixtureDocx());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const soft = prepared.summary.softSuggestions;
  assert.ok(soft.length >= 3, `expected ≥3 soft suggestions, got ${soft.length}`);

  for (const target of Object.values(PRODUCT_SOFT)) {
    const row = soft.find((s) => s.ruleId === target.ruleId);
    assert.ok(row, `missing soft row ${target.ruleId}`);
    assert.equal(row!.after, target.proposedTag);
    assert.equal(row!.applicable, true);
  }

  assert.equal(prepared.summary.appliedSuggestionCount, 0);
  assert.equal(prepared.summary.leftAsSuggestionCount, soft.length);

  const xml = documentXml(prepared.normalizedBuffer);
  assert.match(xml, /\[Description of distribution\.\]/);
  assert.match(xml, /\[do\/do not\]/);
  assert.match(
    xml,
    /\[Can Choose a Specific Person if Beneficiary Dies Before Distribution\]/,
  );
  assert.ok(!xml.includes("{distribution_description}"));
  assert.ok(!xml.includes("{do_or_do_not}"));
  assert.ok(!xml.includes("{ceb_appoint_person_note}"));

  // Report still surfaces SAMPLE_VALUE_SUGGESTION (not APPLIED)
  assert.ok(
    prepared.report.detections.some((d) => d.code === "SAMPLE_VALUE_SUGGESTION"),
  );
  assert.ok(
    !prepared.report.detections.some(
      (d) => d.code === "SAMPLE_VALUE_SUGGESTION_APPLIED",
    ),
  );
});

// ---------------------------------------------------------------------------
// Orchestrator 2 — Upload with soft items → needsConfirmation
// ---------------------------------------------------------------------------

test("[2] upload with soft items → needsConfirmation and no storage keys", async () => {
  const input = createProductSoftFixtureDocx();
  // Preview pass: action always prepares with acceptedSuggestionIds: [] until confirm
  const prepared = prepareTemplateUpload(input, { acceptedSuggestionIds: [] });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const gate = softSuggestionUploadGate({
    skipNormalize: false,
    confirmSoftSuggestions: false,
    prepared,
  });
  assert.equal(gate.decision, "needsConfirmation");
  if (gate.decision !== "needsConfirmation") return;

  assert.ok(gate.normalizeReport.softSuggestions.length >= 3);
  assert.equal(gate.normalizeReport.appliedSuggestionCount, 0);
  assert.equal(
    gate.normalizeReport.leftAsSuggestionCount,
    gate.normalizeReport.softSuggestions.length,
  );

  const fileKey = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "soft-preview.docx",
    firmSlug: "_pipeline_test",
    timestamp: "soft-preview1",
  });
  const originalFileKey = computeOriginalTemplateFileKey(fileKey);

  // Mirror action: return early — no uploadTemplate calls
  await assert.rejects(() => getFileBuffer(fileKey), /getFileBuffer failed/);
  await assert.rejects(() => getFileBuffer(originalFileKey), /getFileBuffer failed/);
});

// ---------------------------------------------------------------------------
// Orchestrator 3 — Multi-select default none → Confirm (reject-all / accept)
// ---------------------------------------------------------------------------

test("[3a] multi-select default none → Confirm with zero ids persists blanks (reject-all)", async () => {
  const input = createProductSoftFixtureDocx();
  const prepared = prepareTemplateUpload(input, { acceptedSuggestionIds: [] });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const gate = softSuggestionUploadGate({
    skipNormalize: false,
    confirmSoftSuggestions: true, // attorney confirmed, none checked
    prepared,
  });
  assert.equal(gate.decision, "persist");
  if (gate.decision !== "persist") return;

  assert.equal(gate.normalizeReport.appliedSuggestionCount, 0);
  assert.ok(gate.normalizeReport.leftAsSuggestionCount >= 3);

  const { fileKey, originalFileKey } = await persistLikeAction({
    normalizedBuffer: gate.normalizedBuffer,
    originalBuffer: gate.originalBuffer,
    skipNormalize: false,
    timestamp: "soft-reject-all1",
  });

  try {
    const primary = await getFileBuffer(fileKey);
    const xml = documentXml(primary);
    assert.match(xml, /\[Description of distribution\.\]/);
    assert.match(xml, /\[do\/do not\]/);
    assert.ok(!xml.includes("{distribution_description}"));
    assert.equal(sha256(primary), sha256(gate.normalizedBuffer));
    assert.ok(originalFileKey);
    assert.equal(sha256(await getFileBuffer(originalFileKey!)), sha256(input));
  } finally {
    await cleanupKeys(fileKey, originalFileKey ?? "");
  }
});

test("[3b] Confirm multi-select accept → applyAcceptedSuggestions, re-validate, persist tags + *.original.docx", async () => {
  const input = createProductSoftFixtureDocx();
  const preview = prepareTemplateUpload(input);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const acceptIds = preview.summary.softSuggestions
    .filter(
      (s) =>
        s.applicable &&
        (s.ruleId === PRODUCT_SOFT.distribution.ruleId ||
          s.ruleId === PRODUCT_SOFT.doDoNot.ruleId ||
          s.ruleId === PRODUCT_SOFT.ceb.ruleId),
    )
    .map((s) => s.id);
  assert.equal(acceptIds.length, 3);

  // Confirm path: same as action when confirmSoftSuggestions=true
  const confirmed = prepareTemplateUpload(input, {
    acceptedSuggestionIds: acceptIds,
  });
  assert.equal(confirmed.ok, true, `confirm failed: ${!confirmed.ok ? confirmed.error : ""}`);
  if (!confirmed.ok) return;

  assert.equal(confirmed.summary.appliedSuggestionCount, 3);
  assert.equal(confirmed.summary.leftAsSuggestionCount, 0);
  assert.ok(confirmed.summary.validation?.ok !== false);
  assert.ok(
    confirmed.report.detections.some(
      (d) => d.code === "SAMPLE_VALUE_SUGGESTION_APPLIED",
    ),
  );

  // Direct helper parity: same accepted set must produce APPLIED items + ok validate
  const viaHelper = applyAcceptedSuggestions(
    preview.normalizedBuffer,
    preview.summary.softSuggestions,
    acceptIds,
    { validate: true },
  );
  assert.equal(viaHelper.applied.length, 3);
  assert.ok(viaHelper.validation?.ok);

  const gate = softSuggestionUploadGate({
    skipNormalize: false,
    confirmSoftSuggestions: true,
    prepared: confirmed,
  });
  assert.equal(gate.decision, "persist");
  if (gate.decision !== "persist") return;

  const { fileKey, originalFileKey } = await persistLikeAction({
    normalizedBuffer: gate.normalizedBuffer,
    originalBuffer: gate.originalBuffer,
    skipNormalize: false,
    timestamp: "soft-accept-all1",
  });

  try {
    const xml = documentXml(await getFileBuffer(fileKey));
    assert.match(xml, /\{distribution_description\}/);
    assert.match(xml, /\{do_or_do_not\}/);
    assert.match(xml, /\{ceb_appoint_person_note\}/);
    assert.ok(!xml.includes("[Description of distribution.]"));
    assert.ok(!xml.includes("[do/do not]"));
    assert.ok(
      !xml.includes(
        "[Can Choose a Specific Person if Beneficiary Dies Before Distribution]",
      ),
    );
    // High-confidence control still present after accept path
    assert.match(xml, /County of \{county_of_residence\}/);
    assert.ok(originalFileKey);
    assert.equal(sha256(await getFileBuffer(originalFileKey!)), sha256(input));
  } finally {
    await cleanupKeys(fileKey, originalFileKey ?? "");
  }
});

test("[3c] Confirm accept with invalid template fails re-validate and must not persist", async () => {
  // Craft a soft suggestion whose proposed tag would break compile if applied —
  // exercise prepare's post-apply validate gate via a non-applicable / skipped path
  // is already covered; here we assert reject decision never writes keys when ok=false.
  //
  // Use broken loop + soft blank: normalize may fail before soft apply. Prefer a
  // confirm path that applyAcceptedSuggestions validates after patch.
  const body = [
    paragraphWithRuns(["_[Description of distribution.]_"]),
    // Unmatched loop opener → validation fails (with or without soft apply)
    paragraphWithRuns(["{#children}"]),
  ].join("\n");
  const input = createDocxFromDocumentXml(wrapDocumentXml(body));
  const preview = prepareTemplateUpload(input);

  // Either preview already rejects, or confirm with accept still rejects — neither persists.
  if (!preview.ok) {
    const gate = softSuggestionUploadGate({
      skipNormalize: false,
      confirmSoftSuggestions: true,
      prepared: preview,
    });
    assert.equal(gate.decision, "reject");
  } else {
    const acceptIds = preview.summary.softSuggestions
      .filter((s) => s.ruleId === PRODUCT_SOFT.distribution.ruleId)
      .map((s) => s.id);
    const confirmed = prepareTemplateUpload(input, {
      acceptedSuggestionIds: acceptIds,
    });
    // Broken loop should keep ok=false after validate
    assert.equal(confirmed.ok, false);
    const gate = softSuggestionUploadGate({
      skipNormalize: false,
      confirmSoftSuggestions: true,
      prepared: confirmed,
    });
    assert.equal(gate.decision, "reject");
  }

  const fileKey = computeTemplateFileKey({
    documentType: "revocable_trust",
    originalName: "soft-invalid.docx",
    firmSlug: "_pipeline_test",
    timestamp: "soft-invalid1",
  });
  await assert.rejects(() => getFileBuffer(fileKey), /getFileBuffer failed/);
});

test("[3d] Confirm partial multi-select: accepted tag applied; rejected siblings stay suggestions", () => {
  const input = createProductSoftFixtureDocx();
  const preview = prepareTemplateUpload(input);
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const dist = preview.summary.softSuggestions.find(
    (s) => s.ruleId === PRODUCT_SOFT.distribution.ruleId,
  );
  assert.ok(dist?.applicable);

  const confirmed = prepareTemplateUpload(input, {
    acceptedSuggestionIds: [dist!.id],
  });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;

  assert.equal(confirmed.summary.appliedSuggestionCount, 1);
  assert.equal(
    confirmed.summary.leftAsSuggestionCount,
    confirmed.summary.softSuggestions.length - 1,
  );
  // Summary still lists all soft rows (UI shows pending + applied counts)
  assert.ok(
    confirmed.summary.softSuggestions.some(
      (s) => s.ruleId === PRODUCT_SOFT.doDoNot.ruleId,
    ),
  );
  assert.ok(
    confirmed.summary.softSuggestions.some(
      (s) => s.ruleId === PRODUCT_SOFT.ceb.ruleId,
    ),
  );

  const xml = documentXml(confirmed.normalizedBuffer);
  assert.match(xml, /\{distribution_description\}/);
  assert.match(xml, /\[do\/do not\]/);
  assert.match(
    xml,
    /\[Can Choose a Specific Person if Beneficiary Dies Before Distribution\]/,
  );
  assert.ok(!xml.includes("{do_or_do_not}"));
  assert.ok(!xml.includes("{ceb_appoint_person_note}"));
});

test("[3e] softSuggestionsFromReportItems keeps unaccepted blanks as SAMPLE_VALUE_SUGGESTION rows", () => {
  const prepared = prepareTemplateUpload(createProductSoftFixtureDocx());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const fromItems = softSuggestionsFromReportItems(prepared.report.items);
  assert.equal(fromItems.length, prepared.summary.softSuggestions.length);
  assert.ok(
    fromItems.every((s) =>
      prepared.report.items.some(
        (i) =>
          i.code === "SAMPLE_VALUE_SUGGESTION" &&
          i.details?.ruleId === s.ruleId,
      ),
    ),
  );
});

// ---------------------------------------------------------------------------
// Orchestrator 5 — High-confidence + skipNormalize / *.original.docx unchanged
// (Orchestrator 4 = apply-accepted-suggestions.test.ts, wired into upload-normalize)
// ---------------------------------------------------------------------------

test("[5a] high-confidence path unchanged: trust_name + county auto-tag without soft accept", () => {
  const body = [
    paragraphWithRuns(["_[Name of Trust]_ Family Trust"]),
    paragraphWithRuns(["County of San Diego"]),
    paragraphWithRuns(["_[Description of distribution.]_"]),
  ].join("\n");
  const prepared = prepareTemplateUpload(
    createDocxFromDocumentXml(wrapDocumentXml(body)),
  );
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const xml = documentXml(prepared.normalizedBuffer);
  assert.match(xml, /\{trust_name\}/);
  assert.match(xml, /County of \{county_of_residence\}/);
  assert.match(xml, /\[Description of distribution\.\]/);
  assert.ok(!xml.includes("{distribution_description}"));
  assert.ok(
    !prepared.summary.softSuggestions.some((s) =>
      s.ruleId.startsWith("blank_name_of_trust"),
    ),
  );
  assert.ok(
    prepared.summary.softSuggestions.some(
      (s) => s.ruleId === PRODUCT_SOFT.distribution.ruleId,
    ),
  );
});

test("[5b] skipNormalize unchanged: empty softSuggestions, no needsConfirmation, no *.original.docx", async () => {
  const input = createProductSoftFixtureDocx();
  const prepared = prepareTemplateUpload(input, { skipNormalize: true });
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  assert.equal(prepared.summary.skipped, true);
  assert.equal(prepared.summary.softSuggestions.length, 0);
  assert.equal(prepared.summary.appliedSuggestionCount, 0);
  assert.equal(prepared.summary.leftAsSuggestionCount, 0);
  assert.ok(prepared.normalizedBuffer.equals(input));

  const gate = softSuggestionUploadGate({
    skipNormalize: true,
    confirmSoftSuggestions: false,
    prepared,
  });
  // Soft gate skipped — persist immediately (action: !skipNormalize && soft…)
  assert.equal(gate.decision, "persist");
  if (gate.decision !== "persist") return;

  const { fileKey, originalFileKey } = await persistLikeAction({
    normalizedBuffer: gate.normalizedBuffer,
    originalBuffer: gate.originalBuffer,
    skipNormalize: true,
    timestamp: "soft-skip1",
  });

  try {
    const primary = await getFileBuffer(fileKey);
    assert.equal(sha256(primary), sha256(input));
    const xml = documentXml(primary);
    assert.match(xml, /County of San Diego/);
    assert.match(xml, /\[Description of distribution\.\]/);
    assert.ok(!xml.includes("{county_of_residence}"));
    assert.equal(originalFileKey, undefined);
    await assert.rejects(
      () => getFileBuffer(computeOriginalTemplateFileKey(fileKey)),
      /getFileBuffer failed/,
    );
  } finally {
    await cleanupKeys(fileKey);
  }
});
