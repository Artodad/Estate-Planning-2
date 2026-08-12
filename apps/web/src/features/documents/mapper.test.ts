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

  assert.equal(decisionMakers.length, 5);
  assert.equal(v.spendthrift_clause, true);
  assert.equal(v.minor_trust_provisions, "Distribute at age 25");
  assert.equal(v.anatomical_gifts, true);
  assert.equal(v.healthcare_instructions, "Prefer comfort care");
  assert.ok(String(v.attorney_notes_for_document).includes("education funding"));
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
