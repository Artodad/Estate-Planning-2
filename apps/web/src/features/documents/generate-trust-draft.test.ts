/**
 * Trust draft generate path — production generator, not a hand-built wizard fill.
 *
 * Proves:
 *   1) generateDocument fills the labeled Trust Family fixture (default CI; no real corpus)
 *   2) upload-time validate and generate-time nullGetter agree on unknown tags
 *   3) the UI helper targets generateDocumentForIntake (revocable_trust), not the 8-doc ZIP
 *   4) fill report (filled / empty / leftover braces / loop counts) comes from that generate
 *   5) reload UI/API returns the persisted fillReport JSON, not a client-rebuilt report
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/generate-trust-draft.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

import { generateDocument } from "./generator";
import { generatedDocumentPersistFromGenerate, parseStoredFillReport } from "./fill-report";
import { DRAFT_TEXT } from "./draft-watermark-module";
import { mapIntakeToDocVariables } from "./mapper";
import { marriedCaRichIntake } from "./__fixtures__/intake-answers";
import { validateTemplate } from "./template-normalize/validate-template";
import {
  createDocxFromDocumentXml,
  paragraphWithRuns,
  wrapDocumentXml,
} from "./template-normalize/docx-fixture";
import { createRecordingNullGetter } from "./docxtemplater-options";
import { buildGenerateTrustDraftParams } from "../dashboard/components/generate-trust-draft";
import { trustDraftFromStoredDocuments } from "../dashboard/components/stored-trust-draft";

const FIXTURE_REL = "src/features/documents/__fixtures__/trust-family-fidelity-labels.docx";

const WEB_ROOT = existsSync(path.join(process.cwd(), "src/features/documents/__fixtures__"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Must match storage.ts (process.cwd() / .local-document-storage) so generateDocument can load the key. */
const STORAGE_ROOT = path.resolve(process.cwd(), ".local-document-storage");

function plainTextFromDocx(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return Object.keys(zip.files)
    .filter((k) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(k))
    .map((k) => zip.file(k)?.asText() ?? "")
    .join("\n")
    .replace(/<[^>]+>/g, "");
}

function resolveStoragePath(fileKey: string): string {
  return path.join(STORAGE_ROOT, fileKey.replace(/\.\./g, "_"));
}

async function cleanupKeys(...keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await rm(resolveStoragePath(key), { force: true });
    } catch {
      // best-effort
    }
  }
}

test("UI helper asks generateDocumentForIntake for a single revocable_trust draft", () => {
  const params = buildGenerateTrustDraftParams("intake_trust_draft_1");
  assert.equal(params.intakeId, "intake_trust_draft_1");
  assert.equal(params.documentType, "revocable_trust");
  assert.equal("templates" in params, false, "must not build an 8-doc package payload");
});

test("nullGetter records unknown tags and returns empty (shared by validate + generate)", () => {
  const missing = new Set<string>();
  const getter = createRecordingNullGetter(missing);
  assert.equal(getter({ value: "not_a_real_mapper_tag" }), "");
  assert.deepEqual([...missing], ["not_a_real_mapper_tag"]);
});

test("unknown tags: validate warns and generateDocument does not throw", async () => {
  const stamp = Date.now();
  const templateFileKey = `templates/unit-nullgetter-${stamp}/unknown-tag.docx`;
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["Unknown: {not_a_real_mapper_tag}"]),
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));

  const validation = validateTemplate(buf, {
    fixtureVariables: { client_full_name: "Ada Lovelace" },
    templateLabel: templateFileKey,
  });
  assert.equal(validation.ok, true, validation.syntaxErrors.join("; "));
  assert.ok(
    validation.missingTags.includes("not_a_real_mapper_tag"),
    `validate must record unknown tag as a warning, got: ${validation.missingTags.join(", ")}`,
  );

  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), buf);

  let generatedFileKey: string | undefined;
  try {
    const result = await generateDocument({
      templateFileKey,
      variables: { client_full_name: "Ada Lovelace" },
      firmId: "firm_unit_nullgetter",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    generatedFileKey = result.fileKey;
    const text = plainTextFromDocx(result.buffer);
    assert.match(text, /Ada Lovelace/);
    assert.ok(!text.includes("{not_a_real_mapper_tag}"), "unknown tag must be blanked, not left as braces");
    assert.ok(!text.includes("{client_full_name}"));
    assert.ok(text.includes(DRAFT_TEXT), "generate path must apply DRAFT watermark");
    assert.ok(result.fillReport, "fill report must come from generateDocument");
    assert.ok(
      result.fillReport.filledScalars.includes("client_full_name"),
      `filledScalars from generate: ${result.fillReport.filledScalars.join(", ")}`,
    );
    assert.ok(
      result.fillReport.emptyOptionals.includes("not_a_real_mapper_tag"),
      `emptyOptionals from generate: ${result.fillReport.emptyOptionals.join(", ")}`,
    );
    assert.ok(
      !result.fillReport.leftoverBraces.includes("not_a_real_mapper_tag"),
      "blanked unknown tag is an empty optional, not leftover braces",
    );
  } finally {
    await cleanupKeys(templateFileKey, generatedFileKey ?? "");
  }
});

test("generateDocument fills labeled Trust Family fixture (Trust draft path)", async () => {
  const abs = path.join(WEB_ROOT, FIXTURE_REL);
  assert.ok(existsSync(abs), `vendored fidelity fixture required (no skip): ${FIXTURE_REL}`);

  const stamp = Date.now();
  const templateFileKey = `templates/unit-generate-trust-${stamp}/trust-family-labels.docx`;
  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), readFileSync(abs));

  const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", {
    generationDate: "2026-05-26",
    firmName: "Vargas Law LLP",
  });

  const eduAges = {
    eligibility: variables.educational_trust_eligibility_age,
    remainder: variables.educational_trust_remainder_age,
    termination: variables.educational_trust_termination_age,
  };
  assert.equal(eduAges.eligibility, "21");
  assert.equal(eduAges.remainder, "25");
  assert.equal(eduAges.termination, "30");
  assert.notEqual(eduAges.eligibility, eduAges.remainder);
  assert.notEqual(eduAges.remainder, eduAges.termination);
  assert.notEqual(eduAges.eligibility, eduAges.termination);
  assert.equal(variables.first_distribution_age, "23");
  assert.notEqual(variables.first_distribution_age, eduAges.eligibility);
  assert.notEqual(variables.first_distribution_age, eduAges.remainder);
  assert.notEqual(variables.first_distribution_age, eduAges.termination);
  assert.equal(variables.has_spouse, true);

  let generatedFileKey: string | undefined;
  try {
    const result = await generateDocument({
      templateFileKey,
      variables,
      firmId: "firm_unit_generate_trust",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Vargas",
        clientFirstName: "Elena",
      },
    });
    generatedFileKey = result.fileKey;
    assert.match(result.fileKey, /revocable-trust/i);
    assert.match(result.fileKey, /DRAFT/);

    const text = plainTextFromDocx(result.buffer);
    assert.ok(text.includes(DRAFT_TEXT), "Trust draft must carry DRAFT watermark");
    assert.match(text, /Elena Vargas\s+and\s+Diego Vargas/);
    assert.match(text, /Second Successor: Carmen Vargas/);
    assert.match(text, /Marriage: San Francisco, California on September 1, 2000/);
    assert.match(text, /Deemed Survivor: Diego Vargas/);
    assert.match(text, /First Distribution Age: 23/);
    assert.match(text, /Educational Eligibility Age: 21/);
    assert.match(text, /Educational Remainder Age: 25/);
    assert.match(text, /Educational Termination Age: 30/);

    for (const tag of [
      "educational_trust_eligibility_age",
      "educational_trust_remainder_age",
      "educational_trust_termination_age",
      "first_distribution_age",
      "second_successor_trustee_full_name",
      "spouse_full_name",
    ]) {
      assert.ok(!text.includes(`{${tag}}`), `expected {${tag}} to be substituted`);
    }

    const report = result.fillReport;
    assert.ok(report, "fill report must be produced by generateDocument, not assembled in the test");
    assert.notEqual(report, variables, "report is not the mapper bag");
    for (const tag of [
      "client_full_name",
      "spouse_full_name",
      "first_distribution_age",
      "educational_trust_eligibility_age",
      "educational_trust_remainder_age",
      "educational_trust_termination_age",
    ]) {
      assert.ok(
        report.filledScalars.includes(tag),
        `generate fill report must list filled {${tag}}, got: ${report.filledScalars.join(", ")}`,
      );
    }
    assert.equal(report.loopCounts.has_spouse, 1, "married fixture {#has_spouse} loop count from generate");
    for (const leftover of report.leftoverBraces) {
      assert.ok(
        text.includes(`{${leftover}}`),
        `leftover "${leftover}" in the report must still appear in the generated draft`,
      );
    }
    for (const tag of report.filledScalars) {
      assert.ok(!text.includes(`{${tag}}`), `filled scalar {${tag}} must not remain as braces`);
    }
  } finally {
    await cleanupKeys(templateFileKey, generatedFileKey ?? "");
  }
});

test("generateDocument fill report: empty optional, leftover braces, loop counts from a real generate", async () => {
  const stamp = Date.now();
  const templateFileKey = `templates/unit-fill-report-${stamp}/fill-buckets.docx`;
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["Optional: {optional_middle_name}"]),
    paragraphWithRuns(["Children:"]),
    paragraphWithRuns(["{#children}"]),
    paragraphWithRuns(["- {full_name}"]),
    paragraphWithRuns(["{/children}"]),
    // w:instrText is not substituted; leftover `{unresolved_blank}` remains after generate.
    `    <w:p><w:r><w:instrText>{unresolved_blank}</w:instrText></w:r></w:p>`,
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));

  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), buf);

  let generatedFileKey: string | undefined;
  try {
    const result = await generateDocument({
      templateFileKey,
      variables: {
        client_full_name: "Ada Lovelace",
        optional_middle_name: "",
        children: [{ full_name: "Byron" }, { full_name: "Annabella" }],
      },
      firmId: "firm_unit_fill_report",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    generatedFileKey = result.fileKey;
    const text = plainTextFromDocx(result.buffer);
    assert.match(text, /Ada Lovelace/);
    assert.match(text, /Byron/);
    assert.match(text, /Annabella/);
    assert.match(text, /\{unresolved_blank\}/);

    const report = result.fillReport;
    assert.ok(report.filledScalars.includes("client_full_name"));
    assert.ok(
      !report.filledScalars.includes("optional_middle_name"),
      "empty optional must not be listed as filled",
    );
    assert.ok(report.emptyOptionals.includes("optional_middle_name"));
    assert.ok(
      report.leftoverBraces.includes("unresolved_blank"),
      `leftover braces from generate, got: ${report.leftoverBraces.join(", ")}`,
    );
    assert.equal(report.loopCounts.children, 2);
    const persist = generatedDocumentPersistFromGenerate(result, {
      intakeSessionId: "intake_fill_report",
      templateId: null,
      documentType: "revocable_trust",
    });
    assert.strictEqual(
      persist.fillReport,
      result.fillReport,
      "persisted fill report must be the generate result, not a hand-built object",
    );
    assert.equal(persist.fileKey, result.fileKey);

    const storedRow = {
      documentType: persist.documentType,
      fileKey: persist.fileKey,
      fillReport: persist.fillReport,
    };
    const loaded = trustDraftFromStoredDocuments([storedRow]);
    assert.ok(loaded, "reload path must return the stored Trust draft");
    assert.equal(loaded.fileKey, persist.fileKey);
    assert.strictEqual(
      loaded.fillReport,
      persist.fillReport,
      "reload must return the persisted generate report, not a rebuilt object",
    );
    assert.strictEqual(
      parseStoredFillReport(persist.fillReport),
      persist.fillReport,
      "stored JSON parse must yield the persisted object",
    );
  } finally {
    await cleanupKeys(templateFileKey, generatedFileKey ?? "");
  }
});

test("reload UI/API returns the persisted fillReport JSON, not a client rebuild", () => {
  const storedReport = {
    filledScalars: ["only_in_db_scalar"],
    emptyOptionals: ["only_in_db_empty"],
    leftoverBraces: ["only_in_db_brace"],
    loopCounts: { children: 9 },
  };
  const newerTrust = {
    documentType: "revocable_trust",
    fileKey: "generated/firm/trust-newer-DRAFT.docx",
    fillReport: storedReport,
  };
  const olderTrust = {
    documentType: "revocable_trust",
    fileKey: "generated/firm/trust-older-DRAFT.docx",
    fillReport: {
      filledScalars: ["stale"],
      emptyOptionals: [],
      leftoverBraces: [],
      loopCounts: {},
    },
  };
  const will = {
    documentType: "pour_over_will",
    fileKey: "generated/firm/will-DRAFT.docx",
    fillReport: {
      filledScalars: ["will_only"],
      emptyOptionals: [],
      leftoverBraces: [],
      loopCounts: {},
    },
  };

  const loaded = trustDraftFromStoredDocuments([will, newerTrust, olderTrust]);
  assert.ok(loaded);
  assert.equal(loaded.fileKey, newerTrust.fileKey);
  assert.strictEqual(
    loaded.fillReport,
    storedReport,
    "UI/API must return the stored JSON object, not a newly assembled report",
  );
  assert.deepEqual(loaded.fillReport, {
    filledScalars: ["only_in_db_scalar"],
    emptyOptionals: ["only_in_db_empty"],
    leftoverBraces: ["only_in_db_brace"],
    loopCounts: { children: 9 },
  });

  const jsonRoundTrip = JSON.parse(JSON.stringify(storedReport)) as typeof storedReport;
  const afterReload = trustDraftFromStoredDocuments([
    { documentType: "revocable_trust", fileKey: newerTrust.fileKey, fillReport: jsonRoundTrip },
  ]);
  assert.ok(afterReload);
  assert.strictEqual(
    afterReload.fillReport,
    jsonRoundTrip,
    "after JSON persist/reload the same stored object is what the API returns",
  );
  assert.deepEqual(afterReload.fillReport, storedReport);

  assert.equal(trustDraftFromStoredDocuments([]), null);
  assert.equal(
    trustDraftFromStoredDocuments([will]),
    null,
    "non-Trust rows must not supply a Trust fill report",
  );
  const noReport = trustDraftFromStoredDocuments([
    { documentType: "revocable_trust", fileKey: "generated/firm/trust-DRAFT.docx", fillReport: { leftover: true } },
  ]);
  assert.ok(noReport);
  assert.equal(noReport.fillReport, null, "invalid stored JSON must not be rebuilt into a report");
});
