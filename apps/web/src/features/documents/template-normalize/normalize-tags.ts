/**
 * Rename common wrong / legacy placeholder names to the mapper contract.
 *
 * Canonical names come from `mapIntakeToDocVariables` in mapper.ts
 * (see also docs/template-preparation-guide.md). This pass only rewrites
 * tag identifiers inside `{...}` — never surrounding legal language.
 */

import PizZip from "pizzip";

import type { NormalizeReportItem } from "./types";

const XML_PART_RE =
  /^word\/(document\.xml|header\d*\.xml|footer\d*\.xml|footnotes\.xml|endnotes\.xml)$/;

/**
 * Canonical top-level keys emitted by mapIntakeToDocVariables (mapper contract).
 * Keep in sync when the mapper grows; used for alias targets + validation fixtures.
 */
export const MAPPER_CONTRACT_KEYS = [
  // Client
  "client_full_name",
  "client_first_name",
  "client_last_name",
  "client_dob",
  "client_email",
  "client_phone",
  // Spouse
  "has_spouse",
  "spouse_full_name",
  "spouse_first_name",
  "spouse_last_name",
  "marriage_city_state",
  "marriage_date",
  // CA
  "is_ca_resident",
  "is_married_and_ca",
  "county_of_residence",
  // Family
  "children",
  "has_minor_children",
  "other_dependents",
  "pets",
  // Assets / liabilities
  "assets",
  "has_community_property_assets",
  "liabilities",
  // Decision makers
  "decision_makers",
  "executor_full_name",
  "successor_trustee_full_name",
  "second_successor_trustee_full_name",
  "financial_poa_full_name",
  "healthcare_agent_full_name",
  "guardian_of_minor_full_name",
  "deemed_survivor_full_name",
  // Gifts / distribution
  "specific_gifts",
  "distribution_residuary",
  "minor_trust_provisions",
  "spendthrift_clause",
  "contingent_beneficiaries",
  "young_person_retention_age",
  "first_distribution_age",
  "second_distribution_age",
  "third_distribution_age",
  "outright_distribution_age",
  "educational_trust_eligibility_age",
  "educational_trust_remainder_age",
  "educational_trust_termination_age",
  // Charitable
  "charitable_organizations",
  // Healthcare
  "healthcare_instructions",
  "anatomical_gifts",
  "polst_notes",
  "primary_physician",
  // Prior planning
  "prior_planning_notes",
  "beneficiary_designations",
  "digital_assets_notes",
  // Meta
  "attorney_notes_for_document",
  "generation_date",
  "firm_name",
  "matter_display_name",
  "document_type",
  // Type-specific (trust / will)
  "trust_name",
  "has_pour_over_will",
  "schedule_a_real_estate_count",
  "schedule_b_personal_property_count",
  "will_title",
  "executor_powers",
  "guardian_nominations",
  "has_revocable_trust",
] as const;

export type MapperContractKey = (typeof MAPPER_CONTRACT_KEYS)[number];

const CANONICAL_SET = new Set<string>(MAPPER_CONTRACT_KEYS);

/**
 * Common wrong names → mapper contract keys.
 * Keys are matched case-sensitively on the identifier (after stripping #/^/).
 */
export const TAG_ALIASES: Record<string, MapperContractKey> = {
  // Client (avoid bare full_name/first_name — those are loop item fields)
  client_name: "client_full_name",
  clientName: "client_full_name",
  ClientName: "client_full_name",
  client_date_of_birth: "client_dob",
  // Spouse
  spouse_name: "spouse_full_name",
  spouseName: "spouse_full_name",
  hasSpouse: "has_spouse",
  has_spouse_or_partner: "has_spouse",
  // Family / loops
  child: "children",
  kids: "children",
  hasMinorChildren: "has_minor_children",
  has_minors: "has_minor_children",
  // Assets
  asset: "assets",
  hasCommunityProperty: "has_community_property_assets",
  has_community_property: "has_community_property_assets",
  // Decision makers
  decisionMakers: "decision_makers",
  decision_maker: "decision_makers",
  executor_name: "executor_full_name",
  successor_trustee: "successor_trustee_full_name",
  successorTrustee: "successor_trustee_full_name",
  second_successor_trustee: "second_successor_trustee_full_name",
  alternate_successor_trustee: "second_successor_trustee_full_name",
  financial_poa: "financial_poa_full_name",
  healthcare_agent: "healthcare_agent_full_name",
  health_care_agent: "healthcare_agent_full_name",
  guardian_of_minor: "guardian_of_minor_full_name",
  deemed_survivor: "deemed_survivor_full_name",
  // Marital recital
  city_and_state_of_marriage: "marriage_city_state",
  date_of_marriage: "marriage_date",
  // Gifts / distribution
  specificGifts: "specific_gifts",
  residuary: "distribution_residuary",
  residuary_beneficiaries: "distribution_residuary",
  contingentBeneficiaries: "contingent_beneficiaries",
  first_age: "first_distribution_age",
  second_age: "second_distribution_age",
  third_age: "third_distribution_age",
  // Charitable
  charitable: "charitable_organizations",
  charities: "charitable_organizations",
  // CA
  isCAResident: "is_ca_resident",
  ca_resident: "is_ca_resident",
  isMarriedAndCA: "is_married_and_ca",
  county: "county_of_residence",
  // Meta
  firm: "firm_name",
};

/** Parse `{#name}` / `{^name}` / `{/name}` / `{name}` → prefix + identifier */
export function splitTag(inner: string): { prefix: string; name: string } | null {
  if (inner === "/") return { prefix: "/", name: "" };
  const m = inner.match(/^([#/^]|\/)?([a-zA-Z_][a-zA-Z0-9_.]*)$/);
  if (!m) return null;
  return { prefix: m[1] ?? "", name: m[2] };
}

export function resolveAlias(name: string): string | null {
  if (CANONICAL_SET.has(name)) return null; // already canonical
  const mapped = TAG_ALIASES[name];
  return mapped ?? null;
}

/**
 * Apply alias renames inside a single XML string.
 * Only rewrites identifier portion of likely tags (already-repaired `{...}` forms).
 */
export function renameTagsInXml(
  xml: string,
  partName?: string,
): { xml: string; items: NormalizeReportItem[] } {
  const items: NormalizeReportItem[] = [];

  // Match simple single-brace tags; repair-runs should already have collapsed {{ }} and spaces.
  // Prefix covers {#name}, {^name}, {/name}, {name}.
  const next = xml.replace(/\{([#/^])?([a-zA-Z_][a-zA-Z0-9_.]*)\}/g, (full, prefixRaw: string | undefined, name: string) => {
    const prefix = prefixRaw ?? "";
    const alias = resolveAlias(name);
    if (!alias) return full;

    const afterInner = `${prefix}${alias}`;
    const after = `{${afterInner}}`;
    items.push({
      kind: "rename",
      code: "TAG_ALIAS_RENAME",
      message: `Renamed tag ${prefix}${name} → ${afterInner}`,
      before: full,
      after,
      part: partName,
      details: { from: name, to: alias, prefix },
    });
    return after;
  });

  return { xml: next, items };
}

/**
 * Trust Family settlor clause bug: spouse name was wrapped in inverted
 * `{^has_spouse}` (show when false). Spouse name must use positive polarity.
 *
 * Only rewrites the specific pattern
 *   `{^has_spouse} and {spouse_full_name}{/has_spouse}`
 * → `{#has_spouse} and {spouse_full_name}{/has_spouse}`
 *
 * Intentional `{^has_spouse}` "no spouse" sections elsewhere are untouched.
 */
const INVERTED_SETTLOR_SPOUSE_RE =
  /\{\^has_spouse\}(\s+and\s+)\{spouse_full_name\}(\{\/has_spouse\})/g;

export function fixSettlorSpousePolarityInXml(
  xml: string,
  partName?: string,
): { xml: string; items: NormalizeReportItem[] } {
  const items: NormalizeReportItem[] = [];
  const next = xml.replace(
    INVERTED_SETTLOR_SPOUSE_RE,
    (_full, andGap: string, closer: string) => {
      const before = `{^has_spouse}${andGap}{spouse_full_name}${closer}`;
      const after = `{#has_spouse}${andGap}{spouse_full_name}${closer}`;
      items.push({
        kind: "repair",
        code: "SETTLOR_SPOUSE_POLARITY_FIXED",
        message:
          "Corrected inverted settlor spouse polarity: {^has_spouse} → {#has_spouse} around spouse_full_name",
        before,
        after,
        part: partName,
        details: { fromPrefix: "^", toPrefix: "#", tag: "has_spouse" },
      });
      return after;
    },
  );
  return { xml: next, items };
}

/**
 * Rename aliased tags across document + header/footer parts of a .docx buffer,
 * then correct known inverted settlor spouse polarity.
 */
export function normalizeTagsInDocx(buffer: Buffer): { buffer: Buffer; items: NormalizeReportItem[] } {
  const zip = new PizZip(buffer);
  const items: NormalizeReportItem[] = [];

  for (const relativePath of Object.keys(zip.files)) {
    const file = zip.files[relativePath];
    if (file.dir) continue;
    if (!XML_PART_RE.test(relativePath)) continue;

    const xml = file.asText();
    const renamed = renameTagsInXml(xml, relativePath);
    const polarity = fixSettlorSpousePolarityInXml(renamed.xml, relativePath);
    if (polarity.xml !== xml) {
      zip.file(relativePath, polarity.xml);
    }
    items.push(...renamed.items, ...polarity.items);
  }

  items.push({
    kind: "detection",
    code: "ALIAS_PASS_COMPLETE",
    message: `Alias rename applied ${items.filter((i) => i.kind === "rename").length} rename(s)`,
  });

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" }) as Buffer;
  return { buffer: out, items };
}

/**
 * Empty-safe fixture variables covering the mapper contract for dry-run render.
 * Arrays are [], strings "", booleans false — mirrors mapper "always safe values" rule.
 */
export function buildFixtureVariables(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const arrays = new Set([
    "children",
    "other_dependents",
    "pets",
    "assets",
    "liabilities",
    "decision_makers",
    "specific_gifts",
    "distribution_residuary",
    "contingent_beneficiaries",
    "charitable_organizations",
  ]);
  const booleans = new Set([
    "has_spouse",
    "is_ca_resident",
    "is_married_and_ca",
    "has_minor_children",
    "has_community_property_assets",
    "spendthrift_clause",
    "anatomical_gifts",
    "has_pour_over_will",
    "has_revocable_trust",
  ]);
  const numbers = new Set([
    "schedule_a_real_estate_count",
    "schedule_b_personal_property_count",
  ]);

  const base: Record<string, unknown> = {};
  for (const key of MAPPER_CONTRACT_KEYS) {
    if (arrays.has(key)) base[key] = [];
    else if (booleans.has(key)) base[key] = false;
    else if (numbers.has(key)) base[key] = 0;
    else base[key] = "";
  }

  // Loop item field stubs so nested tags inside empty loops do not matter;
  // for non-empty overrides, callers can supply richer objects.
  return { ...base, ...overrides };
}
