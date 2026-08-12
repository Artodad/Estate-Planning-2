/**
 * Unit tests for split-run / tag-shape repair.
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/repair-runs.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  isLikelyPlaceholderInner,
  normalizePlaceholderInner,
  repairParagraphXml,
  repairDocxRuns,
} from "./repair-runs";
import { createSplitRunFixtureDocx, createDocxFromDocumentXml, wrapDocumentXml, paragraphWithRuns } from "./docx-fixture";
import PizZip from "pizzip";

test("isLikelyPlaceholderInner accepts mapper-like tags and loop forms", () => {
  assert.equal(isLikelyPlaceholderInner("client_full_name"), true);
  assert.equal(isLikelyPlaceholderInner("#children"), true);
  assert.equal(isLikelyPlaceholderInner("/children"), true);
  assert.equal(isLikelyPlaceholderInner("^has_spouse"), true);
  assert.equal(isLikelyPlaceholderInner("/"), true);
  assert.equal(isLikelyPlaceholderInner(" client_full_name "), true);
});

test("isLikelyPlaceholderInner rejects prose / ambiguous braces", () => {
  assert.equal(isLikelyPlaceholderInner("see Section 5"), false);
  assert.equal(isLikelyPlaceholderInner("a, b"), false);
  assert.equal(isLikelyPlaceholderInner(""), false);
});

test("normalizePlaceholderInner strips whitespace", () => {
  assert.equal(normalizePlaceholderInner(" client_full_name "), "client_full_name");
  assert.equal(normalizePlaceholderInner("# children"), "#children");
  assert.equal(normalizePlaceholderInner("/ children"), "/children");
});

test("repairParagraphXml merges placeholder split across multiple w:t runs", () => {
  const xml = `<w:p><w:r><w:t>{client_</w:t></w:r><w:r><w:t>full_</w:t></w:r><w:r><w:t>name}</w:t></w:r></w:p>`;
  const { xml: out, items } = repairParagraphXml(xml);

  assert.match(out, /\{client_full_name\}/);
  assert.ok(!out.includes("{client_</w:t>"), "opening fragment should be gone");
  const merge = items.filter((i) => i.code === "SPLIT_RUN_MERGED");
  assert.equal(merge.length, 1);
  assert.equal(merge[0].after, "{client_full_name}");
});

test("repairParagraphXml heals spaces inside tags", () => {
  const xml = `<w:p><w:r><w:t>{ client_full_name }</w:t></w:r></w:p>`;
  const { xml: out, items } = repairParagraphXml(xml);
  assert.match(out, /\{client_full_name\}/);
  assert.ok(items.some((i) => i.code === "TAG_WHITESPACE"));
});

test("repairParagraphXml collapses {{double}} braces for likely tags", () => {
  const xml = `<w:p><w:r><w:t>{{county_of_residence}}</w:t></w:r></w:p>`;
  const { xml: out, items } = repairParagraphXml(xml);
  assert.match(out, /\{county_of_residence\}/);
  assert.ok(!out.includes("{{"));
  assert.ok(items.some((i) => i.code === "DOUBLE_TO_SINGLE_BRACES"));
});

test("repairParagraphXml leaves ambiguous legal braces alone and warns", () => {
  const xml = `<w:p><w:r><w:t>Refer to {Article IV, Section 2} above.</w:t></w:r></w:p>`;
  const { xml: out, items } = repairParagraphXml(xml);
  assert.match(out, /\{Article IV, Section 2\}/);
  assert.ok(items.some((i) => i.code === "AMBIGUOUS_BRACES"));
});

test("repairDocxRuns heals split tags inside a real .docx buffer", () => {
  const buf = createSplitRunFixtureDocx();
  const { buffer, items } = repairDocxRuns(buf);
  const zip = new PizZip(buffer);
  const docXml = zip.file("word/document.xml")!.asText();

  assert.match(docXml, /\{client_full_name\}/);
  assert.ok(items.some((i) => i.code === "SPLIT_RUN_MERGED"));
  assert.ok(items.some((i) => i.code === "TAG_WHITESPACE" || i.code === "DOUBLE_TO_SINGLE_BRACES"));
});

test("repairDocxRuns can target header parts when present", () => {
  const documentXml = wrapDocumentXml(paragraphWithRuns(["Body {client_full_name}"]));
  const zip = new PizZip(createDocxFromDocumentXml(documentXml));
  // Inject a header with a split tag
  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:r><w:t>{firm_</w:t></w:r><w:r><w:t>name}</w:t></w:r></w:p>
</w:hdr>`,
  );
  const input = zip.generate({ type: "nodebuffer" }) as Buffer;
  const { buffer, items } = repairDocxRuns(input);
  const outZip = new PizZip(buffer);
  const header = outZip.file("word/header1.xml")!.asText();
  assert.match(header, /\{firm_name\}/);
  assert.ok(items.some((i) => i.part === "word/header1.xml" && i.code === "SPLIT_RUN_MERGED"));
});
