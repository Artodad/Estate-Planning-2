/**
 * Real Trust Family corpus smoke — NOT in default `pnpm test:unit` / CI.
 *
 * The corpus lives under `.local-document-storage/` (a GitHub-hidden
 * dotfolder). This file fails if the path is missing — no skip-hatch.
 *
 * Run: pnpm test:unit:fidelity-corpus
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
import { marriedCaRichIntake } from "./__fixtures__/intake-answers";

const WEB_ROOT = existsSync(path.join(process.cwd(), ".local-document-storage"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TRUST_FAMILY_SMOKE = {
  id: "mprg7y50",
  rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
} as const;

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

test("Trust Family corpus: normalize → map → render (fail if corpus missing)", () => {
  const abs = path.join(WEB_ROOT, TRUST_FAMILY_SMOKE.rel);
  assert.ok(
    existsSync(abs),
    `Trust Family corpus required (no skip): ${TRUST_FAMILY_SMOKE.rel}`,
  );

  const { buffer: normalized, report } = normalizeTemplateBuffer(readFileSync(abs));
  assert.equal(
    report.ok,
    true,
    `normalize must succeed; errors=${report.errors.map((e) => e.message).join(" | ")}`,
  );
  const unmatchedLoops = report.warnings.filter((w) => w.code === "UNMATCHED_LOOP_OPEN");
  assert.equal(
    unmatchedLoops.filter((w) => w.before === "{#children}").length,
    0,
    "Trust Family {#children} must not emit UNMATCHED_LOOP_OPEN",
  );
  assert.equal(
    unmatchedLoops.filter((w) => w.before === "{#distribution_residuary}").length,
    0,
    "Trust Family {#distribution_residuary} must not emit UNMATCHED_LOOP_OPEN",
  );

  const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust");
  assert.equal(variables.educational_trust_eligibility_age, "21");
  assert.equal(variables.educational_trust_remainder_age, "25");
  assert.equal(variables.educational_trust_termination_age, "30");
  assert.notEqual(
    variables.educational_trust_eligibility_age,
    variables.educational_trust_remainder_age,
  );
  assert.notEqual(
    variables.educational_trust_remainder_age,
    variables.educational_trust_termination_age,
  );

  const text = plainTextFromDocx(renderDocx(normalized, variables));
  assert.match(text, /Elena Vargas\s+and\s+Diego Vargas/);
  assert.ok(text.includes("Carmen Vargas"));
});
