/**
 * Unit tests for mapIntakeToDocVariables — intake answers → docxtemplater variables.
 *
 * Behavioral focus: field mappings that would produce wrong filled documents
 * (party names, spouse flags, minors, community property, role shortcuts, type-specific vars).
 *
 * Run: cd apps/web && npx tsx --test src/features/documents/mapper.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import { mapIntakeToDocVariables, mapToPourOverWill, mapToRevocableTrust } from "./mapper";
import {
  marriedAlternateSuccessorIntake,
  marriedCaRichIntake,
  missingClientNameIntake,
  partneredAdultChildrenNonCaIntake,
  singleNoChildrenIntake,
} from "./__fixtures__/intake-answers";

const EXTRA = {
  generationDate: "2026-05-26",
  firmName: "Vargas Law LLP",
  matterDisplayName: "Elena Vargas Matter",
};

test("married CA rich intake → revocable_trust maps party names, spouse, trust_name, roles", () => {
  const v = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", EXTRA);

  assert.equal(v.client_full_name, "Elena Vargas");
  assert.equal(v.client_first_name, "Elena");
  assert.equal(v.client_last_name, "Vargas");
  assert.equal(v.client_dob, "1975-04-12");
  assert.equal(v.client_email, "elena@example.com");

  assert.equal(v.has_spouse, true);
  assert.equal(v.spouse_full_name, "Diego Vargas");
  assert.equal(v.spouse_first_name, "Diego");
  assert.equal(v.spouse_last_name, "Vargas");

  assert.equal(v.is_ca_resident, true);
  assert.equal(v.is_married_and_ca, true);
  assert.equal(v.county_of_residence, "San Francisco");

  assert.equal(v.trust_name, "Vargas Revocable Living Trust");
  assert.equal(v.has_pour_over_will, true);
  assert.equal(v.document_type, "revocable_trust");
  assert.equal(v.generation_date, "2026-05-26");
  assert.equal(v.firm_name, "Vargas Law LLP");
  assert.equal(v.matter_display_name, "Elena Vargas Matter");

  assert.equal(v.executor_full_name, "Elena Vargas");
  assert.equal(v.successor_trustee_full_name, "Isabella Vargas");
  assert.equal(v.financial_poa_full_name, "Isabella Vargas");
  assert.equal(v.healthcare_agent_full_name, "Marco Vargas");
  assert.equal(v.guardian_of_minor_full_name, "Marco Vargas");
});

test("married CA rich intake → children/assets/distribution arrays and CA flags", () => {
  const v = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", EXTRA);
  const children = v.children as Array<Record<string, unknown>>;
  const assets = v.assets as Array<Record<string, unknown>>;
  const residuary = v.distribution_residuary as Array<Record<string, unknown>>;
  const gifts = v.specific_gifts as Array<Record<string, unknown>>;
  const decisionMakers = v.decision_makers as Array<Record<string, unknown>>;

  assert.equal(children.length, 2);
  assert.equal(children[0].full_name, "Sofia Vargas");
  assert.equal(children[0].relationship, "daughter");
  assert.equal(children[0].is_minor, true);
  assert.equal(children[0].guardian_preference, "Marco (uncle)");
  assert.equal(children[1].full_name, "Leo Vargas");
  assert.equal(v.has_minor_children, true);

  assert.equal(assets.length, 3);
  assert.equal(assets[0].is_community_property, true);
  assert.equal(assets[0].description, "456 Maple Ave, San Francisco, CA 94102");
  assert.equal(assets[1].is_community_property, false);
  assert.equal(v.has_community_property_assets, true);
  assert.equal(v.schedule_a_real_estate_count, 1);
  assert.equal(v.schedule_b_personal_property_count, 1); // vehicle

  assert.equal(residuary.length, 2);
  assert.equal(residuary[0].name, "Sofia Vargas");
  assert.equal(residuary[0].share_percent, 50);
  assert.equal(residuary[1].name, "Leo Vargas");

  assert.equal(gifts.length, 1);
  assert.equal(gifts[0].beneficiary, "Sofia Vargas");
  assert.equal(gifts[0].description, "Grandmother's piano");

  assert.equal(decisionMakers.length, 6);
  assert.equal(v.spendthrift_clause, true);
  assert.equal(v.minor_trust_provisions, "Distribute at age 25");
  assert.equal(v.anatomical_gifts, true);
  assert.equal(v.healthcare_instructions, "Prefer comfort care");
  assert.ok(String(v.attorney_notes_for_document).includes("education funding"));
});

test("married CA rich intake → Trust Family soft-blank tags from intake", () => {
  const v = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", EXTRA);

  assert.equal(v.marriage_city_state, "San Francisco, California");
  assert.equal(v.marriage_date, "September 1, 2000");
  assert.equal(v.deemed_survivor_full_name, "Diego Vargas");
  assert.equal(v.second_successor_trustee_full_name, "Carmen Vargas");

  assert.equal(v.young_person_retention_age, "18");
  assert.equal(v.first_distribution_age, "23");
  assert.equal(v.second_distribution_age, "28");
  assert.equal(v.third_distribution_age, "33");
  assert.equal(v.outright_distribution_age, "40");
  assert.equal(v.educational_trust_eligibility_age, "21");
  assert.equal(v.educational_trust_remainder_age, "25");
  assert.equal(v.educational_trust_termination_age, "30");
});

test("missing optional Trust Family fields stay empty-safe strings", () => {
  const v = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust", EXTRA);
  assert.equal(v.marriage_city_state, "");
  assert.equal(v.marriage_date, "");
  assert.equal(v.deemed_survivor_full_name, "");
  assert.equal(v.second_successor_trustee_full_name, "");
  assert.equal(v.young_person_retention_age, "");
  assert.equal(v.first_distribution_age, "");
  assert.equal(v.second_distribution_age, "");
  assert.equal(v.third_distribution_age, "");
  assert.equal(v.outright_distribution_age, "");
  assert.equal(v.educational_trust_eligibility_age, "");
  assert.equal(v.educational_trust_remainder_age, "");
  assert.equal(v.educational_trust_termination_age, "");
  // Empty string, never undefined (docxtemplater nullGetter safety)
  assert.equal(typeof v.deemed_survivor_full_name, "string");
  assert.equal(typeof v.educational_trust_termination_age, "string");
});

test("single / no children → empty optional sections, no spouse, empty role gaps", () => {
  const v = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust", {
    generationDate: "2026-05-26",
  });

  assert.equal(v.client_full_name, "Alex Nguyen");
  assert.equal(v.has_spouse, false);
  assert.equal(v.spouse_full_name, "");
  assert.equal(v.is_married_and_ca, false);
  assert.equal(v.county_of_residence, "Alameda");

  assert.deepEqual(v.children, []);
  assert.equal(v.has_minor_children, false);
  assert.deepEqual(v.specific_gifts, []);
  assert.deepEqual(v.charitable_organizations, []);
  assert.deepEqual(v.liabilities, []);

  assert.equal(v.has_community_property_assets, false);
  assert.equal(v.executor_full_name, "Jordan Nguyen");
  assert.equal(v.successor_trustee_full_name, "Jordan Nguyen");
  // Roles not provided stay empty strings (not undefined) for docxtemplater safety
  assert.equal(v.healthcare_agent_full_name, "");
  assert.equal(v.guardian_of_minor_full_name, "");
  assert.equal(v.financial_poa_full_name, "");

  assert.equal(v.trust_name, "Nguyen Revocable Living Trust");
});

test("partnered non-CA adult children → spouse yes, minors no, no community flag", () => {
  const v = mapIntakeToDocVariables(
    partneredAdultChildrenNonCaIntake,
    "revocable_trust",
  );

  assert.equal(v.client_full_name, "Sam Okoro");
  assert.equal(v.has_spouse, true);
  assert.equal(v.spouse_full_name, "Riley Okoro");
  assert.equal(v.is_ca_resident, false);
  assert.equal(v.is_married_and_ca, false);
  assert.equal(v.has_minor_children, false);
  assert.equal((v.children as unknown[]).length, 1);
  assert.equal((v.children as Array<{ is_minor: boolean }>)[0].is_minor, false);
  assert.equal(v.has_community_property_assets, false);
  assert.equal(v.healthcare_agent_full_name, "Riley Okoro");
  assert.equal(v.executor_full_name, "");
});

test("pour_over_will type-specific fields + shared party names", () => {
  const v = mapToPourOverWill(marriedCaRichIntake, EXTRA);

  assert.equal(v.document_type, "pour_over_will");
  assert.equal(v.will_title, "Elena Vargas Pour-Over Will");
  assert.equal(v.has_revocable_trust, true);
  assert.equal(v.guardian_nominations, "Marco Vargas");
  assert.equal(v.executor_full_name, "Elena Vargas");
  // trust-only keys are not added for will
  assert.equal(v.trust_name, undefined);
});

test("mapToRevocableTrust convenience matches central mapper", () => {
  const a = mapToRevocableTrust(marriedCaRichIntake, EXTRA);
  const b = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust", EXTRA);
  assert.deepEqual(a, b);
});

test("missing client name throws clear attorney-actionable error", () => {
  assert.throws(
    () => mapIntakeToDocVariables(missingClientNameIntake, "revocable_trust"),
    /client full name is required/i,
  );
});

test("whitespace-only names trim; empty optional arrays always present", () => {
  const v = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "  Pat  ", lastName: "  Lee  " },
        maritalStatus: "divorced",
        isCAResident: true,
      },
    },
    "durable_poa_financial" as any,
  );

  assert.equal(v.client_full_name, "Pat Lee");
  assert.equal(v.has_spouse, false);
  assert.ok(Array.isArray(v.children));
  assert.ok(Array.isArray(v.assets));
  assert.ok(Array.isArray(v.decision_makers));
  assert.ok(Array.isArray(v.distribution_residuary));
  assert.equal(v.document_type, "durable_poa_financial");
  // non-trust/will types get base only
  assert.equal(v.trust_name, undefined);
  assert.equal(v.will_title, undefined);
});

test("healthcareAgentId cross-ref resolves when role shortcut absent", () => {
  const v = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "A", lastName: "B" },
        maritalStatus: "single",
        isCAResident: true,
      },
      decisionMakers: [
        {
          id: "dm-health",
          role: "alternate",
          person: { firstName: "Casey", lastName: "Grove" },
        },
      ],
      healthcare: { healthcareAgentId: "dm-health" },
    },
    "revocable_trust",
  );

  assert.equal(v.healthcare_agent_full_name, "Casey Grove");
});

// ---------------------------------------------------------------------------
// Complementary edges for intake-backed soft-blank tags
// Happy-path filled Trust Family smoke lives in template-fidelity-smoke.test.ts.
// ---------------------------------------------------------------------------

test("marriage_city_state / marriage_date trim whitespace; omitted when married stays empty (no spouse fallback)", () => {
  const trimmed = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Pat", lastName: "Lee" },
        maritalStatus: "married",
        spouseOrPartner: { firstName: "Sam", lastName: "Lee" },
        marriageCityState: "  Los Angeles, California  ",
        marriageDate: "  May 1, 2010  ",
        isCAResident: true,
      },
    },
    "revocable_trust",
  );
  assert.equal(trimmed.marriage_city_state, "Los Angeles, California");
  assert.equal(trimmed.marriage_date, "May 1, 2010");

  const marriedNoVenue = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Pat", lastName: "Lee" },
        maritalStatus: "married",
        spouseOrPartner: { firstName: "Sam", lastName: "Lee" },
        isCAResident: true,
      },
    },
    "revocable_trust",
  );
  assert.equal(marriedNoVenue.has_spouse, true);
  assert.equal(marriedNoVenue.spouse_full_name, "Sam Lee");
  assert.equal(marriedNoVenue.marriage_city_state, "");
  assert.equal(marriedNoVenue.marriage_date, "");
});

test("deemed_survivor_full_name maps from intake; omitted stays empty (never spouse/client guess)", () => {
  const present = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust");
  assert.equal(present.deemed_survivor_full_name, "Diego Vargas");

  const omitted = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Pat", lastName: "Lee" },
        maritalStatus: "married",
        spouseOrPartner: { firstName: "Sam", lastName: "Lee" },
        isCAResident: true,
      },
    },
    "revocable_trust",
  );
  assert.equal(omitted.spouse_full_name, "Sam Lee");
  assert.equal(omitted.deemed_survivor_full_name, "");
  assert.notEqual(omitted.deemed_survivor_full_name, omitted.spouse_full_name);
  assert.notEqual(omitted.deemed_survivor_full_name, omitted.client_full_name);

  const whitespaceOnly = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "Pat", lastName: "Lee" },
        maritalStatus: "married",
        spouseOrPartner: { firstName: "Sam", lastName: "Lee" },
        deemedSurvivorFullName: "   ",
        isCAResident: true,
      },
    },
    "revocable_trust",
  );
  assert.equal(whitespaceOnly.deemed_survivor_full_name, "");
});

test("second_successor_trustee_full_name from alternate linked to primary; unrelated alternate ignored", () => {
  const viaAlt = mapIntakeToDocVariables(marriedAlternateSuccessorIntake, "revocable_trust");
  assert.equal(viaAlt.successor_trustee_full_name, "Isabella Vargas");
  assert.equal(viaAlt.second_successor_trustee_full_name, "Nora Chen");

  const unrelatedAlt = mapIntakeToDocVariables(
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
  );
  assert.equal(unrelatedAlt.successor_trustee_full_name, "Succ One");
  assert.equal(unrelatedAlt.second_successor_trustee_full_name, "");
});

test("young-person / staggered / outright ages map from distribution; trim + empty-safe", () => {
  const present = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust");
  assert.equal(present.young_person_retention_age, "18");
  assert.equal(present.first_distribution_age, "23");
  assert.equal(present.second_distribution_age, "28");
  assert.equal(present.third_distribution_age, "33");
  assert.equal(present.outright_distribution_age, "40");

  const whitespaceAges = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "A", lastName: "B" },
        maritalStatus: "single",
        isCAResident: true,
      },
      distribution: {
        youngPersonRetentionAge: "   ",
        firstDistributionAge: "  \t  ",
        secondDistributionAge: " ",
        thirdDistributionAge: "\n",
        outrightDistributionAge: "  ",
        educationalTrustEligibilityAge: "   ",
        educationalTrustRemainderAge: "\t",
        educationalTrustTerminationAge: "  ",
      },
    },
    "revocable_trust",
  );
  assert.equal(whitespaceAges.young_person_retention_age, "");
  assert.equal(whitespaceAges.first_distribution_age, "");
  assert.equal(whitespaceAges.second_distribution_age, "");
  assert.equal(whitespaceAges.third_distribution_age, "");
  assert.equal(whitespaceAges.outright_distribution_age, "");
  assert.equal(whitespaceAges.educational_trust_eligibility_age, "");
  assert.equal(whitespaceAges.educational_trust_remainder_age, "");
  assert.equal(whitespaceAges.educational_trust_termination_age, "");

  const trimmed = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "A", lastName: "B" },
        maritalStatus: "single",
        isCAResident: true,
      },
      distribution: {
        youngPersonRetentionAge: "  19  ",
        firstDistributionAge: "  24  ",
        secondDistributionAge: "  29  ",
        thirdDistributionAge: "  34  ",
        outrightDistributionAge: "  40  ",
        educationalTrustEligibilityAge: "  20  ",
        educationalTrustRemainderAge: "  24  ",
        educationalTrustTerminationAge: "  30  ",
      },
    },
    "revocable_trust",
  );
  assert.equal(trimmed.young_person_retention_age, "19");
  assert.equal(trimmed.first_distribution_age, "24");
  assert.equal(trimmed.second_distribution_age, "29");
  assert.equal(trimmed.third_distribution_age, "34");
  assert.equal(trimmed.outright_distribution_age, "40");
  assert.equal(trimmed.educational_trust_eligibility_age, "20");
  assert.equal(trimmed.educational_trust_remainder_age, "24");
  assert.equal(trimmed.educational_trust_termination_age, "30");

  const empty = mapIntakeToDocVariables(partneredAdultChildrenNonCaIntake, "revocable_trust");
  assert.equal(empty.young_person_retention_age, "");
  assert.equal(empty.first_distribution_age, "");
  assert.equal(empty.second_distribution_age, "");
  assert.equal(empty.third_distribution_age, "");
  assert.equal(empty.outright_distribution_age, "");
});

test("Educational Trust ages map as distinct intake-backed keys (present + empty-safe)", () => {
  const present = mapIntakeToDocVariables(marriedCaRichIntake, "revocable_trust");
  assert.equal(present.educational_trust_eligibility_age, "21");
  assert.equal(present.educational_trust_remainder_age, "25");
  assert.equal(present.educational_trust_termination_age, "30");
  // Distinct tags must not collapse to one shared value when intake differs
  assert.notEqual(present.educational_trust_eligibility_age, present.educational_trust_termination_age);

  const distinct = mapIntakeToDocVariables(
    {
      personal: {
        client: { firstName: "A", lastName: "B" },
        maritalStatus: "single",
        isCAResident: true,
      },
      distribution: {
        educationalTrustEligibilityAge: "  20  ",
        educationalTrustRemainderAge: "  24  ",
        educationalTrustTerminationAge: "  30  ",
      },
    },
    "revocable_trust",
  );
  assert.equal(distinct.educational_trust_eligibility_age, "20");
  assert.equal(distinct.educational_trust_remainder_age, "24");
  assert.equal(distinct.educational_trust_termination_age, "30");

  const empty = mapIntakeToDocVariables(singleNoChildrenIntake, "revocable_trust");
  assert.equal(empty.educational_trust_eligibility_age, "");
  assert.equal(empty.educational_trust_remainder_age, "");
  assert.equal(empty.educational_trust_termination_age, "");
});

// Still suggestion-only — no intake/mapper scalars; do not invent wiring.
test.todo("distribution description blank stays suggestion-only (no intake-backed mapper scalar)");
test.todo("do/do not blank stays suggestion-only (no intake-backed mapper conditional)");
test.todo("CEB 'Can Choose a Specific Person…' note stays suggestion-only (no mapper scalar)");
