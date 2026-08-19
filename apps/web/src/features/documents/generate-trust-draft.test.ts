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
import { generatedDocumentPersistFromGenerate, parseStoredFillReport, wordPlainTextFromDocx } from "./fill-report";
import { DRAFT_TEXT, stampTrustDraftConfirmPhrase } from "./draft-watermark-module";
import { getFileBuffer } from "./storage";
import { mapIntakeToDocVariables } from "./mapper";
import { marriedCaRichIntake } from "./__fixtures__/intake-answers";
import type { PartialIntake } from "../intake/schemas/intake";
import type { DocumentFillReport } from "./types";
import { validateTemplate } from "./template-normalize/validate-template";
import {
  createDocxFromDocumentXml,
  paragraphWithRuns,
  wrapDocumentXml,
} from "./template-normalize/docx-fixture";
import { createRecordingNullGetter } from "./docxtemplater-options";
import {
  buildGenerateTrustDraftParams,
  generateTrustDraftCtaLabel,
} from "../dashboard/components/generate-trust-draft";
import { trustDraftFromStoredDocuments } from "../dashboard/components/stored-trust-draft";
import {
  punchListFromFillReport,
  punchListActionCopy,
  resolveFillTagToMapperKey,
  existingFieldIdForMapperKey,
  punchJumpForMapperKey,
} from "../dashboard/components/fill-report-punch-list";
import {
  leftoverCountFromFillReport,
  TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE,
  trustDraftDownloadConfirmPhrase,
  trustDraftStampedDownloadHref,
} from "../dashboard/components/trust-draft-download-confirm";
import { prefixedPunchListHref } from "../dashboard/components/TrustDraftFillReport";
import {
  clientDetailNewestTrustDraftRow,
  clientDetailTrustDraftCtaMode,
  clientDetailTrustDraftGenerateIntakeId,
  documentsRowDownloadHref,
  documentsRowIntakeAnswers,
  documentsTrustDraftHrefPrefix,
  existingRevocableTrustToReplace,
  isHiddenEstatePlanPackageRow,
  isRevocableTrustDocumentType,
} from "../dashboard/components/documents-trust-draft-row";

/** Three child rows in the mapper bag so leftover {#children} still has loopCounts.children === 3. */
const ADA_THREE_CHILDREN = [
  { full_name: "Annabella King" },
  { full_name: "Byron King" },
  { full_name: "Allegra Byron" },
];

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

test("resolveFillTagToMapperKey uses MAPPER_CONTRACT_KEYS and TAG_ALIASES only", () => {
  assert.equal(resolveFillTagToMapperKey("young_person_retention_age"), "young_person_retention_age");
  assert.equal(resolveFillTagToMapperKey("{#children}"), "children");
  assert.equal(resolveFillTagToMapperKey("client_name"), "client_full_name");
  assert.equal(resolveFillTagToMapperKey("city_and_state_of_marriage"), "marriage_city_state");
  assert.equal(resolveFillTagToMapperKey("unresolved_blank"), null);
  assert.equal(resolveFillTagToMapperKey("optional_middle_name"), null);
});

test("mapper key yields an existing Field id only by name transform, not a key table", () => {
  assert.equal(existingFieldIdForMapperKey("young_person_retention_age"), "youngPersonRetentionAge");
  assert.equal(existingFieldIdForMapperKey("client_first_name"), "client.firstName");
  assert.equal(existingFieldIdForMapperKey("client_email"), "client.email");
  assert.equal(existingFieldIdForMapperKey("marriage_city_state"), "marriageCityState");
  assert.equal(
    existingFieldIdForMapperKey("client_full_name"),
    null,
    "no client_full_name Field id",
  );
  assert.equal(existingFieldIdForMapperKey("has_spouse"), null, "maritalStatus has no matching id");
  assert.equal(
    existingFieldIdForMapperKey("successor_trustee_full_name"),
    null,
    "do not invent a successor row Field id",
  );
  assert.equal(
    existingFieldIdForMapperKey("distribution_residuary"),
    null,
    "do not invent a residuary row Field id",
  );
  assert.equal(
    existingFieldIdForMapperKey("healthcare_instructions"),
    null,
    "do not map healthcare_instructions to careInstructions",
  );
  assert.equal(
    existingFieldIdForMapperKey("is_ca_resident"),
    null,
    "do not map is_ca_resident to isCA",
  );
  assert.equal(existingFieldIdForMapperKey("children"), null, "array tag is not a Field id");
  assert.equal(existingFieldIdForMapperKey("executor_full_name"), null, "do not invent an executor row Field id");

  const age = punchJumpForMapperKey("young_person_retention_age");
  assert.equal(age.field, "youngPersonRetentionAge");
  assert.equal(age.section, "distribution");

  const first = punchJumpForMapperKey("client_first_name");
  assert.equal(first.field, "client.firstName");
  assert.equal(first.section, "personal");

  const full = punchJumpForMapperKey("client_full_name");
  assert.equal(full.field, null);
  assert.equal(full.section, null);

  const children = punchJumpForMapperKey("children");
  assert.equal(children.field, null);
  assert.equal(children.section, "family");

  const residuary = punchJumpForMapperKey("distribution_residuary");
  assert.equal(residuary.field, null);
  assert.equal(residuary.section, "distribution");

  const successor = punchJumpForMapperKey("successor_trustee_full_name");
  assert.equal(successor.field, null);
  assert.equal(successor.section, "decisionMakers");

  const executor = punchJumpForMapperKey("executor_full_name");
  assert.equal(executor.field, null);
  assert.equal(executor.section, "decisionMakers");

  const cutSecond = punchJumpForMapperKey("second_successor_trustee_full_name");
  assert.equal(cutSecond.field, null);
  assert.equal(cutSecond.section, null, "second_successor_trustee is not a DecisionMakerSchema.role");

  const cutGuardian = punchJumpForMapperKey("guardian_of_minor_full_name");
  assert.equal(cutGuardian.field, null);
  assert.equal(cutGuardian.section, null, "guardian_of_minor is not a DecisionMakerSchema.role");
});

test("punch list comes from a real generate: leftovers + required empties; allowed empties quiet", async () => {
  const stamp = Date.now();
  const templateFileKey = `templates/unit-punch-list-${stamp}/punch.docx`;
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["First: {client_first_name}"]),
    paragraphWithRuns(["Age (leave blank ok): {first_distribution_age}"]),
    paragraphWithRuns(["Optional: {optional_middle_name}"]),
    `    <w:p><w:r><w:instrText>{unresolved_blank}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{young_person_retention_age}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{successor_trustee_full_name}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{executor_full_name}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{distribution_residuary}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{has_spouse}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{#children}</w:instrText></w:r></w:p>`,
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), buf);

  let holeKey: string | undefined;
  let fixedKey: string | undefined;
  try {
    const hole = await generateDocument({
      templateFileKey,
      variables: {
        client_full_name: "Ada Lovelace",
        client_first_name: "",
        first_distribution_age: "",
        optional_middle_name: "",
        young_person_retention_age: "21",
        children: ADA_THREE_CHILDREN,
      },
      firmId: "firm_unit_punch_list",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    holeKey = hole.fileKey;

    assert.ok(hole.fillReport.emptyOptionals.includes("client_first_name"));
    assert.ok(hole.fillReport.emptyOptionals.includes("first_distribution_age"));
    assert.ok(hole.fillReport.emptyOptionals.includes("optional_middle_name"));
    assert.ok(hole.fillReport.leftoverBraces.includes("unresolved_blank"));
    assert.ok(hole.fillReport.leftoverBraces.includes("young_person_retention_age"));
    assert.ok(hole.fillReport.leftoverBraces.includes("successor_trustee_full_name"));
    assert.ok(hole.fillReport.leftoverBraces.includes("executor_full_name"));
    assert.ok(hole.fillReport.leftoverBraces.includes("distribution_residuary"));
    assert.ok(hole.fillReport.leftoverBraces.includes("has_spouse"));
    assert.ok(
      hole.fillReport.leftoverBraces.includes("#children"),
      `array leftover from generate, got: ${hole.fillReport.leftoverBraces.join(", ")}`,
    );
    assert.equal(hole.fillReport.loopCounts.children, 3);

    const rows = punchListFromFillReport(hole.fillReport, {});
    assert.notEqual(rows, hole.fillReport, "punch list is derived from the generate report, not a stand-in");
    const tags = rows.map((r) => r.tag);
    assert.ok(tags.includes("client_first_name"), "required empty from generate is a punch-list row");
    assert.ok(tags.includes("unresolved_blank"), "leftover from generate is a punch-list row");
    assert.ok(tags.includes("young_person_retention_age"), "leftover mapper tag from generate is a punch-list row");
    assert.ok(!tags.includes("first_distribution_age"), "Zod optional / leave-blank empty stays quiet");
    assert.ok(!tags.includes("optional_middle_name"), "unknown empty optional stays quiet");
    assert.ok(!tags.includes("client_full_name"), "filled stays off the punch list");

    const firstNameRow = rows.find((r) => r.tag === "client_first_name");
    assert.ok(firstNameRow);
    assert.equal(firstNameRow.href, "?section=personal&field=client.firstName");
    assert.equal(firstNameRow.field, "client.firstName");

    const leftoverKnown = rows.find((r) => r.tag === "young_person_retention_age");
    assert.ok(leftoverKnown);
    assert.equal(leftoverKnown.href, "?section=distribution&field=youngPersonRetentionAge");
    assert.equal(punchListActionCopy(leftoverKnown, hole.fillReport), "Go to field");

    const leftoverUnknown = rows.find((r) => r.tag === "unresolved_blank");
    assert.ok(leftoverUnknown);
    assert.equal(leftoverUnknown.href, null, "unresolved leftover is disabled — no invented landing");
    assert.equal(leftoverUnknown.section, null);
    assert.equal(leftoverUnknown.field, null);
    assert.equal(punchListActionCopy(leftoverUnknown, hole.fillReport), "Still in the draft");

    const composed = rows.find((r) => r.tag === "successor_trustee_full_name");
    assert.ok(composed, "leftover role tag is listed");
    assert.equal(composed.href, "?section=decisionMakers");
    assert.equal(composed.field, null);
    assert.equal(punchListActionCopy(composed, hole.fillReport), "Open Decision Makers");

    const executorRow = rows.find((r) => r.tag === "executor_full_name");
    assert.ok(executorRow);
    assert.equal(executorRow.href, "?section=decisionMakers");
    assert.equal(executorRow.field, null);
    assert.equal(punchListActionCopy(executorRow, hole.fillReport), "Open Decision Makers");

    const residuaryRow = rows.find((r) => r.tag === "distribution_residuary");
    assert.ok(residuaryRow);
    assert.equal(residuaryRow.href, "?section=distribution");
    assert.equal(residuaryRow.field, null);
    assert.equal(
      punchListActionCopy(residuaryRow, hole.fillReport),
      "Open Distribution",
      "bare scalar leftover has no loopCounts name",
    );

    const hasSpouse = rows.find((r) => r.tag === "has_spouse");
    assert.ok(hasSpouse, "leftover has_spouse and no maritalStatus on answers → still listed");
    assert.equal(hasSpouse.href, null, "has_spouse is not a Field id");
    assert.equal(hasSpouse.field, null);

    const childrenLoop = rows.find((r) => r.tag === "#children");
    assert.ok(childrenLoop, "array leftover is listed");
    assert.equal(childrenLoop.href, "?section=family");
    assert.equal(childrenLoop.field, null);
    assert.equal(punchListActionCopy(childrenLoop, hole.fillReport), "3 children — Open Family");

    const persist = generatedDocumentPersistFromGenerate(hole, {
      intakeSessionId: "intake_punch_list",
      templateId: null,
      documentType: "revocable_trust",
    });
    const loaded = trustDraftFromStoredDocuments([
      { documentType: persist.documentType, fileKey: persist.fileKey, fillReport: persist.fillReport },
    ]);
    assert.ok(loaded?.fillReport);
    assert.deepEqual(
      punchListFromFillReport(loaded.fillReport, {}),
      rows,
      "reload punch list is the stored generate report, not a rebuilt object",
    );

    const fixed = await generateDocument({
      templateFileKey,
      variables: {
        client_full_name: "Ada Lovelace",
        client_first_name: "Ada",
        first_distribution_age: "",
        optional_middle_name: "",
        young_person_retention_age: "21",
        children: ADA_THREE_CHILDREN,
      },
      firmId: "firm_unit_punch_list",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    fixedKey = fixed.fileKey;
    const afterFix = punchListFromFillReport(fixed.fillReport, {});
    assert.ok(
      !afterFix.some((r) => r.tag === "client_first_name"),
      "after regenerate with the field filled, that punch-list row is gone",
    );
    assert.ok(afterFix.some((r) => r.tag === "unresolved_blank"));
  } finally {
    await cleanupKeys(templateFileKey, holeKey ?? "", fixedKey ?? "");
  }
});

const adaAnswers: PartialIntake = {
  personal: {
    client: { firstName: "Ada", lastName: "Lovelace" },
    maritalStatus: "single",
    isCAResident: true,
  },
};

function leftoverReport(leftoverBraces: string[], extra: Partial<DocumentFillReport> = {}): DocumentFillReport {
  return {
    filledScalars: extra.filledScalars ?? [],
    emptyOptionals: extra.emptyOptionals ?? [],
    leftoverBraces,
    loopCounts: extra.loopCounts ?? {},
  };
}

test("computed leftovers drop when Ada answers supply the parts; real holes stay", async () => {
  const stamp = Date.now();
  const templateFileKey = `templates/unit-punch-computed-${stamp}/punch.docx`;
  const body = [
    paragraphWithRuns(["First: {client_first_name}"]),
    paragraphWithRuns(["Age (leave blank ok): {first_distribution_age}"]),
    `    <w:p><w:r><w:instrText>{client_full_name}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{has_spouse}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{is_ca_resident}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{spouse_full_name}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{unresolved_blank}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{young_person_retention_age}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{successor_trustee_full_name}</w:instrText></w:r></w:p>`,
    `    <w:p><w:r><w:instrText>{#children}</w:instrText></w:r></w:p>`,
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), buf);

  let holeKey: string | undefined;
  try {
    const hole = await generateDocument({
      templateFileKey,
      variables: {
        client_first_name: "",
        first_distribution_age: "",
        children: ADA_THREE_CHILDREN,
      },
      firmId: "firm_unit_punch_computed",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    holeKey = hole.fileKey;

    for (const tag of [
      "client_full_name",
      "has_spouse",
      "is_ca_resident",
      "spouse_full_name",
      "unresolved_blank",
      "young_person_retention_age",
      "successor_trustee_full_name",
    ]) {
      assert.ok(
        hole.fillReport.leftoverBraces.includes(tag),
        `generate leftover ${tag}, got: ${hole.fillReport.leftoverBraces.join(", ")}`,
      );
    }
    assert.ok(hole.fillReport.leftoverBraces.includes("#children"));
    assert.ok(hole.fillReport.emptyOptionals.includes("client_first_name"));

    const withoutAnswers = punchListFromFillReport(hole.fillReport);
    assert.ok(
      withoutAnswers.some((r) => r.tag === "has_spouse"),
      "leftover has_spouse and no maritalStatus on answers → still listed",
    );
    assert.ok(
      withoutAnswers.some((r) => r.tag === "is_ca_resident"),
      "leftover is_ca_resident cannot be proven without answers",
    );

    const rows = punchListFromFillReport(hole.fillReport, adaAnswers);
    const tags = rows.map((r) => r.tag);
    for (const tag of ["client_full_name", "has_spouse", "is_ca_resident", "spouse_full_name"]) {
      assert.ok(!tags.includes(tag), `Ada answers drop leftover ${tag}, got: ${tags.join(", ")}`);
    }

    const unresolved = rows.find((r) => r.tag === "unresolved_blank");
    assert.ok(unresolved);
    assert.equal(unresolved.href, null);

    const age = rows.find((r) => r.tag === "young_person_retention_age");
    assert.ok(age);
    assert.equal(age.href, "?section=distribution&field=youngPersonRetentionAge");

    const firstName = rows.find((r) => r.tag === "client_first_name");
    assert.ok(firstName, "required empty client_first_name stays");
    assert.equal(firstName.href, "?section=personal&field=client.firstName");

    const successor = rows.find((r) => r.tag === "successor_trustee_full_name");
    assert.ok(successor);
    assert.equal(successor.href, "?section=decisionMakers");
    assert.equal(punchListActionCopy(successor, hole.fillReport), "Open Decision Makers");

    const children = rows.find((r) => r.tag === "#children");
    assert.ok(children);
    assert.equal(children.href, "?section=family");
    assert.equal(hole.fillReport.loopCounts.children, 3);
    assert.equal(punchListActionCopy(children, hole.fillReport), "3 children — Open Family");

    const marriedMissingLast: PartialIntake = {
      personal: {
        client: { firstName: "Elena", lastName: "Vargas" },
        maritalStatus: "married",
        spouseOrPartner: { firstName: "Diego", lastName: "" },
        isCAResident: true,
      },
    };
    const marriedRows = punchListFromFillReport(hole.fillReport, marriedMissingLast);
    assert.ok(
      marriedRows.some((r) => r.tag === "spouse_full_name"),
      "married + leftover spouse_full_name + missing spouse last stays",
    );
    assert.ok(!marriedRows.some((r) => r.tag === "has_spouse"));
    assert.ok(!marriedRows.some((r) => r.tag === "client_full_name"));
    assert.ok(!marriedRows.some((r) => r.tag === "is_ca_resident"));

    const marriedComplete = punchListFromFillReport(hole.fillReport, marriedCaRichIntake);
    assert.ok(
      !marriedComplete.some((r) => r.tag === "spouse_full_name"),
      "spouse first+last present drops leftover spouse_full_name",
    );
  } finally {
    await cleanupKeys(templateFileKey, holeKey ?? "");
  }
});

test("section-door copy uses loopCounts and alias lookup; cut roles stay closed", () => {
  const report = leftoverReport(["#kids", "#distribution_residuary", "residuary", "executor_name"], {
    loopCounts: { children: 3, distribution_residuary: 2 },
  });
  const rows = punchListFromFillReport(report);
  const kids = rows.find((r) => r.tag === "#kids");
  assert.ok(kids);
  assert.equal(kids.href, "?section=family");
  assert.equal(kids.field, null);
  assert.equal(punchListActionCopy(kids, report), "3 children — Open Family");

  const residuaryLoop = rows.find((r) => r.tag === "#distribution_residuary");
  assert.ok(residuaryLoop);
  assert.equal(residuaryLoop.href, "?section=distribution");
  assert.equal(punchListActionCopy(residuaryLoop, report), "2 distribution_residuary — Open Distribution");

  const residuaryScalar = rows.find((r) => r.tag === "residuary");
  assert.ok(residuaryScalar);
  assert.equal(residuaryScalar.href, "?section=distribution");
  assert.equal(
    punchListActionCopy(residuaryScalar, report),
    "Open Distribution",
    "bare scalar leftover does not take loopCounts",
  );

  const executorAlias = leftoverReport(["executor_name"]);
  const executorRow = punchListFromFillReport(executorAlias).find((r) => r.tag === "executor_name");
  assert.ok(executorRow);
  assert.equal(executorRow.href, "?section=decisionMakers");
  assert.equal(punchListActionCopy(executorRow, executorAlias), "Open Decision Makers");

  const cut = leftoverReport(["second_successor_trustee_full_name", "guardian_of_minor_full_name"]);
  const cutRows = punchListFromFillReport(cut);
  for (const tag of ["second_successor_trustee_full_name", "guardian_of_minor_full_name"]) {
    const row = cutRows.find((r) => r.tag === tag);
    assert.ok(row);
    assert.equal(row.href, null);
    assert.equal(row.section, null);
    assert.equal(punchListActionCopy(row, cut), "Still in the draft");
  }
});

test("computed punch-list skip uses session answers, not a new key table", () => {
  const leftovers = leftoverReport([
    "client_full_name",
    "has_spouse",
    "is_ca_resident",
    "spouse_full_name",
    "county_of_residence",
  ]);

  const noMarital = punchListFromFillReport(leftovers, {});
  assert.ok(noMarital.some((r) => r.tag === "has_spouse"));
  assert.ok(
    !noMarital.some((r) => r.tag === "is_ca_resident"),
    "isCAResident({}) defaults true — leftover is never a missing answer",
  );
  assert.ok(noMarital.some((r) => r.tag === "county_of_residence"), "county is a separate leftover");

  const reportOnly = punchListFromFillReport(leftovers);
  assert.ok(reportOnly.some((r) => r.tag === "is_ca_resident"));
  assert.ok(reportOnly.some((r) => r.tag === "has_spouse"));

  assert.ok(
    !punchListFromFillReport(
      leftoverReport(["client_full_name"], { filledScalars: ["client_full_name"] }),
    ).some((r) => r.tag === "client_full_name"),
    "key ∈ filledScalars drops leftover client_full_name",
  );
});

test("download confirm N is punchListFromFillReport length, not leftoverBraces.length", () => {
  const report = leftoverReport(
    ["unresolved_blank", "client_full_name", "has_spouse"],
    { emptyOptionals: ["first_distribution_age", "client_first_name"] },
  );
  const rows = punchListFromFillReport(report, adaAnswers);
  const n = leftoverCountFromFillReport(report, adaAnswers);
  assert.equal(n, rows.length);
  assert.ok(n > 0);
  assert.notEqual(
    n,
    report.leftoverBraces.length,
    "N must not be leftoverBraces.length — computed leftovers and allowed empties differ",
  );
  assert.equal(trustDraftDownloadConfirmPhrase(n), `${n} leftovers, download anyway`);
  assert.equal(trustDraftDownloadConfirmPhrase(0), TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE);
  assert.equal(trustDraftDownloadConfirmPhrase(0), "download clean.");
  assert.equal(
    leftoverCountFromFillReport(leftoverReport([])),
    0,
    "empty punch list is download clean",
  );
  assert.match(
    trustDraftStampedDownloadHref("generated/firm/trust-DRAFT.docx"),
    /^\/api\/documents\/download-trust-draft\?fileKey=/,
  );
  assert.ok(
    !trustDraftStampedDownloadHref("generated/firm/trust-DRAFT.docx").includes("/api/documents/download?"),
    "confirm path is Trust-draft-only, not the ungated Documents download",
  );
});

test("stamp helper adds confirm phrase on a generated buffer without a second generate", async () => {
  const stamp = Date.now();
  const templateFileKey = `templates/unit-download-stamp-${stamp}/stamp.docx`;
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["Hole: {unresolved_blank}"]),
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  await mkdir(path.dirname(resolveStoragePath(templateFileKey)), { recursive: true });
  await writeFile(resolveStoragePath(templateFileKey), buf);

  let generatedFileKey: string | undefined;
  try {
    const result = await generateDocument({
      templateFileKey,
      variables: { client_full_name: "Ada Lovelace" },
      firmId: "firm_unit_download_stamp",
      options: {
        addDraftWatermark: true,
        documentType: "revocable_trust",
        clientLastName: "Lovelace",
        clientFirstName: "Ada",
      },
    });
    generatedFileKey = result.fileKey;

    const generatedText = wordPlainTextFromDocx(result.buffer);
    assert.ok(generatedText.includes(DRAFT_TEXT), "generate stores DRAFT before review");
    assert.ok(!generatedText.includes("leftovers, download anyway"), "confirm phrase is not written at generate time");
    assert.ok(!generatedText.includes(TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE));
    assert.equal(
      generatedText.split(DRAFT_TEXT).length - 1,
      1,
      "generate applies DRAFT once — do not call applyDraftWatermark again at download",
    );

    const leftoverPhrase = "3 leftovers, download anyway";
    const stampedLeftovers = stampTrustDraftConfirmPhrase(result.buffer, leftoverPhrase);
    const leftoverText = wordPlainTextFromDocx(stampedLeftovers);
    assert.ok(leftoverText.includes(leftoverPhrase), "leftover confirm phrase sticks on the downloaded bytes");
    assert.ok(leftoverText.includes(DRAFT_TEXT), "DRAFT remains after stamp");
    assert.equal(leftoverText.split(DRAFT_TEXT).length - 1, 1, "stamp must not duplicate DRAFT");

    const stampedClean = stampTrustDraftConfirmPhrase(result.buffer, TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE);
    const cleanText = wordPlainTextFromDocx(stampedClean);
    assert.ok(cleanText.includes("download clean."), "clean confirm phrase sticks without a second generate");
    assert.ok(cleanText.includes(DRAFT_TEXT));
    assert.equal(cleanText.split(DRAFT_TEXT).length - 1, 1);

    const stored = await getFileBuffer(result.fileKey);
    const storedText = wordPlainTextFromDocx(stored);
    assert.ok(storedText.includes(DRAFT_TEXT), "stored artifact stays DRAFT");
    assert.ok(!storedText.includes(leftoverPhrase), "stamped bytes are not persisted");
    assert.ok(!storedText.includes(TRUST_DRAFT_DOWNLOAD_CLEAN_PHRASE));
  } finally {
    await cleanupKeys(templateFileKey, generatedFileKey ?? "");
  }
});

test("Documents punch JUMP_TO prefixes intakeSessionId; punchListFromFillReport stays relative", () => {
  const report = leftoverReport(["young_person_retention_age", "#children"], {
    loopCounts: { children: 3 },
  });
  const rows = punchListFromFillReport(report, adaAnswers);
  const age = rows.find((r) => r.tag === "young_person_retention_age");
  const children = rows.find((r) => r.tag === "#children");
  assert.ok(age);
  assert.ok(children);
  assert.equal(age.href, "?section=distribution&field=youngPersonRetentionAge");
  assert.equal(children.href, "?section=family");

  const prefix = documentsTrustDraftHrefPrefix("sess_docs_1");
  assert.equal(prefix, "/dashboard/intakes/sess_docs_1");
  assert.equal(
    prefixedPunchListHref(age.href, prefix),
    "/dashboard/intakes/sess_docs_1?section=distribution&field=youngPersonRetentionAge",
  );
  assert.equal(
    prefixedPunchListHref(children.href, prefix),
    "/dashboard/intakes/sess_docs_1?section=family",
  );
  assert.equal(
    prefixedPunchListHref(age.href),
    age.href,
    "intake page omits hrefPrefix — relative JUMP_TO unchanged",
  );
  assert.equal(prefixedPunchListHref(null, prefix), null);
});

test("Documents row passes answers ?? null so N matches stamp; {} would skip is_ca_resident", () => {
  const leftovers = leftoverReport(["is_ca_resident", "unresolved_blank"]);
  const missing = leftoverCountFromFillReport(leftovers, documentsRowIntakeAnswers(undefined));
  const storedEmpty = leftoverCountFromFillReport(leftovers, documentsRowIntakeAnswers({}));
  const omitted = leftoverCountFromFillReport(leftovers);
  const coercedEmpty = leftoverCountFromFillReport(leftovers, {});

  assert.equal(documentsRowIntakeAnswers(undefined), null);
  assert.equal(documentsRowIntakeAnswers(null), null);
  assert.deepEqual(documentsRowIntakeAnswers({}), {});
  assert.equal(missing, omitted, "undefined answers must stay null, not {}");
  assert.ok(
    missing > storedEmpty,
    "is_ca_resident stays when answers are missing; {} skips it",
  );
  assert.equal(storedEmpty, coercedEmpty);
  assert.equal(missing, leftoverCountFromFillReport(leftovers, null));
});

test("Documents download href: revocable_trust stamps; other types stay ungated", () => {
  const fileKey = "generated/firm/trust-DRAFT.docx";
  assert.equal(isRevocableTrustDocumentType("revocable_trust"), true);
  assert.equal(isRevocableTrustDocumentType("healthcare_directive"), false);
  assert.equal(documentsRowDownloadHref("revocable_trust", fileKey), trustDraftStampedDownloadHref(fileKey));
  assert.match(
    documentsRowDownloadHref("revocable_trust", fileKey),
    /^\/api\/documents\/download-trust-draft\?fileKey=/,
  );
  assert.equal(
    documentsRowDownloadHref("healthcare_directive", fileKey),
    `/api/documents/download?fileKey=${encodeURIComponent(fileKey)}`,
  );
  assert.ok(
    !documentsRowDownloadHref("pour_over_will", fileKey).includes("download-trust-draft"),
    "non-trust types stay on ungated GET /api/documents/download",
  );
});

test("client-detail Trust download joins answers by intakeSessionId", () => {
  const leftovers = leftoverReport(["is_ca_resident", "unresolved_blank", "young_person_retention_age"]);
  const intake = { id: "sess_client_detail_1", answers: adaAnswers };
  const intakes = [intake];
  const doc = {
    intakeSessionId: "sess_client_detail_1",
    fillReport: leftovers,
    documentType: "revocable_trust" as const,
  };

  const joined = intakes.find((i) => i.id === doc.intakeSessionId);
  const report = parseStoredFillReport(doc.fillReport);
  const answers = documentsRowIntakeAnswers(joined?.answers);
  const n = leftoverCountFromFillReport(report, answers);
  const rows = punchListFromFillReport(report!, answers);
  const prefix = documentsTrustDraftHrefPrefix(doc.intakeSessionId);
  const age = rows.find((r) => r.tag === "young_person_retention_age");
  const blank = rows.find((r) => r.tag === "unresolved_blank");

  assert.equal(n, leftoverCountFromFillReport(leftovers, adaAnswers));
  assert.equal(n, 2, "CA answers skip is_ca_resident; two real leftovers remain");
  assert.equal(rows.length, n, "matter-page list N matches leftoverCount");
  assert.equal(rows.some((r) => r.tag === "is_ca_resident"), false);
  assert.ok(blank);
  assert.ok(age);
  assert.equal(punchListActionCopy(blank, leftovers), "Still in the draft");
  assert.equal(punchListActionCopy(age, leftovers), "Go to field");
  assert.equal(prefix, "/dashboard/intakes/sess_client_detail_1");
  assert.equal(
    `${prefixedPunchListHref(age.href, prefix)}#intake-wizard`,
    "/dashboard/intakes/sess_client_detail_1?section=distribution&field=youngPersonRetentionAge#intake-wizard",
  );
  assert.equal(
    leftoverCountFromFillReport(
      parseStoredFillReport(doc.fillReport),
      documentsRowIntakeAnswers(undefined),
    ),
    3,
    "missing join must stay null — {} would skip is_ca_resident",
  );
  assert.ok(
    n < leftoverCountFromFillReport(leftovers, documentsRowIntakeAnswers(undefined)),
    "joined CA answers drop is_ca_resident so N matches the stamp route",
  );
});

test("client-detail Trust generate: newest intake when no Trust; Trust row intake when has Trust", () => {
  const newest = { id: "intake_newest" };
  const older = { id: "intake_older" };
  const intakesNewestFirst = [newest, older];

  assert.equal(clientDetailTrustDraftGenerateIntakeId([], []), null);
  assert.equal(clientDetailTrustDraftCtaMode([]), "generate");
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId(intakesNewestFirst, []),
    "intake_newest",
    "empty clientDocs still generate — gate is no Trust, not no docs",
  );
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId(intakesNewestFirst, [
      { documentType: "healthcare_directive", intakeSessionId: "intake_newest" },
    ]),
    "intake_newest",
    "other leftover .docx do not hide generate",
  );
  assert.equal(
    clientDetailTrustDraftCtaMode([{ documentType: "healthcare_directive" }]),
    "generate",
  );
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId(intakesNewestFirst, [
      { documentType: "healthcare_directive", intakeSessionId: "intake_newest" },
      { documentType: "revocable_trust", intakeSessionId: "intake_older" },
    ]),
    "intake_older",
    "has-trust uses that Trust row's intake, not intakes[0]",
  );
  assert.equal(
    clientDetailTrustDraftCtaMode([
      { documentType: "healthcare_directive" },
      { documentType: "revocable_trust" },
    ]),
    "regenerate",
    "has-trust is in-row Regenerate, not above-table Generate",
  );
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId(intakesNewestFirst, [
      { documentType: "revocable_trust", intakeSessionId: "intake_older" },
    ]),
    "intake_older",
    "Trust on an older intake still returns that row's intake",
  );
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId([older], [{ documentType: "pour_over_will" }]),
    "intake_older",
  );
});

test("client-detail one Regenerate per matter: newest Trust row only", () => {
  const leftover = {
    id: "trust_leftover",
    documentType: "revocable_trust",
    intakeSessionId: "sess_same",
  };
  const newest = {
    id: "trust_clean",
    documentType: "revocable_trust",
    intakeSessionId: "sess_same",
  };
  const other = {
    id: "hc",
    documentType: "healthcare_directive",
    intakeSessionId: "sess_same",
  };
  const docsNewestFirst = [newest, leftover, other];

  assert.equal(clientDetailNewestTrustDraftRow(docsNewestFirst)?.id, "trust_clean");
  assert.equal(
    clientDetailTrustDraftGenerateIntakeId([{ id: "sess_other" }], docsNewestFirst),
    "sess_same",
    "Regenerate intake is the newest Trust row, not intakes[0]",
  );
  assert.equal(clientDetailTrustDraftCtaMode(docsNewestFirst), "regenerate");
  assert.equal(
    clientDetailNewestTrustDraftRow([leftover, newest])?.id,
    "trust_leftover",
    "first Trust in the list is newest when caller passes newest-first",
  );
});

test("Trust persist replace: newest revocable_trust for that intake; other types create", () => {
  const leftover = {
    id: "old",
    documentType: "revocable_trust",
    intakeSessionId: "s1",
  };
  const newest = {
    id: "new",
    documentType: "revocable_trust",
    intakeSessionId: "s1",
  };
  const otherIntakeTrust = {
    id: "other_sess",
    documentType: "revocable_trust",
    intakeSessionId: "s2",
  };
  const will = { id: "will", documentType: "pour_over_will", intakeSessionId: "s1" };
  const docs = [newest, leftover, otherIntakeTrust, will];

  assert.equal(existingRevocableTrustToReplace("revocable_trust", "s1", docs)?.id, "new");
  assert.equal(
    existingRevocableTrustToReplace("pour_over_will", "s1", docs),
    null,
    "other types always create",
  );
  assert.equal(existingRevocableTrustToReplace("revocable_trust", "s2", docs)?.id, "other_sess");
  assert.equal(existingRevocableTrustToReplace("revocable_trust", "s3", docs), null);
  assert.equal(existingRevocableTrustToReplace("revocable_trust", "s1", []), null);
});

test("client-detail CTA labels: Generate vs Regenerate", () => {
  assert.equal(generateTrustDraftCtaLabel("generate", false), "Generate Trust draft");
  assert.equal(generateTrustDraftCtaLabel("generate", true), "Generating Trust draft…");
  assert.equal(generateTrustDraftCtaLabel("regenerate", false), "Regenerate");
  assert.equal(generateTrustDraftCtaLabel("regenerate", true), "Regenerating…");
});

test("leftover package ZIP / Full-Estate-Plan-Package rows hide; other leftover .docx stay visible", () => {
  assert.equal(
    isHiddenEstatePlanPackageRow(
      "generated/2026-05-26/Smith-John-Full-Estate-Plan-Package-DRAFT-2026-05-26.zip",
    ),
    true,
  );
  assert.equal(isHiddenEstatePlanPackageRow("generated/pkg/archive.zip"), true);
  assert.equal(
    isHiddenEstatePlanPackageRow("generated/pkg/Smith-Full-Estate-Plan-Package-DRAFT.docx"),
    true,
  );
  assert.equal(
    isHiddenEstatePlanPackageRow("generated/pkg/Ada-Lovelace-Trust-DRAFT.docx"),
    false,
  );
  assert.equal(
    isHiddenEstatePlanPackageRow("generated/pkg/Ada-Lovelace-Healthcare-DRAFT.docx"),
    false,
  );
});

