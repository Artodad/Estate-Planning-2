/**
 * Trust draft punch list: leftover braces + empty optionals that map to a
 * required wizard control. Source is a stored generate fill report.
 *
 * Jump resolution uses MAPPER_CONTRACT_KEYS / TAG_ALIASES only.
 * Field query values are existing Field id={name} strings — not invented ids.
 */

import type { DocumentFillReport } from "@/features/documents/types";
import {
  MAPPER_CONTRACT_KEYS,
  TAG_ALIASES,
  splitTag,
  type MapperContractKey,
} from "@/features/documents/template-normalize/normalize-tags";
import { SECTION_ORDER, type SectionKey } from "@/features/intake/schemas/intake";

const CANONICAL_SET = new Set<string>(MAPPER_CONTRACT_KEYS);

/** Existing Field `id={name}` (and the two ids added on already-rendered controls). */
const EXISTING_FIELD_BY_MAPPER_KEY: Partial<Record<MapperContractKey, string>> = {
  client_first_name: "client.firstName",
  client_last_name: "client.lastName",
  client_dob: "client.dateOfBirth",
  client_email: "client.email",
  client_phone: "client.phone",
  spouse_first_name: "spouseOrPartner.firstName",
  spouse_last_name: "spouseOrPartner.lastName",
  marriage_city_state: "marriageCityState",
  marriage_date: "marriageDate",
  county_of_residence: "countyOfResidence",
  deemed_survivor_full_name: "deemedSurvivorFullName",
  is_ca_resident: "isCA",
  young_person_retention_age: "youngPersonRetentionAge",
  first_distribution_age: "firstDistributionAge",
  second_distribution_age: "secondDistributionAge",
  third_distribution_age: "thirdDistributionAge",
  outright_distribution_age: "outrightDistributionAge",
  educational_trust_eligibility_age: "educationalTrustEligibilityAge",
  educational_trust_remainder_age: "educationalTrustRemainderAge",
  educational_trust_termination_age: "educationalTrustTerminationAge",
  minor_trust_provisions: "minorTrustProvisions",
  healthcare_instructions: "careInstructions",
  primary_physician: "primaryPhysician",
};

/**
 * Section for JUMP_TO. Keys with no honest intake home (meta / computed) stay
 * off this map so the row is disabled.
 */
const SECTION_BY_MAPPER_KEY: Partial<Record<MapperContractKey, SectionKey>> = {
  client_full_name: "personal",
  client_first_name: "personal",
  client_last_name: "personal",
  client_dob: "personal",
  client_email: "personal",
  client_phone: "personal",
  has_spouse: "personal",
  spouse_full_name: "personal",
  spouse_first_name: "personal",
  spouse_last_name: "personal",
  marriage_city_state: "personal",
  marriage_date: "personal",
  is_ca_resident: "personal",
  is_married_and_ca: "personal",
  county_of_residence: "personal",
  deemed_survivor_full_name: "personal",
  children: "family",
  has_minor_children: "family",
  other_dependents: "family",
  pets: "family",
  assets: "assets",
  has_community_property_assets: "assets",
  liabilities: "liabilities",
  decision_makers: "decisionMakers",
  executor_full_name: "decisionMakers",
  successor_trustee_full_name: "decisionMakers",
  second_successor_trustee_full_name: "decisionMakers",
  financial_poa_full_name: "decisionMakers",
  healthcare_agent_full_name: "decisionMakers",
  guardian_of_minor_full_name: "decisionMakers",
  specific_gifts: "gifts",
  distribution_residuary: "distribution",
  minor_trust_provisions: "distribution",
  spendthrift_clause: "distribution",
  contingent_beneficiaries: "distribution",
  young_person_retention_age: "distribution",
  first_distribution_age: "distribution",
  second_distribution_age: "distribution",
  third_distribution_age: "distribution",
  outright_distribution_age: "distribution",
  educational_trust_eligibility_age: "distribution",
  educational_trust_remainder_age: "distribution",
  educational_trust_termination_age: "distribution",
  charitable_organizations: "charitable",
  healthcare_instructions: "healthcare",
  anatomical_gifts: "healthcare",
  polst_notes: "healthcare",
  primary_physician: "healthcare",
  prior_planning_notes: "priorPlanning",
  beneficiary_designations: "priorPlanning",
  digital_assets_notes: "priorPlanning",
};

/**
 * Mapper keys whose wizard control is Zod-required (not `.optional()`, not
 * "leave blank"). Used only to decide whether an emptyOptional is a punch-list
 * row. Leftovers are always listed.
 */
const REQUIRED_WIZARD_MAPPER_KEYS = new Set<MapperContractKey>([
  "client_first_name",
  "client_last_name",
  "client_full_name",
  "has_spouse",
]);

export type PunchListRow = {
  tag: string;
  /** ?section=&field= when we can land; null = disabled, no landing */
  href: string | null;
  section: SectionKey | null;
  /** Existing Field id={name} only. Null = JUMP_TO only (fake). */
  field: string | null;
};

export function isWizardSectionKey(value: string | undefined | null): value is SectionKey {
  return !!value && (SECTION_ORDER as readonly string[]).includes(value);
}

/** Strip leftover `{#name}` / `{^name}` / `{name}` down to the identifier. */
export function resolveFillTagToMapperKey(raw: string): MapperContractKey | null {
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "").trim();
  const split = splitTag(inner);
  const name = split?.name || inner.replace(/^[#/^]/, "");
  if (!name) return null;
  if (CANONICAL_SET.has(name)) return name as MapperContractKey;
  return TAG_ALIASES[name] ?? null;
}

export function wizardJumpForMapperKey(key: MapperContractKey): {
  section: SectionKey | null;
  field: string | null;
} {
  const section = SECTION_BY_MAPPER_KEY[key] ?? null;
  const field = EXISTING_FIELD_BY_MAPPER_KEY[key] ?? null;
  return { section, field };
}

export function punchListHref(section: SectionKey | null, field: string | null): string | null {
  if (!section) return null;
  const params = new URLSearchParams({ section });
  if (field) params.set("field", field);
  return `?${params.toString()}`;
}

/**
 * Punch list from a generate's stored fill report.
 * leftoverBraces always; emptyOptionals only when they resolve to a required
 * wizard control. Allowed (Zod optional / leave-blank) empties stay quiet.
 */
export function punchListFromFillReport(report: DocumentFillReport): PunchListRow[] {
  const seen = new Set<string>();
  const rows: PunchListRow[] = [];

  const push = (tag: string, requireRequiredWizard: boolean) => {
    if (seen.has(tag)) return;
    const key = resolveFillTagToMapperKey(tag);
    if (requireRequiredWizard) {
      if (!key || !REQUIRED_WIZARD_MAPPER_KEYS.has(key)) return;
    }
    seen.add(tag);
    const { section, field } = key
      ? wizardJumpForMapperKey(key)
      : { section: null, field: null };
    rows.push({
      tag,
      href: punchListHref(section, field),
      section,
      field: section ? field : null,
    });
  };

  for (const tag of report.leftoverBraces) push(tag, false);
  for (const tag of report.emptyOptionals) push(tag, true);

  return rows;
}
