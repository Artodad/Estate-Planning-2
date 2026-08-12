/**
 * Sample/blank → tag detection tests (patterns from real Trust Family docs).
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/detect-sample-values.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import {
  detectSampleValuesInParagraph,
  detectSampleValuesInDocx,
} from "./detect-sample-values";
import { repairParagraphXml, repairDocxRuns } from "./repair-runs";
import { normalizeTemplateBuffer } from "./normalize-template";
import {
  createDocxFromDocumentXml,
  wrapDocumentXml,
  paragraphWithRuns,
} from "./docx-fixture";

test("detectSampleValuesInParagraph tags [Name of Trust] blank → {trust_name}", () => {
  const xml = `<w:p><w:r><w:t>_ _[Name of Trust]_ _ Family Trust</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{trust_name\}/);
  assert.ok(!out.includes("[Name of Trust]"));
  assert.ok(items.some((i) => i.code === "SAMPLE_VALUE_TAGGED" && i.after === "{trust_name}"));
});

test("detectSampleValuesInParagraph tags [Name] before TRUST → {trust_name}", () => {
  // Split across runs like the real Trust Family title line
  const xml = [
    `<w:p>`,
    `<w:r><w:t>create the _ _[</w:t></w:r>`,
    `<w:r><w:t>Name</w:t></w:r>`,
    `<w:r><w:t>]_ _ </w:t></w:r>`,
    `<w:r><w:t>TRUST</w:t></w:r>`,
    `</w:p>`,
  ].join("");
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{trust_name\}/);
  assert.match(out, /TRUST/);
  assert.ok(items.some((i) => i.code === "SAMPLE_VALUE_TAGGED"));
});

test("detectSampleValuesInParagraph tags [Name of settlor] → {client_full_name}", () => {
  const xml = `<w:p><w:r><w:t>_ _[Name of settlor]_ _ is a citizen</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{client_full_name\}/);
  assert.match(out, /is a citizen/);
  assert.ok(!out.includes("[Name of settlor]"));
});

test("detectSampleValuesInParagraph tags filled County of <Name> venue paragraph", () => {
  const xml = `<w:p><w:r><w:t>County of San Diego</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /County of \{county_of_residence\}/);
  assert.ok(items.some((i) => i.after === "{county_of_residence}"));
});

test("detectSampleValuesInParagraph does not rewrite County of inside longer prose", () => {
  const xml = `<w:p><w:r><w:t>Residing in the County of San Diego is required.</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /County of San Diego/);
  assert.ok(!items.some((i) => i.code === "SAMPLE_VALUE_TAGGED"));
});

test("detectSampleValuesInParagraph reports low-confidence blanks without rewriting", () => {
  const xml = `<w:p><w:r><w:t>_ _[name of second successor trustee]_ _ shall become</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\[name of second successor trustee\]/);
  assert.ok(items.some((i) => i.code === "SAMPLE_VALUE_SUGGESTION"));
  assert.ok(!items.some((i) => i.code === "SAMPLE_VALUE_TAGGED"));
});

test("orphan closers from notary venue are removed then county is tagged", () => {
  // Exact failure pattern from Trust-_Family-changed-mprg7y50 / mprnxupt:
  // text run + empty tab runs + orphan `}` run (zero-length runs between).
  const notaryState = [
    `<w:p>`,
    `<w:r><w:t>State of California</w:t></w:r>`,
    `<w:r><w:tab/></w:r>`,
    `<w:r><w:tab/></w:r>`,
    `<w:r><w:tab/><w:t>}</w:t></w:r>`,
    `</w:p>`,
  ].join("");
  const notaryLone = [
    `<w:p>`,
    `<w:r><w:tab/></w:r>`,
    `<w:r><w:tab/><w:t>}</w:t></w:r>`,
    `</w:p>`,
  ].join("");
  const notaryCounty = [
    `<w:p>`,
    `<w:r><w:t>County of San Diego</w:t></w:r>`,
    `<w:r><w:tab/></w:r>`,
    `<w:r><w:tab/><w:t>}</w:t></w:r>`,
    `</w:p>`,
  ].join("");
  const input = createDocxFromDocumentXml(
    wrapDocumentXml([notaryState, notaryLone, notaryCounty].join("\n")),
  );
  const { buffer, report } = normalizeTemplateBuffer(input);

  const docXml = new PizZip(buffer).file("word/document.xml")!.asText();
  assert.match(docXml, /State of California/);
  assert.ok(!/>\}<\/w:t>/.test(docXml), "orphan } runs must be gone");
  assert.match(docXml, /County of \{county_of_residence\}/);
  assert.ok(
    report.repairs.some((r) => r.code === "ORPHAN_CLOSER_REMOVED"),
    "expected orphan closer repairs",
  );
  assert.equal(
    report.ok,
    true,
    `expected compile+render ok; errors=${report.errors.map((e) => e.message).join("; ")}`,
  );
});

test("repairParagraphXml removes orphan } after prose (notary pattern)", () => {
  const xml = `<w:p><w:r><w:t>State of California}</w:t></w:r></w:p>`;
  const { xml: out, items } = repairParagraphXml(xml);
  assert.equal(out.includes("California}"), false);
  assert.match(out, /State of California/);
  assert.ok(items.some((i) => i.code === "ORPHAN_CLOSER_REMOVED"));
});

test("repairParagraphXml preserves leading tab when coalescing split tags", () => {
  const xml = [
    `<w:p>`,
    `<w:r><w:tab/><w:t>We, {</w:t></w:r>`,
    `<w:r><w:t>client_full_name</w:t></w:r>`,
    `<w:r><w:t>}</w:t></w:r>`,
    `</w:p>`,
  ].join("");
  const { xml: out, items } = repairParagraphXml(xml);
  assert.match(out, /<w:tab\/>/);
  assert.match(out, /\{client_full_name\}/);
  assert.ok(items.some((i) => i.code === "SPLIT_RUN_MERGED"));
  assert.equal(
    items.find((i) => i.code === "SPLIT_RUN_MERGED")?.details?.preservedLeadingChrome,
    true,
  );
});

test("detectSampleValuesInDocx runs across a .docx buffer", () => {
  const body = paragraphWithRuns(["_ _[Name of Trust]_ _ Family Trust"]);
  const input = createDocxFromDocumentXml(wrapDocumentXml(body));
  const { buffer, items } = detectSampleValuesInDocx(repairDocxRuns(input).buffer);
  const docXml = new PizZip(buffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{trust_name\}/);
  assert.ok(items.some((i) => i.code === "SAMPLE_VALUE_TAGGED"));
});
