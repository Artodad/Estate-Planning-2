/**
 * Behavioral integration: intake answers → mapIntakeToDocVariables → docxtemplater fill.
 *
 * Proves filled document text contains the expected party names / substitutions
 * (not normalizer internals). Covers:
 *   1) Synthetic template with correct mapper-contract tags (happy + edge)
 *   2) Real Trust Family corpus after normalize → fill with mapper output
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/intake-to-fill.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import { mapIntakeToDocVariables } from "./mapper";
import { applyDraftWatermark, DRAFT_TEXT } from "./draft-watermark-module";
import { normalizeTemplateBuffer } from "./template-normalize/normalize-template";
import {
  createDocxFromDocumentXml,
  wrapDocumentXml,
  paragraphWithRuns,
} from "./template-normalize/docx-fixture";
import {
  marriedAlternateSuccessorIntake,
  marriedCaRichIntake,
  singleNoChildrenIntake,
} from "./__fixtures__/intake-answers";

const WEB_ROOT = existsSync(path.join(process.cwd(), ".local-document-storage"))
  ? process.cwd()
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const TRUST_FAMILY = [
  {
    id: "mprg7y50",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
  },
  {
    id: "mprnxupt",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprnxupt.docx",
  },
  {
    id: "mprpud8a",
    rel: ".local-document-storage/templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprpud8a.docx",
  },
] as const;

/** Build a mapper-contract template exercising scalars, spouse conditional, children + residuary loops.
 * Loop/conditional delimiters must live inside `<w:t>` runs (docxtemplater ignores raw text outside elements). */
function createIntakeFillTemplateDocx(): Buffer {
  const body = [
    paragraphWithRuns(["Client: {client_full_name}"]),
    paragraphWithRuns(["Trust: {trust_name}"]),
    paragraphWithRuns(["County: {county_of_residence}"]),
    paragraphWithRuns(["Successor Trustee: {successor_trustee_full_name}"]),
    paragraphWithRuns(["Second Successor: {second_successor_trustee_full_name}"]),
    paragraphWithRuns(["Executor: {executor_full_name}"]),
    paragraphWithRuns(["Healthcare Agent: {healthcare_agent_full_name}"]),
    paragraphWithRuns(["Marriage: {marriage_city_state} on {marriage_date}"]),
    paragraphWithRuns(["Deemed Survivor: {deemed_survivor_full_name}"]),
    paragraphWithRuns(["First Distribution Age: {first_distribution_age}"]),
    paragraphWithRuns(["Educational Eligibility Age: {educational_trust_eligibility_age}"]),
    // Correct polarity (show spouse block when has_spouse is true)
    paragraphWithRuns(["{#has_spouse}"]),
    paragraphWithRuns(["Spouse: {spouse_full_name}"]),
    paragraphWithRuns(["{/has_spouse}"]),
    paragraphWithRuns(["{^has_spouse}"]),
    paragraphWithRuns(["[No spouse section]"]),
    paragraphWithRuns(["{/has_spouse}"]),
    paragraphWithRuns(["{#has_minor_children}"]),
    paragraphWithRuns(["[Has minor children]"]),
    paragraphWithRuns(["{/has_minor_children}"]),
    paragraphWithRuns(["Children:"]),
    paragraphWithRuns(["{#children}"]),
    paragraphWithRuns(["- {full_name} ({relationship})"]),
    paragraphWithRuns(["{/children}"]),
    paragraphWithRuns(["Residuary:"]),
    paragraphWithRuns(["{#distribution_residuary}"]),
    paragraphWithRuns(["- {name} @ {share_percent}%"]),
    paragraphWithRuns(["{/distribution_residuary}"]),
    paragraphWithRuns(["{#has_community_property_assets}"]),
    paragraphWithRuns(["[Community property assets present]"]),
    paragraphWithRuns(["{/has_community_property_assets}"]),
  ].join("\n");

  return createDocxFromDocumentXml(wrapDocumentXml(body));
}

function renderDocx(
  templateBuffer: Buffer,
  variables: Record<string, unknown>,
): Buffer {
  const zip = new PizZip(templateBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    nullGetter() {
      return "";
    },
  });
  doc.render(variables);
  return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
}

function plainTextFromDocx(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return Object.keys(zip.files)
    .filter((k) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(k))
    .map((k) => zip.file(k)?.asText() ?? "")
    .join("\n")
    .replace(/<[^>]+>/g, "");
}

function assertNoUnresolvedMapperTags(text: string, tags: string[]) {
  for (const tag of tags) {
    assert.ok(
      !text.includes(`{${tag}}`),
      `expected {${tag}} to be substituted, but it remained in filled output`,
    );
  }
}

// ---------------------------------------------------------------------------
// Synthetic template path (full control over tags + polarity)
// ---------------------------------------------------------------------------

test("intake → fill (synthetic): married CA rich answers populate party names, loops, conditionals", () => {
  const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", {
    generationDate: "2026-05-26",
    firmName: "Vargas Law LLP",
  });
  const filled = renderDocx(createIntakeFillTemplateDocx(), variables);
  const text = plainTextFromDocx(filled);

  assert.match(text, /Client: Elena Vargas/);
  assert.match(text, /Trust: Vargas Revocable Living Trust/);
  assert.match(text, /County: San Francisco/);
  assert.match(text, /Spouse: Diego Vargas/);
  assert.ok(!text.includes("[No spouse section]"), "inverted spouse block must be omitted when married");
  assert.ok(text.includes("[Has minor children]"));
  assert.ok(text.includes("- Sofia Vargas (daughter)"));
  assert.ok(text.includes("- Leo Vargas (son)"));
  assert.ok(text.includes("- Sofia Vargas @ 50%"));
  assert.ok(text.includes("- Leo Vargas @ 50%"));
  assert.match(text, /Successor Trustee: Isabella Vargas/);
  assert.match(text, /Second Successor: Carmen Vargas/);
  assert.match(text, /Executor: Elena Vargas/);
  assert.match(text, /Healthcare Agent: Marco Vargas/);
  assert.match(text, /Marriage: San Francisco, California on September 1, 2000/);
  assert.match(text, /Deemed Survivor: Diego Vargas/);
  assert.match(text, /First Distribution Age: 23/);
  assert.match(text, /Educational Eligibility Age: 21/);
  assert.ok(text.includes("[Community property assets present]"));

  assertNoUnresolvedMapperTags(text, [
    "client_full_name",
    "trust_name",
    "county_of_residence",
    "spouse_full_name",
    "successor_trustee_full_name",
    "second_successor_trustee_full_name",
    "executor_full_name",
    "healthcare_agent_full_name",
    "marriage_city_state",
    "marriage_date",
    "first_distribution_age",
    "educational_trust_eligibility_age",
  ]);
});

test("intake → fill (synthetic): single / no children omits spouse + minors and leaves empty loops blank", () => {
  const variables = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust", {
    generationDate: "2026-05-26",
  });
  const filled = renderDocx(createIntakeFillTemplateDocx(), variables);
  const text = plainTextFromDocx(filled);

  assert.match(text, /Client: Alex Nguyen/);
  assert.match(text, /Trust: Nguyen Revocable Living Trust/);
  assert.match(text, /County: Alameda/);
  assert.ok(text.includes("[No spouse section]"));
  assert.ok(!text.includes("Spouse:"), "spouse line must not appear for single client");
  assert.ok(!text.includes("[Has minor children]"));
  assert.ok(!text.includes("[Community property assets present]"));
  assert.ok(!text.includes("Sofia"), "prior fixture child names must not leak");
  assert.match(text, /Successor Trustee: Jordan Nguyen/);
  assert.match(text, /Executor: Jordan Nguyen/);
  // Healthcare role absent → empty substitution, tag gone
  assert.match(text, /Healthcare Agent:\s*$/m);
  assertNoUnresolvedMapperTags(text, ["client_full_name", "spouse_full_name", "trust_name"]);
});

test("intake → fill (synthetic): wrong party names would fail — adult-children partnered fixture", () => {
  const variables = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Sam", lastName: "Okoro" },
        maritalStatus: "partnered",
        spouseOrPartner: { firstName: "Riley", lastName: "Okoro" },
        isCAResident: false,
        countyOfResidence: "Multnomah",
      },
      family: {
        children: [
          {
            firstName: "Pat",
            lastName: "Okoro",
            dateOfBirth: "1995-05-05",
            relationship: "child",
            isMinor: false,
          },
        ],
      },
      decisionMakers: [
        {
          role: "successor_trustee",
          person: { firstName: "Pat", lastName: "Okoro" },
        },
      ],
      distribution: {
        residuary: [{ name: "Pat Okoro", relationship: "child", sharePercent: 100 }],
      },
    },
    "revocable_trust",
  );
  const text = plainTextFromDocx(renderDocx(createIntakeFillTemplateDocx(), variables));

  assert.match(text, /Client: Sam Okoro/);
  assert.match(text, /Spouse: Riley Okoro/);
  assert.ok(text.includes("- Pat Okoro (child)"));
  assert.ok(text.includes("- Pat Okoro @ 100%"));
  assert.ok(!text.includes("[Has minor children]"));
  assert.match(text, /Successor Trustee: Pat Okoro/);
  // Must not accidentally use client as spouse or trustee
  assert.ok(!/Spouse: Sam Okoro/.test(text));
});

test("intake → fill (synthetic): DRAFT watermark applied post-render without stripping filled values", () => {
  const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust");
  const filled = renderDocx(createIntakeFillTemplateDocx(), variables);
  const zip = new PizZip(filled);
  applyDraftWatermark(zip);
  const out = zip.generate({ type: "nodebuffer" }) as Buffer;
  const text = plainTextFromDocx(out);

  assert.ok(text.includes(DRAFT_TEXT) || zip.file("word/header1.xml")?.asText().includes(DRAFT_TEXT));
  assert.match(text, /Elena Vargas/);
  assert.match(text, /Vargas Revocable Living Trust/);
});

// ---------------------------------------------------------------------------
// Real Trust Family corpus: normalize → map → fill → assert substitutions
// ---------------------------------------------------------------------------

for (const entry of TRUST_FAMILY) {
  test(`intake → fill (Trust Family ${entry.id}): mapper vars substitute into normalized template`, (t) => {
    const abs = path.join(WEB_ROOT, entry.rel);
    if (!existsSync(abs)) {
      t.skip(`missing corpus file: ${entry.rel}`);
      return;
    }

    const { buffer: normalized, report } = normalizeTemplateBuffer(readFileSync(abs));
    assert.equal(
      report.ok,
      true,
      `${entry.id} normalize must succeed before fill; errors=${report.errors.map((e) => e.message).join(" | ")}`,
    );

    const variables = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", {
      generationDate: "2026-05-26",
      firmName: "Vargas Law LLP",
    });

    const filled = renderDocx(normalized, variables);
    const text = plainTextFromDocx(filled);

    // Core settlor / trust / residency / trustee substitutions
    assert.ok(text.includes("Elena Vargas"), "client_full_name must appear in filled Trust Family doc");
    assert.match(
      text,
      /Elena Vargas\s+and\s+Diego Vargas/,
      "settlor clause must include spouse_full_name for married intake ({#has_spouse} polarity)",
    );
    assert.ok(
      text.includes("Vargas Revocable Living Trust"),
      "trust_name must appear in filled Trust Family doc",
    );
    assert.ok(text.includes("San Francisco"), "county_of_residence / marriage city must appear");
    assert.ok(
      text.includes("Isabella Vargas"),
      "successor_trustee_full_name must appear",
    );
    assert.ok(
      text.includes("Carmen Vargas"),
      "second_successor_trustee_full_name must appear",
    );
    assert.ok(
      text.includes("September 1, 2000"),
      "marriage_date must appear after normalize→fill",
    );
    assert.ok(
      text.includes("21") && text.includes("25"),
      "educational trust ages must appear after normalize→fill",
    );

    // Children + residuary loops (tags present on normalized Trust Family docs)
    assert.ok(text.includes("Sofia Vargas"), "child full_name from children loop");
    assert.ok(text.includes("Leo Vargas"), "second child from children loop");

    assertNoUnresolvedMapperTags(text, [
      "client_full_name",
      "spouse_full_name",
      "trust_name",
      "county_of_residence",
      "successor_trustee_full_name",
      "second_successor_trustee_full_name",
      "marriage_city_state",
      "marriage_date",
      "first_distribution_age",
      "educational_trust_eligibility_age",
    ]);
  });
}

test("intake → fill (Trust Family mprg7y50): settlor spouse polarity — married includes spouse, single omits and-clause", (t) => {
  /**
   * Regression: Trust Family settlor clause previously wrapped spouse_full_name in
   * inverted `{^has_spouse}`. After the polarity repair in normalize-tags, married
   * fills show both names; single fills omit the `and {spouse}` segment.
   */
  const abs = path.join(WEB_ROOT, TRUST_FAMILY[0].rel);
  if (!existsSync(abs)) {
    t.skip("missing mprg7y50");
    return;
  }

  const { buffer: normalized } = normalizeTemplateBuffer(readFileSync(abs));

  const marriedText = plainTextFromDocx(
    renderDocx(
      normalized,
      mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust"),
    ),
  );
  assert.ok(marriedText.includes("Elena Vargas"));
  assert.match(
    marriedText,
    /Elena Vargas\s+and\s+Diego Vargas/,
    "married settlor clause must substitute spouse_full_name after polarity fix",
  );

  const singleText = plainTextFromDocx(
    renderDocx(
      normalized,
      mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust"),
    ),
  );
  assert.ok(singleText.includes("Alex Nguyen"));
  // Positive {#has_spouse} omits the and-spouse segment for single intakes
  assert.ok(
    !/Alex Nguyen\s+and\s*,/.test(singleText),
    "single settlor clause must not render empty and-spouse segment",
  );
  assert.match(singleText, /Alex Nguyen\s*,\s*sometimes hereafter called/);
});

// ---------------------------------------------------------------------------
// Complementary empty-safe / wrong-role fill (Phase 7 smoke owns filled happy path)
// ---------------------------------------------------------------------------

test("complementary intake → fill (synthetic): omitted soft-blanks leave no brace tags / no dangling and", () => {
  const variables = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust", {
    generationDate: "2026-05-26",
  });
  const text = plainTextFromDocx(renderDocx(createIntakeFillTemplateDocx(), variables));

  // Empty substitutions — tags gone, labels present with blank values.
  assert.match(text, /Second Successor:\s*$/m);
  assert.match(text, /Deemed Survivor:\s*$/m);
  assert.match(text, /First Distribution Age:\s*$/m);
  assert.match(text, /Educational Eligibility Age:\s*$/m);
  assert.ok(!text.includes("Carmen Vargas"), "fidelity-fixture second successor must not leak");
  assert.ok(!text.includes("Diego Vargas"), "married deemed survivor / spouse must not leak");
  assert.ok(!text.includes("{second_successor_trustee_full_name}"));
  assert.ok(!text.includes("{deemed_survivor_full_name}"));
  assert.ok(!text.includes("{first_distribution_age}"));
  assert.ok(!text.includes("{educational_trust_eligibility_age}"));
  // Inverted no-spouse section shows; positive spouse block omitted (no "Spouse: and").
  assert.ok(text.includes("[No spouse section]"));
  assert.ok(!text.includes("Spouse:"), "positive spouse line must be omitted for single");
  assert.ok(!/and\s*,/.test(text), "must not leave dangling 'and ,' from empty spouse glue");
});

test("complementary intake → fill (synthetic): whitespace-only ages render empty (no brace residue)", () => {
  const variables = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Pat", lastName: "Lee" },
        maritalStatus: "single",
        isCAResident: true,
        countyOfResidence: "Alameda",
      },
      decisionMakers: [
        {
          role: "successor_trustee",
          person: { firstName: "Jordan", lastName: "Lee" },
        },
      ],
      distribution: {
        firstDistributionAge: "   ",
        educationalTrustEligibilityAge: "\t  ",
      },
    },
    "revocable_trust",
  );
  const text = plainTextFromDocx(renderDocx(createIntakeFillTemplateDocx(), variables));

  assert.match(text, /Client: Pat Lee/);
  assert.match(text, /First Distribution Age:\s*$/m);
  assert.match(text, /Educational Eligibility Age:\s*$/m);
  assert.ok(!text.includes("{first_distribution_age}"));
  assert.ok(!text.includes("{educational_trust_eligibility_age}"));
});

test("complementary intake → fill (synthetic): linked alternate fills second successor; unrelated ignored", () => {
  const viaAlt = plainTextFromDocx(
    renderDocx(
      createIntakeFillTemplateDocx(),
      mapIntakeToDocVariables(marriedAlternateSuccessorIntake, "revocable_trust"),
    ),
  );
  assert.match(viaAlt, /Successor Trustee: Isabella Vargas/);
  assert.match(viaAlt, /Second Successor: Nora Chen/);
  assert.match(viaAlt, /Deemed Survivor: Nora Chen/);
  assert.ok(!viaAlt.includes("Carmen Vargas"), "2nd successor_trustee fixture must not leak");

  const unrelated = plainTextFromDocx(
    renderDocx(
      createIntakeFillTemplateDocx(),
      mapIntakeToDocVariables(
        {
          personal: {
            client: { firstName: "A", lastName: "B" },
            maritalStatus: "single",
            isCAResident: true,
          },
          decisionMakers: [
            {
              id: "dm-exec",
              role: "executor",
              person: { firstName: "Exec", lastName: "One" },
            },
            {
              id: "dm-succ",
              role: "successor_trustee",
              person: { firstName: "Succ", lastName: "One" },
            },
            {
              id: "dm-alt-exec",
              role: "alternate",
              alternateFor: "dm-exec",
              person: { firstName: "Alt", lastName: "Exec" },
            },
          ],
        },
        "revocable_trust",
      ),
    ),
  );
  assert.match(unrelated, /Successor Trustee: Succ One/);
  assert.match(unrelated, /Second Successor:\s*$/m);
  assert.ok(!unrelated.includes("Alt Exec"), "executor alternate must not fill second successor");
  assert.ok(!unrelated.includes("{second_successor_trustee_full_name}"));
});
