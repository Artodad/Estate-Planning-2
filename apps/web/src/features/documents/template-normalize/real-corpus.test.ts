/**
 * Integration tests against real attorney Trust Family .docx files in local storage.
 *
 * These binaries are already committed under apps/web/.local-document-storage/.
 * Tests skip gracefully if a path is missing (e.g. sparse checkout).
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/real-corpus.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";

import { normalizeTemplateBuffer } from "./normalize-template";

// Prefer cwd (apps/web when run via pnpm test:unit:normalize); fall back to module path.
const WEB_ROOT = existsSync(path.join(process.cwd(), ".local-document-storage"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const CORPUS = [
  {
    id: "mprg7y50",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
    expectOk: true,
    sha256Prefix: "77206515",
  },
  {
    id: "mprnxupt",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprnxupt.docx",
    expectOk: true,
    sha256Prefix: "3a01b7b2",
  },
  {
    id: "mprpud8a",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprpud8a.docx",
    expectOk: true,
    sha256Prefix: "92d4cca2",
  },
  {
    id: "mprg6n30-dup",
    rel: ".local-document-storage/templates/firm-12-1779936733274746364/revocable_trust/Trust-_Family-changed-mprg6n30.docx",
    expectOk: true,
    sha256Prefix: "77206515", // duplicate of mprg7y50
  },
  {
    id: "verify",
    rel: ".local-document-storage/templates/verify/revocable_trust_test_v1.docx",
    expectOk: true,
    sha256Prefix: "49a09257",
  },
] as const;

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

for (const entry of CORPUS) {
  test(`real corpus ${entry.id}: normalizeTemplate compile+render`, (t) => {
    const abs = path.join(WEB_ROOT, entry.rel);
    if (!existsSync(abs)) {
      t.skip(`missing corpus file: ${entry.rel}`);
      return;
    }

    const input = readFileSync(abs);
    assert.ok(
      sha256(input).startsWith(entry.sha256Prefix),
      `unexpected SHA for ${entry.id}`,
    );

    const { buffer, report } = normalizeTemplateBuffer(input);
    assert.ok(buffer.length > 0, "normalized buffer should be non-empty");

    const docXml = new PizZip(buffer).file("word/document.xml")!.asText();
    // Placeholders should be readable whole tokens inside w:t (may share the run with prefix/suffix prose).
    if (entry.id !== "verify") {
      assert.match(docXml, /<w:t[^>]*>[^<]*\{client_full_name\}[^<]*<\/w:t>/);
      assert.ok(
        !/<w:t[^>]*>\{client_<\/w:t>/.test(docXml),
        "client_full_name must not remain split across runs",
      );
    }

    if (entry.expectOk) {
      assert.equal(
        report.ok,
        true,
        `${entry.id} expected ok; syntax=${JSON.stringify(report.validation?.syntaxErrors)} errors=${report.errors.map((e) => e.message).join(" | ")}`,
      );
      assert.equal(report.validation?.ok, true);
    }
  });
}

test("real corpus mprg7y50: orphan notary braces healed and trust_name tagged", (t) => {
  const abs = path.join(
    WEB_ROOT,
    ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
  );
  if (!existsSync(abs)) {
    t.skip("missing mprg7y50");
    return;
  }

  const { buffer, report } = normalizeTemplateBuffer(readFileSync(abs));
  const joined = new PizZip(buffer)
    .file("word/document.xml")!
    .asText()
    .replace(/<[^>]+>/g, "");

  assert.ok(!/California\}/.test(joined), "California} orphan must be gone");
  assert.ok(!/San Diego\}/.test(joined), "San Diego} orphan must be gone");
  assert.match(joined, /\{trust_name\}/);
  assert.match(joined, /County of \{county_of_residence\}/);
  assert.match(joined, /\{second_successor_trustee_full_name\}/);
  assert.match(joined, /\{marriage_city_state\}/);
  assert.match(joined, /\{marriage_date\}/);
  assert.match(joined, /\{deemed_survivor_full_name\}/);
  assert.match(joined, /\{first_distribution_age\}/);
  assert.match(joined, /\{young_person_retention_age\}/);
  assert.match(joined, /\{outright_distribution_age\}/);
  assert.ok(report.repairs.some((r) => r.code === "ORPHAN_CLOSER_REMOVED"));
  assert.ok(report.repairs.some((r) => r.code === "SAMPLE_VALUE_TAGGED"));
  // Educational ages + do/do not + distribution descriptions remain suggestions.
  assert.ok(report.detections.some((d) => d.code === "SAMPLE_VALUE_SUGGESTION"));
  const tagged = report.repairs.filter((r) => r.code === "SAMPLE_VALUE_TAGGED").length;
  const suggestions = report.detections.filter((d) => d.code === "SAMPLE_VALUE_SUGGESTION").length;
  assert.ok(tagged >= 14, `expected ≥14 sample tags, got ${tagged}`);
  assert.ok(suggestions <= 7, `expected ≤7 suggestions, got ${suggestions}`);
});
