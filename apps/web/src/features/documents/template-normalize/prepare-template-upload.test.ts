/**
 * Upload-path normalizer adapter tests.
 *
 * Run: cd apps/web && pnpm test:unit:normalize
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import { prepareTemplateUpload } from "./prepare-template-upload";
import {
  createSplitRunFixtureDocx,
  createBrokenTemplateFixtureDocx,
  createDocxFromDocumentXml,
  wrapDocumentXml,
  paragraphWithRuns,
} from "./docx-fixture";

test("prepareTemplateUpload accepts messy fixture and returns normalized bytes", () => {
  const input = createSplitRunFixtureDocx();
  const result = prepareTemplateUpload(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.ok(result.normalizedBuffer.length > 0);
  assert.equal(result.originalBuffer, input);
  assert.equal(result.summary.ok, true);
  assert.ok(result.summary.repairCount >= 1, "expected split-run / tag-shape repairs");
  assert.ok(result.summary.renameCount >= 1, "expected alias renames");

  const docXml = new PizZip(result.normalizedBuffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{client_full_name\}/);
  assert.match(docXml, /\{#children\}/);
  assert.ok(!docXml.includes("{child}"), "child alias should be renamed");
});

test("prepareTemplateUpload corrects inverted settlor has_spouse polarity", () => {
  const body = paragraphWithRuns([
    "We, {client_full_name} {^has_spouse} and {spouse_full_name}{/has_spouse}, settlors",
  ]);
  const input = createDocxFromDocumentXml(wrapDocumentXml(body));
  const result = prepareTemplateUpload(input);

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const docXml = new PizZip(result.normalizedBuffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{#has_spouse\} and \{spouse_full_name\}\{\/has_spouse\}/);
  assert.ok(
    result.summary.highlights.some((h) => h.code === "SETTLOR_SPOUSE_POLARITY_FIXED"),
    "summary must surface polarity repair",
  );
});

test("prepareTemplateUpload rejects broken templates with actionable error", () => {
  const broken = createBrokenTemplateFixtureDocx();
  const result = prepareTemplateUpload(broken);

  assert.equal(result.ok, false);
  if (result.ok) return;

  assert.equal(result.summary.ok, false);
  assert.match(result.error, /failed validation after normalization/i);
  assert.ok(
    (result.summary.validation?.syntaxErrors.length ?? 0) > 0 || result.summary.errorCount > 0,
  );
  // Must not pretend the broken bytes are ready to persist as primary
  assert.ok(result.normalizedBuffer.length > 0);
});

test("prepareTemplateUpload summary is client-safe (no buffer fields)", () => {
  const input = createSplitRunFixtureDocx();
  const result = prepareTemplateUpload(input);
  const json = JSON.stringify(result.summary);
  assert.ok(!json.includes("normalizedBuffer"));
  assert.ok(typeof result.summary.repairCount === "number");
  assert.ok(Array.isArray(result.summary.highlights));
});
