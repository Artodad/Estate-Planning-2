/**
 * Sample/blank → tag detection tests (patterns from real Trust Family docs).
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/template-normalize/detect-sample-values.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

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
import { mapIntakeToDocVariables } from "../mapper";
import type { PartialIntake } from "../../intake/schemas/intake";

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

test("detectSampleValuesInParagraph tags second successor trustee blank", () => {
  const xml = `<w:p><w:r><w:t>_ _[name of second successor trustee]_ _ shall become</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{second_successor_trustee_full_name\}/);
  assert.ok(!out.includes("[name of second successor trustee]"));
  assert.ok(
    items.some(
      (i) => i.code === "SAMPLE_VALUE_TAGGED" && i.after === "{second_successor_trustee_full_name}",
    ),
  );
});

test("detectSampleValuesInParagraph tags first successor trustee blank (live NBSP shape)", () => {
  const xml = `<w:p><w:r><w:t>_ _[name of first successor trustee]_ _ shall become trustee</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{successor_trustee_full_name\}/);
  assert.ok(!out.includes("[name of first successor trustee]"));
  assert.ok(
    items.some(
      (i) => i.code === "SAMPLE_VALUE_TAGGED" && i.after === "{successor_trustee_full_name}",
    ),
  );
});

test("detectSampleValuesInParagraph tags first successor blank with regular spaces", () => {
  const xml = `<w:p><w:r><w:t>_ _[name of first successor trustee]_ _ shall become trustee</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{successor_trustee_full_name\}/);
  assert.ok(!out.includes("[name of first successor trustee]"));
});

test("live successor sentence tags first and second blanks distinctly", () => {
  // Live Chase Trust phrase (underscores + optional NBSP).
  const xml = [
    `<w:p><w:r><w:t>`,
    `If either of us dies, resigns or ceases to be trustee, `,
    `_ _[name of first successor trustee]_ _`,
    ` shall become trustee. If this nominated successor fails to qualify, `,
    `_ _[name of second successor trustee]_ _`,
    ` shall become the trustee.`,
    `</w:t></w:r></w:p>`,
  ].join("");
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{successor_trustee_full_name\}/);
  assert.match(out, /\{second_successor_trustee_full_name\}/);
  assert.ok(!out.includes("[name of first successor trustee]"));
  assert.ok(!out.includes("[name of second successor trustee]"));
  assert.equal(
    items.filter((i) => i.code === "SAMPLE_VALUE_TAGGED").length,
    2,
  );
});

test("detectSampleValuesInParagraph tags children list blank (live NBSP shape)", () => {
  const xml = `<w:p><w:r><w:t>The names and birthdates of our children are: _ _[List names and birthdates]_ _</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{#children\}\{full_name\} born \{dob\};\{\/children\}/);
  assert.ok(!out.includes("[List names and birthdates]"));
  assert.ok(
    items.some(
      (i) =>
        i.code === "SAMPLE_VALUE_TAGGED" &&
        i.after === "{#children}{full_name} born {dob};{/children}",
    ),
  );
});

test("detectSampleValuesInParagraph tags children list blank with regular spaces", () => {
  const xml = `<w:p><w:r><w:t>The names and birthdates of our children are: _ _[List names and birthdates]_ _</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{#children\}/);
  assert.ok(!out.includes("[List names and birthdates]"));
});

test("detectSampleValuesInParagraph tags marriage city/state and date blanks", () => {
  const xml = `<w:p><w:r><w:t>married in _ _[city and state of marriage]_ _ on _ _[date of marriage]_ _.</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{marriage_city_state\}/);
  assert.match(out, /\{marriage_date\}/);
  assert.equal(items.filter((i) => i.code === "SAMPLE_VALUE_TAGGED").length, 2);
});

test("detectSampleValuesInParagraph tags deemed survivor blank", () => {
  const xml = `<w:p><w:r><w:t>_ _[name of deemed survivor]_ _ shall be deemed</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{deemed_survivor_full_name\}/);
});

test("detectSampleValuesInParagraph tags first/second/third distribution ages", () => {
  const xml = `<w:p><w:r><w:t>age of _ _[first age]_ _, then _ _[second age]_ _, then _ _[third age]_ _.</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{first_distribution_age\}/);
  assert.match(out, /\{second_distribution_age\}/);
  assert.match(out, /\{third_distribution_age\}/);
  assert.equal(items.filter((i) => i.code === "SAMPLE_VALUE_TAGGED").length, 3);
});

test("detectSampleValuesInParagraph tags young-person retention age via prose anchor", () => {
  const xml = `<w:p><w:r><w:t>is under the age of _ _[age]_ _ at the time</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{young_person_retention_age\}/);
  assert.ok(items.some((i) => i.after === "{young_person_retention_age}"));
});

test("detectSampleValuesInParagraph tags outright distribution age via attains anchor", () => {
  const xml = `<w:p><w:r><w:t>When Beneficiary attains the age of _ _[age]_ _, the trustee shall</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{outright_distribution_age\}/);
});

test("detectSampleValuesInParagraph tags educational trust eligibility age", () => {
  const xml = `<w:p><w:r><w:t>If a child of the Settlors’ is under age _ _[age]_ _ at the time</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{educational_trust_eligibility_age\}/);
  assert.ok(!out.includes("[age]"));
  assert.ok(items.some((i) => i.after === "{educational_trust_eligibility_age}"));
});

test("detectSampleValuesInParagraph tags educational trust remainder age (has attained)", () => {
  const xml = `<w:p><w:r><w:t>When the Settlors’ child has attained the age of _ _[age]_ _ years, the Trustee shall</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{educational_trust_remainder_age\}/);
  assert.ok(!out.includes("{outright_distribution_age}"));
  assert.ok(items.some((i) => i.after === "{educational_trust_remainder_age}"));
});

test("detectSampleValuesInParagraph tags educational trust termination age (turns)", () => {
  const xml = `<w:p><w:r><w:t>until he/she turns _ _[age]_ _ years of age subject to this Division</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{educational_trust_termination_age\}/);
});

test("detectSampleValuesInParagraph keeps outright attains distinct from educational has attained", () => {
  const xml = `<w:p><w:r><w:t>When Beneficiary attains the age of _ _[age]_ _, the trustee shall</w:t></w:r></w:p>`;
  const { xml: out } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\{outright_distribution_age\}/);
  assert.ok(!out.includes("{educational_trust_remainder_age}"));
});

test("detectSampleValuesInParagraph reports do/do not without rewriting", () => {
  const xml = `<w:p><w:r><w:t>and "issue" _ _[do/do not]_ _ include stepchildren</w:t></w:r></w:p>`;
  const { xml: out, items } = detectSampleValuesInParagraph(xml);
  assert.match(out, /\[do\/do not\]/);
  const suggestion = items.find((i) => i.code === "SAMPLE_VALUE_SUGGESTION");
  assert.ok(suggestion);
  assert.equal(suggestion!.after, "{do_or_do_not}");
  assert.equal(suggestion!.details?.applicable, true);
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

test("live Trust blanks fill first successor + children from Trust-shaped intake", () => {
  const successorPara = paragraphWithRuns([
    "If either of us dies, resigns or ceases to be trustee, _ _[name of first successor trustee]_ _ shall become trustee. If this nominated successor fails to qualify, _ _[name of second successor trustee]_ _ shall become the trustee.",
  ]);
  const childrenPara = paragraphWithRuns([
    "The names and birthdates of our children are: _ _[List names and birthdates]_ _",
  ]);
  const input = createDocxFromDocumentXml(
    wrapDocumentXml([successorPara, childrenPara].join("\n")),
  );
  const { buffer: normalized, report } = normalizeTemplateBuffer(input);
  assert.equal(
    report.ok,
    true,
    `normalize must succeed; errors=${report.errors.map((e) => e.message).join(" | ")}`,
  );
  const taggedXml = new PizZip(normalized).file("word/document.xml")!.asText();
  assert.match(taggedXml, /\{successor_trustee_full_name\}/);
  assert.match(taggedXml, /\{second_successor_trustee_full_name\}/);
  assert.match(taggedXml, /\{#children\}/);
  assert.ok(!taggedXml.includes("[name of first successor trustee]"));
  assert.ok(!taggedXml.includes("[List names and birthdates]"));

  const intake: PartialIntake = {
    personal: {
      client: { firstName: "Casey", lastName: "Morgan" },
      maritalStatus: "married",
      spouseOrPartner: { firstName: "Riley", lastName: "Morgan" },
      isCAResident: true,
    },
    family: {
      children: [
        {
          firstName: "Alex",
          lastName: "Morgan",
          dateOfBirth: "2014-05-01",
        },
      ],
    },
    decisionMakers: [
      {
        id: "dm-first",
        role: "successor_trustee",
        person: { firstName: "Jordan", lastName: "Morgan" },
      },
      {
        id: "dm-second",
        role: "successor_trustee",
        person: { firstName: "Sam", lastName: "Morgan" },
      },
    ],
  };
  const variables = mapIntakeToDocVariables(intake, "revocable_trust");
  const doc = new Docxtemplater(new PizZip(normalized), {
    paragraphLoop: true,
    nullGetter() {
      return "";
    },
  });
  doc.render(variables);
  const filled = (doc.getZip().generate({ type: "nodebuffer" }) as Buffer);
  const text = new PizZip(filled)
    .file("word/document.xml")!
    .asText()
    .replace(/<[^>]+>/g, "");

  assert.match(text, /Jordan Morgan/);
  assert.match(text, /Sam Morgan/);
  assert.match(text, /Alex Morgan/);
  assert.match(text, /2014-05-01/);
  assert.ok(!text.includes("{successor_trustee_full_name}"));
  assert.ok(!text.includes("{#children}"));
});
