/**
 * Unit tests for tag alias → mapper contract renames.
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/normalize-tags.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import Docxtemplater from "docxtemplater";

import {
  resolveAlias,
  renameTagsInXml,
  fixSettlorSpousePolarityInXml,
  normalizeTagsInDocx,
  buildFixtureVariables,
  MAPPER_CONTRACT_KEYS,
} from "./normalize-tags";
import { createDocxFromDocumentXml, wrapDocumentXml, paragraphWithRuns } from "./docx-fixture";
import { normalizeTemplateBuffer } from "./normalize-template";

test("resolveAlias maps common wrong names to mapper keys", () => {
  assert.equal(resolveAlias("client_name"), "client_full_name");
  assert.equal(resolveAlias("spouse_name"), "spouse_full_name");
  assert.equal(resolveAlias("child"), "children");
  assert.equal(resolveAlias("hasSpouse"), "has_spouse");
  assert.equal(resolveAlias("client_full_name"), null, "canonical names are not re-aliased");
});

test("renameTagsInXml renames open/close loop aliases and reports each rename", () => {
  const xml = `<w:p><w:r><w:t>{#child}{full_name}{/child}</w:t></w:r></w:p>`;
  const { xml: out, items } = renameTagsInXml(xml, "word/document.xml");

  assert.match(out, /\{#children\}/);
  assert.match(out, /\{\/children\}/);
  assert.match(out, /\{full_name\}/, "loop item fields must not be rewritten");
  assert.equal(items.filter((i) => i.kind === "rename").length, 2);
  assert.ok(items.every((i) => i.part === "word/document.xml"));
});

test("renameTagsInXml renames client_name and spouse_name", () => {
  const xml = `<w:t>Client {client_name} / Spouse {spouse_name}</w:t>`;
  const { xml: out, items } = renameTagsInXml(xml);
  assert.match(out, /\{client_full_name\}/);
  assert.match(out, /\{spouse_full_name\}/);
  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((i) => i.before).sort(),
    ["{client_name}", "{spouse_name}"].sort(),
  );
});

test("normalizeTagsInDocx applies aliases inside a .docx buffer", () => {
  const body = paragraphWithRuns(["{client_name}", "{#child}", "{/child}"]);
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  const { buffer, items } = normalizeTagsInDocx(buf);
  const docXml = new PizZip(buffer).file("word/document.xml")!.asText();

  assert.match(docXml, /\{client_full_name\}/);
  assert.match(docXml, /\{#children\}/);
  assert.match(docXml, /\{\/children\}/);
  assert.ok(items.some((i) => i.kind === "rename"));
});

test("buildFixtureVariables covers mapper contract with safe defaults", () => {
  const fixture = buildFixtureVariables({ client_full_name: "Test Client" });
  for (const key of MAPPER_CONTRACT_KEYS) {
    assert.ok(key in fixture, `missing fixture key ${key}`);
    assert.notEqual(fixture[key], undefined);
  }
  assert.equal(fixture.client_full_name, "Test Client");
  assert.deepEqual(fixture.children, []);
  assert.equal(fixture.has_spouse, false);
});

test("fixSettlorSpousePolarityInXml flips inverted settlor spouse wrapper only", () => {
  const xml =
    `<w:t>We, {client_full_name} {^has_spouse} and {spouse_full_name}{/has_spouse}, settlors</w:t>` +
    `<w:t>{^has_spouse}[No spouse section]{/has_spouse}</w:t>`;
  const { xml: out, items } = fixSettlorSpousePolarityInXml(xml, "word/document.xml");

  assert.match(out, /\{#has_spouse\} and \{spouse_full_name\}\{\/has_spouse\}/);
  assert.ok(
    !/\{\^has_spouse\} and \{spouse_full_name\}/.test(out),
    "settlor spouse name must not stay under inverted polarity",
  );
  // Intentional no-spouse section must keep inverted polarity
  assert.match(out, /\{\^has_spouse\}\[No spouse section\]\{\/has_spouse\}/);
  assert.equal(items.length, 1);
  assert.equal(items[0].code, "SETTLOR_SPOUSE_POLARITY_FIXED");
});

test("normalizeTagsInDocx corrects inverted settlor spouse polarity in a .docx", () => {
  const body = paragraphWithRuns([
    "We, {client_full_name} {^has_spouse} and {spouse_full_name}{/has_spouse}, settlors",
  ]);
  const buf = createDocxFromDocumentXml(wrapDocumentXml(body));
  const { buffer, items } = normalizeTagsInDocx(buf);
  const docXml = new PizZip(buffer).file("word/document.xml")!.asText();

  assert.match(docXml, /\{#has_spouse\} and \{spouse_full_name\}\{\/has_spouse\}/);
  assert.ok(items.some((i) => i.code === "SETTLOR_SPOUSE_POLARITY_FIXED"));
});

test("normalize → fill: inverted settlor polarity yields spouse name for married fixture", () => {
  // Synthetic mirrors the Trust Family settlor clause bug reported by Tester (PR #3).
  const body = [
    paragraphWithRuns([
      "We, {client_full_name} {^has_spouse} and {spouse_full_name}{/has_spouse}, sometimes hereafter called settlors",
    ]),
    paragraphWithRuns(["{^has_spouse}[No spouse section]{/has_spouse}"]),
  ].join("\n");
  const inverted = createDocxFromDocumentXml(wrapDocumentXml(body));

  const { buffer: normalized, report } = normalizeTemplateBuffer(inverted, {
    validate: false,
  });
  assert.ok(
    report.repairs.some((r) => r.code === "SETTLOR_SPOUSE_POLARITY_FIXED"),
    "normalizer must report settlor polarity fix",
  );

  const vars = buildFixtureVariables({
    client_full_name: "Elena Vargas",
    has_spouse: true,
    spouse_full_name: "Diego Vargas",
  });
  const zip = new PizZip(normalized);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    nullGetter() {
      return "";
    },
  });
  doc.render(vars);
  const filled = (doc.getZip().generate({ type: "nodebuffer" }) as Buffer);
  const text = new PizZip(filled)
    .file("word/document.xml")!
    .asText()
    .replace(/<[^>]+>/g, "");

  assert.match(text, /Elena Vargas\s+and\s+Diego Vargas/);
  assert.ok(!text.includes("[No spouse section]"), "married path must not show no-spouse section");
});
