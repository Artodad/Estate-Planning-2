/**
 * Phase 7 template-fidelity smoke for default CI (`pnpm test:unit`).
 *
 * Uses the vendored labeled fixture at
 * `src/features/documents/__fixtures__/trust-family-fidelity-labels.docx`
 * (not the real Trust Family corpus under `.local-document-storage`, which
 * GitHub hides as a dotfolder and is not part of default CI).
 *
 * Fails if the vendored fixture is missing — no skip-hatch.
 *
 * Real-corpus smoke (fail-if-missing, not in default CI):
 *   pnpm test:unit:fidelity-corpus
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
import { marriedCaRichIntake } from "./__fixtures__/intake-answers";

const FIXTURE_REL = "src/features/documents/__fixtures__/trust-family-fidelity-labels.docx";

const WEB_ROOT = existsSync(path.join(process.cwd(), "src/features/documents/__fixtures__"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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

test("Phase 7 fidelity smoke: labeled fixture fills distinct Educational Trust ages", () => {
  const abs = path.join(WEB_ROOT, FIXTURE_REL);
  assert.ok(existsSync(abs), `vendored fidelity fixture required (no skip): ${FIXTURE_REL}`);

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

  const text = plainTextFromDocx(renderDocx(readFileSync(abs), variables));

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
});
