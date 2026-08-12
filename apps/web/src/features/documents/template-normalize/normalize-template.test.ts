/**
 * Orchestrator + validation tests (repair → alias → validate).
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/*.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import { normalizeTemplateBuffer } from "./normalize-template";
import { validateTemplate } from "./validate-template";
import {
  createSplitRunFixtureDocx,
  createBrokenTemplateFixtureDocx,
  createDocxFromDocumentXml,
  wrapDocumentXml,
  paragraphWithRuns,
} from "./docx-fixture";

test("normalizeTemplateBuffer heals split runs, renames aliases, and validates", () => {
  const input = createSplitRunFixtureDocx();
  const { buffer, report } = normalizeTemplateBuffer(input);

  const docXml = new PizZip(buffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{client_full_name\}/);
  assert.match(docXml, /\{spouse_full_name\}/);
  assert.match(docXml, /\{county_of_residence\}/);
  assert.match(docXml, /\{#children\}/);
  assert.match(docXml, /\{\/children\}/);
  assert.ok(!docXml.includes("{{"), "double braces should be collapsed");
  assert.ok(!docXml.includes("{child}"), "child alias should be gone");

  assert.ok(report.repairs.length >= 1, "expected at least one repair");
  assert.ok(report.renames.length >= 1, "expected at least one rename");
  assert.ok(report.validation, "validation should run");
  assert.equal(report.validation!.ok, true, `validation errors: ${report.validation!.syntaxErrors.join("; ")}`);
  assert.equal(report.ok, true);
});

test("validateTemplate reports actionable syntax errors for broken loops", () => {
  const broken = createBrokenTemplateFixtureDocx();
  const result = validateTemplate(broken, { templateLabel: "broken.docx" });
  assert.equal(result.ok, false);
  assert.ok(
    result.syntaxErrors.length > 0,
    "expected syntax errors for unmatched loop",
  );
});

test("normalizeTemplateBuffer surfaces validation failure in report.ok", () => {
  const broken = createBrokenTemplateFixtureDocx();
  const { report } = normalizeTemplateBuffer(broken);
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => e.code === "VALIDATION_SYNTAX"));
});

test("validateTemplate succeeds on a clean mapper-aligned template", () => {
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["{#children}"]),
    paragraphWithRuns(["- {full_name}"]),
    paragraphWithRuns(["{/children}"]),
  ].join("\n");
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  const result = validateTemplate(buf, {
    fixtureVariables: {
      client_full_name: "Ada Lovelace",
      children: [{ full_name: "Child One" }],
    },
  });
  assert.equal(result.ok, true, result.syntaxErrors.join("; "));
});
