/**
 * Unit tests for applyAcceptedSuggestions (soft suggestion human-gate).
 *
 * Orchestrator item 4 — applyAcceptedSuggestions() unit coverage:
 * - softSuggestionsFromReportItems shape (proposed after / applicable)
 * - apply only accepted ids; leave others intact
 * - empty accepted ids is a no-op
 * - prepareTemplateUpload default does not apply; accepted ids apply + counts
 * - high-confidence trust_name still auto-tags without accept
 *
 * Broader upload gate / persist coverage: ../soft-suggestion-accept-reject.test.ts
 *
 * Run: cd apps/web && pnpm test:unit:normalize
 *      pnpm test:unit:upload-normalize  (includes this file)
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";

import {
  applyAcceptedSuggestions,
  softSuggestionsFromReportItems,
} from "./apply-accepted-suggestions";
import { detectSampleValuesInDocx } from "./detect-sample-values";
import { prepareTemplateUpload } from "./prepare-template-upload";
import {
  createDocxFromDocumentXml,
  wrapDocumentXml,
  paragraphWithRuns,
} from "./docx-fixture";

function softBlankDocx(): Buffer {
  const body = [
    paragraphWithRuns(["_[Description of distribution.]_ shall be paid"]),
    paragraphWithRuns(["Trustee _[do/do not]_ distribute income"]),
    paragraphWithRuns([
      "_[Can Choose a Specific Person if Beneficiary Dies Before Distribution]_ note",
    ]),
  ].join("");
  return createDocxFromDocumentXml(wrapDocumentXml(body));
}

test("softSuggestionsFromReportItems maps SAMPLE_VALUE_SUGGESTION shape with proposed after", () => {
  const input = softBlankDocx();
  const { items } = detectSampleValuesInDocx(input);
  const soft = softSuggestionsFromReportItems(items);

  assert.ok(soft.length >= 3, `expected soft suggestions, got ${soft.length}`);
  assert.ok(soft.every((s) => s.id.startsWith("soft:")));
  const dist = soft.find((s) => s.ruleId === "blank_distribution_description");
  assert.ok(dist);
  assert.equal(dist!.after, "{distribution_description}");
  assert.equal(dist!.applicable, true);
  assert.match(dist!.rationale, /distribution description/i);

  const doNot = soft.find((s) => s.ruleId === "blank_do_do_not");
  assert.ok(doNot);
  assert.equal(doNot!.after, "{do_or_do_not}");

  const ceb = soft.find((s) => s.ruleId === "blank_ceb_appoint_person");
  assert.ok(ceb);
  assert.equal(ceb!.after, "{ceb_appoint_person_note}");
});

test("applyAcceptedSuggestions applies only accepted ids; leaves others intact", () => {
  const input = softBlankDocx();
  const prepared = prepareTemplateUpload(input);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const soft = prepared.summary.softSuggestions;
  assert.ok(soft.length >= 2);
  const accept = soft.find((s) => s.ruleId === "blank_distribution_description");
  assert.ok(accept?.applicable);

  const result = applyAcceptedSuggestions(
    prepared.normalizedBuffer,
    soft,
    [accept!.id],
    { validate: true },
  );

  assert.equal(result.applied.length, 1);
  assert.equal(result.applied[0]?.after, "{distribution_description}");
  assert.ok(result.validation?.ok, "applied soft tag must remain compile-valid");

  const docXml = new PizZip(result.buffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{distribution_description\}/);
  assert.ok(
    docXml.includes("[do/do not]") || docXml.includes("do/do not"),
    "unaccepted do/do not blank must remain",
  );
  assert.ok(
    !docXml.includes("[Description of distribution.]"),
    "accepted distribution blank must be replaced",
  );
});

test("applyAcceptedSuggestions with empty accepted ids is a no-op", () => {
  const input = softBlankDocx();
  const prepared = prepareTemplateUpload(input);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const beforeXml = new PizZip(prepared.normalizedBuffer)
    .file("word/document.xml")!
    .asText();
  const result = applyAcceptedSuggestions(
    prepared.normalizedBuffer,
    prepared.summary.softSuggestions,
    [],
  );
  assert.equal(result.applied.length, 0);
  const afterXml = new PizZip(result.buffer).file("word/document.xml")!.asText();
  assert.equal(afterXml, beforeXml);
});

test("prepareTemplateUpload default does not apply soft suggestions", () => {
  const prepared = prepareTemplateUpload(softBlankDocx());
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  assert.ok(prepared.summary.softSuggestions.length >= 2);
  assert.equal(prepared.summary.appliedSuggestionCount, 0);
  assert.equal(
    prepared.summary.leftAsSuggestionCount,
    prepared.summary.softSuggestions.length,
  );

  const docXml = new PizZip(prepared.normalizedBuffer).file("word/document.xml")!.asText();
  assert.ok(docXml.includes("Description of distribution") || docXml.includes("do/do not"));
  assert.ok(!docXml.includes("{distribution_description}"));
});

test("prepareTemplateUpload applies accepted soft suggestions and reports counts", () => {
  const preview = prepareTemplateUpload(softBlankDocx());
  assert.equal(preview.ok, true);
  if (!preview.ok) return;

  const acceptIds = preview.summary.softSuggestions
    .filter((s) => s.applicable)
    .slice(0, 2)
    .map((s) => s.id);
  assert.ok(acceptIds.length >= 1);

  const confirmed = prepareTemplateUpload(softBlankDocx(), {
    acceptedSuggestionIds: acceptIds,
  });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) return;

  assert.equal(confirmed.summary.appliedSuggestionCount, acceptIds.length);
  assert.equal(
    confirmed.summary.leftAsSuggestionCount,
    confirmed.summary.softSuggestions.length - acceptIds.length,
  );

  const docXml = new PizZip(confirmed.normalizedBuffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{distribution_description\}|\{do_or_do_not\}|\{ceb_appoint_person_note\}/);
});

test("high-confidence path unchanged: trust_name still auto-tagged without accept", () => {
  const body = paragraphWithRuns(["_[Name of Trust]_ Family Trust"]);
  const input = createDocxFromDocumentXml(wrapDocumentXml(body));
  const prepared = prepareTemplateUpload(input);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;

  const docXml = new PizZip(prepared.normalizedBuffer).file("word/document.xml")!.asText();
  assert.match(docXml, /\{trust_name\}/);
  assert.ok(
    !prepared.summary.softSuggestions.some((s) => s.ruleId === "blank_name_of_trust"),
  );
});
