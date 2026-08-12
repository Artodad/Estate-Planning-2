/**
 * Unit tests for tag alias → mapper contract renames.
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/normalize-tags.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import {
  resolveAlias,
  renameTagsInXml,
  normalizeTagsInDocx,
  buildFixtureVariables,
  MAPPER_CONTRACT_KEYS,
} from "./normalize-tags";
import { createDocxFromDocumentXml, wrapDocumentXml, paragraphWithRuns } from "./docx-fixture";

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
