/**
 * Phase 7 template-fidelity smoke (unit/integration — not browser E2E).
 *
 * Proves normalize → mapIntakeToDocVariables → docxtemplater render fills
 * Trust Family soft-blank / Educational Trust tags on a real corpus .docx:
 *   - spouse_full_name inside {#has_spouse} (polarity + fill)
 *   - second_successor_trustee_full_name
 *   - Educational Trust ages (distinct 21 / 25 / 30) + at least one ladder age
 *   - marriage_date or marriage_city_state when present after normalize
 *
 * Reuses the same PizZip + docxtemplater options as generator.ts / intake-to-fill.
 * Skips with a clear message when the corpus file is absent from CI.
 *
 * Run: cd apps/web && pnpm test:unit:fidelity-smoke
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import { mapIntakeToDocVariables } from "./mapper";
import { normalizeTemplateBuffer } from "./template-normalize/normalize-template";
import { marriedCaRichIntake, singleNoChildrenIntake } from "./__fixtures__/intake-answers";

const WEB_ROOT = existsSync(path.join(process.cwd(), ".local-document-storage"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TRUST_FAMILY_SMOKE = {
  id: "mprg7y50",
  rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
} as const;

/** Tags this smoke requires after normalize (PR #4/#10 promotions). */
const FIDELITY_TAGS = [
  "has_spouse",
  "spouse_full_name",
  "second_successor_trustee_full_name",
  "marriage_city_state",
  "marriage_date",
  "first_distribution_age",
  "educational_trust_eligibility_age",
  "educational_trust_remainder_age",
  "educational_trust_termination_age",
] as const;

/** Same docxtemplater options as generator.ts / intake-to-fill (paragraphLoop). */
function renderDocx(
  templateBuffer: Buffer,
  variables: Record<string, unknown>,
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    nullGetter() {
      return "";
    },
  });
  doc.render(variables);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

function plainTextFromDocx(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return Object.keys(zip.files)
    .filter((k) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(k))
    .map((k) => zip.file(k)?.asText() ?? "")
    .join("\n")
    .replace(/<[^>]+>/g, "");
}

test("Phase 7 fidelity smoke: Trust Family normalize → map → render fills spouse, successor, ages, marriage", (t) => {
  const abs = path.join(WEB_ROOT, TRUST_FAMILY_SMOKE.rel);
  if (!existsSync(abs)) {
    t.skip(
      `missing Trust Family corpus file (gitignored or not vendored): ${TRUST_FAMILY_SMOKE.rel}`,
    );
    return;
  }

  const raw = readFileSync(abs);
  const { buffer: normalized, report } = normalizeTemplateBuffer(raw);
  assert.equal(
    report.ok,
    true,
    `normalize must succeed before fidelity fill; errors=${report.errors.map((e) => e.message).join(" | ")}`,
  );

  const normalizedText = plainTextFromDocx(normalized);
  for (const tag of FIDELITY_TAGS) {
    assert.ok(
      normalizedText.includes(`{${tag}}`) ||
        normalizedText.includes(`{#${tag}}`) ||
        normalizedText.includes(`{^${tag}}`) ||
        normalizedText.includes(`{/${tag}}`),
      `expected normalized Trust Family to contain {${tag}} (or loop form)`,
    );
  }

  // Settlor spouse must use positive polarity after normalize (PR #5 repair).
  assert.match(
    normalizedText,
    /\{#has_spouse\}\s+and\s+\{spouse_full_name\}\{\/has_spouse\}/,
    "normalized settlor clause must wrap spouse_full_name in {#has_spouse}",
  );
  assert.ok(
    !/\{\^has_spouse\}\s+and\s+\{spouse_full_name\}/.test(normalizedText),
    "normalized settlor clause must not keep inverted {^has_spouse} around spouse name",
  );

  const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", {
    generationDate: "2026-05-26",
    firmName: "Vargas Law LLP",
  });

  // Mapper contract for the fidelity fixture (distinct edu ages 21/25/30).
  assert.equal(variables.spouse_full_name, "Diego Vargas");
  assert.equal(variables.has_spouse, true);
  assert.equal(variables.second_successor_trustee_full_name, "Carmen Vargas");
  assert.equal(variables.marriage_city_state, "San Francisco, California");
  assert.equal(variables.marriage_date, "September 1, 2000");
  assert.equal(variables.educational_trust_eligibility_age, "21");
  assert.equal(variables.educational_trust_remainder_age, "25");
  assert.equal(variables.educational_trust_termination_age, "30");
  assert.equal(variables.first_distribution_age, "23");

  const filled = renderDocx(normalized, variables);
  const text = plainTextFromDocx(filled);

  // Spouse inside has_spouse region (settlor "X and Y" clause) — polarity + fill.
  assert.match(
    text,
    /Elena Vargas\s+and\s+Diego Vargas/,
    "filled Trust Family must show spouse_full_name inside has_spouse settlor region",
  );

  // Unique second successor (not shared with healthcare agent Marco).
  assert.ok(
    text.includes("Carmen Vargas"),
    "second_successor_trustee_full_name must appear in filled output",
  );

  // At least two distinct age strings from the Educational Trust ladder.
  const ageHits = (["21", "25", "30"] as const).filter((age) => text.includes(age));
  assert.ok(
    ageHits.length >= 2,
    `expected at least two Educational Trust age values in output, found: ${ageHits.join(", ") || "(none)"}`,
  );

  // Marriage date or city when tags are present post-normalize.
  const hasMarriageDate = text.includes("September 1, 2000");
  const hasMarriageCity = text.includes("San Francisco, California");
  assert.ok(
    hasMarriageDate || hasMarriageCity,
    "marriage_date or marriage_city_state must appear when tags exist after normalize",
  );

  // Ladder age distinct from Educational Trust set.
  assert.ok(
    text.includes("23"),
    "first_distribution_age (23) must appear after normalize→fill",
  );

  for (const tag of FIDELITY_TAGS) {
    if (tag === "has_spouse") continue; // loop delimiters are consumed, not left as {has_spouse}
    assert.ok(
      !text.includes(`{${tag}}`),
      `expected {${tag}} to be substituted in filled Trust Family output`,
    );
  }
});

/**
 * Complementary empty-safe / single polarity (does not re-assert filled #12 smoke values).
 * Proves omitted soft-blanks leave no brace residue and single settlor omits the and-spouse glue.
 */
test("complementary fidelity: single / empty soft-blanks — no brace tags, no dangling and-spouse", (t) => {
  const abs = path.join(WEB_ROOT, TRUST_FAMILY_SMOKE.rel);
  if (!existsSync(abs)) {
    t.skip(
      `missing Trust Family corpus file (gitignored or not vendored): ${TRUST_FAMILY_SMOKE.rel}`,
    );
    return;
  }

  const { buffer: normalized, report } = normalizeTemplateBuffer(readFileSync(abs));
  assert.equal(report.ok, true, "normalize must succeed before complementary empty-safe fill");

  const variables = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust", {
    generationDate: "2026-05-26",
    firmName: "Vargas Law LLP",
  });
  assert.equal(variables.has_spouse, false);
  assert.equal(variables.second_successor_trustee_full_name, "");
  assert.equal(variables.deemed_survivor_full_name, "");
  assert.equal(variables.first_distribution_age, "");
  assert.equal(variables.educational_trust_eligibility_age, "");
  assert.equal(variables.educational_trust_remainder_age, "");
  assert.equal(variables.educational_trust_termination_age, "");

  const text = plainTextFromDocx(renderDocx(normalized, variables));

  assert.ok(text.includes("Alex Nguyen"));
  assert.ok(
    !/Alex Nguyen\s+and\s*,/.test(text),
    "single settlor must not leave dangling 'and ,' after empty spouse omission",
  );
  assert.match(text, /Alex Nguyen\s*,\s*sometimes hereafter called/);

  // Fidelity soft-blank tags must be substituted away even when empty.
  for (const tag of FIDELITY_TAGS) {
    if (tag === "has_spouse") continue;
    assert.ok(
      !text.includes(`{${tag}}`),
      `empty-safe fill must not leave unresolved {${tag}}`,
    );
  }

  // Happy-path fixture values from the filled smoke must not leak into single fill.
  assert.ok(!text.includes("Diego Vargas"));
  assert.ok(!text.includes("Carmen Vargas"));
  assert.ok(!text.includes("September 1, 2000"));
});
