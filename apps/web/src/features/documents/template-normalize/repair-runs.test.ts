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
  // Coalesced into a single run containing the intact tag
  assert.match(out, /<w:r><w:t>\{client_full_name\}<\/w:t><\/w:r>/);
  assert.equal((out.match(/<w:r>/g) || []).length, 1);
});

test("repairParagraphXml coalesces tag split across bold/non-bold runs into one readable token", () => {
  // Chase acceptance case: mid-tag bold from spellcheck / partial formatting
  // {cli + bold(ent) + _full + _name}
  const xml = [
    `<w:p>`,
    `<w:r><w:t>{cli</w:t></w:r>`,
    `<w:r><w:rPr><w:b/></w:rPr><w:t>ent</w:t></w:r>`,
    `<w:r><w:t>_full</w:t></w:r>`,
    `<w:r><w:rPr><w:i/></w:rPr><w:t>_name}</w:t></w:r>`,
    `</w:p>`,
  ].join("");

  const { xml: out, items } = repairParagraphXml(xml);

  assert.match(out, /\{client_full_name\}/);
  assert.ok(!out.includes("<w:t>{cli</w:t>"), "opening fragment must be gone");
  assert.ok(!out.includes("<w:t>ent</w:t>"), "bold mid-fragment must be gone");
  assert.ok(!out.includes("<w:t>_full</w:t>"), "middle fragment must be gone");
  assert.ok(!out.includes("<w:t>_name}</w:t>"), "closing fragment must be gone");
  // One contiguous tag text node inside a single run
  assert.match(out, /<w:r><w:t>\{client_full_name\}<\/w:t><\/w:r>/);
  assert.equal((out.match(/\{client_full_name\}/g) || []).length, 1);
  assert.equal((out.match(/<w:r>/g) || []).length, 1, "tag should be one run");
  // Mid-tag bold/italic dropped; first run had no rPr → healed tag has no rPr
  assert.ok(!out.includes("<w:b/>"), "mid-tag bold should not remain on healed tag");
  assert.ok(!out.includes("<w:i/>"), "mid-tag italic should not remain on healed tag");

  const merge = items.find((i) => i.code === "SPLIT_RUN_MERGED");
  assert.ok(merge);
  assert.equal(merge!.details?.inheritedRPrFrom, "first_fragment_run");
  assert.equal(merge!.details?.droppedMidTagFormatting, true);
});

test("repairParagraphXml inherits first-run bold when the tag fragment starts bold", () => {
  const xml = [
    `<w:p>`,
    `<w:r><w:rPr><w:b/></w:rPr><w:t>{client_</w:t></w:r>`,
    `<w:r><w:t>full_name}</w:t></w:r>`,
    `</w:p>`,
  ].join("");

  const { xml: out } = repairParagraphXml(xml);
  assert.match(
    out,
    /<w:r><w:rPr><w:b\/><\/w:rPr><w:t>\{client_full_name\}<\/w:t><\/w:r>/,
  );
  assert.equal((out.match(/<w:r>/g) || []).length, 1);
});

test("repairParagraphXml keeps suffix after tag with last-run formatting", () => {
  // Tag ends mid last-run; suffix " END" keeps that run's bold
  const xml = [
    `<w:p>`,
    `<w:r><w:t>{cli</w:t></w:r>`,
    `<w:r><w:rPr><w:b/></w:rPr><w:t>ent_full_name} END</w:t></w:r>`,
    `</w:p>`,
  ].join("");

  const { xml: out } = repairParagraphXml(xml);
  assert.match(out, /\{client_full_name\}/);
  // Tag run inherits first (no bold); suffix keeps last run's bold
  assert.match(out, /<w:r><w:t>\{client_full_name\}<\/w:t><\/w:r>/);
  assert.match(out, /<w:r><w:rPr><w:b\/><\/w:rPr><w:t[^>]*> END<\/w:t><\/w:r>/);
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

test("repairDocxRuns heals bold-split tags in headers and footers", () => {
  const documentXml = wrapDocumentXml(paragraphWithRuns(["Body ok"]));
  const zip = new PizZip(createDocxFromDocumentXml(documentXml));

  zip.file(
    "word/header1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>{client_</w:t></w:r>
    <w:r><w:rPr><w:b/></w:rPr><w:t>full_</w:t></w:r>
    <w:r><w:t>name}</w:t></w:r>
  </w:p>
</w:hdr>`,
  );
  zip.file(
    "word/footer1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:r><w:t>{spouse_</w:t></w:r>
    <w:r><w:rPr><w:b/></w:rPr><w:t>full_</w:t></w:r>
    <w:r><w:t>name}</w:t></w:r>
  </w:p>
</w:ftr>`,
  );

  const input = zip.generate({ type: "nodebuffer" }) as Buffer;
  const { buffer, items } = repairDocxRuns(input);
  const outZip = new PizZip(buffer);

  const header = outZip.file("word/header1.xml")!.asText();
  const footer = outZip.file("word/footer1.xml")!.asText();

  assert.match(header, /<w:r><w:t>\{client_full_name\}<\/w:t><\/w:r>/);
  assert.match(footer, /<w:r><w:t>\{spouse_full_name\}<\/w:t><\/w:r>/);
  assert.ok(!header.includes("<w:b/>"), "header mid-tag bold dropped");
  assert.ok(!footer.includes("<w:b/>"), "footer mid-tag bold dropped");
  assert.ok(items.some((i) => i.part === "word/header1.xml" && i.code === "SPLIT_RUN_MERGED"));
  assert.ok(items.some((i) => i.part === "word/footer1.xml" && i.code === "SPLIT_RUN_MERGED"));
});
