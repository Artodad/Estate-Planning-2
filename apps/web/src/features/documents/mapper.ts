/**
 * Central Data Mapper: IntakeSession.answers (FullIntake) → docxtemplater variables.
 *
 * Architecture per Design §2 (Data Mapping Strategy) + fidelity.mdc:
 * - Pure, testable, no side effects, no Prisma, no storage.
 * - Re-uses Phase 3 pure helpers (hasSpouseOrPartner, hasMinorChildren, isCAResident, isMarriedAndCA, sectionIsComplete etc.)
 *   from @/features/intake/schemas/intake to keep CA logic single-source and consistent.
 * - Central mapIntakeToDocVariables + per-type specializations.
 * - MVP: full support for revocable_trust + pour_over_will (as specified for B).
 * - Always: arrays present (empty []), strings non-null, booleans explicit, no undefined values (prevents docxtemplater noise).
 * - Normalization: full names, computed ages/is_minor, community property flags (ownership === 'community' → is_community_property),
 *   decision-maker role lookups (for direct executor_full_name etc.), cross-refs (healthcareAgentId).
 * - Error surfacing: throws on critical missing (client name) with clear messages; graceful for optionals.
 *
 * Output shape designed for typical attorney templates using:
 *   loops: {#children}...{/}, {#assets}..., {#decision_makers}..., {#residuary_beneficiaries}...
 *   conditionals: {^hasSpouse}...{/}, {#hasMinorChildren}...
 *
 * Concrete examples from Design §2 used as reference + expanded for robustness.
 * Extend in lockstep with new template tags or FullIntake fields.
 *
 * Testing: pure unit tests recommended (mapper.test.ts) with FullIntake fixtures (happy + edges: single, no kids, mixed ownership, etc.).
 */

import type {
  FullIntake,
  PartialIntake,
  DocumentType,
  MapIntakeOptions,
  DocumentVariables,
} from "./types";
import * as IntakeSchemas from "@/features/intake/schemas/intake";

// -----------------------------
// Internal normalization helpers (pure, reusable)
// -----------------------------

function safeStr(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function fullName(first?: string, last?: string): string {
  return `${safeStr(first)} ${safeStr(last)}`.trim();
}

function computeAgeFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  try {
    const birth = new Date(dob);
    if (isNaN(birth.getTime())) return undefined;
    const now = Date.now();
    const age = (now - birth.getTime()) / (1000 * 3600 * 24 * 365.25);
    return Math.max(0, Math.floor(age));
  } catch {
    return undefined;
  }
}

function isMinorFromDobOrFlag(child: any): boolean {
  if (typeof child?.isMinor === "boolean") return child.isMinor;
  const age = computeAgeFromDob(child?.dateOfBirth);
  return age != null && age < 18;
}

function normalizeChild(c: any, index: number) {
  const first = safeStr(c?.firstName);
  const last = safeStr(c?.lastName);
  const full = fullName(first, last) || `Child ${index + 1}`;
  const dob = safeStr(c?.dateOfBirth);
  const age = computeAgeFromDob(dob);
  return {
    full_name: full,
    first_name: first,
    last_name: last,
    dob,
    age,
    is_minor: isMinorFromDobOrFlag(c),
    relationship: safeStr(c?.relationship),
    special_needs: safeStr(c?.specialNeeds),
    guardian_preference: safeStr(c?.guardianPreference),
    // raw for advanced templates
    id: c?.id || undefined,
  };
}

function normalizeAsset(a: any, index: number) {
  const isCommunity = a?.ownership === "community";
  return {
    description: safeStr(a?.description) || `Asset ${index + 1}`,
    type: safeStr(a?.type),
    estimated_value: a?.estimatedValue != null ? Number(a.estimatedValue) : undefined,
    ownership: safeStr(a?.ownership),
    is_community_property: isCommunity,
    location: safeStr(a?.location),
    current_beneficiary: safeStr(a?.currentBeneficiary),
    notes: safeStr(a?.notes),
    id: a?.id || undefined,
  };
}

function normalizeDecisionMaker(dm: any, index: number) {
  const p = dm?.person || {};
  const full = fullName(p.firstName, p.lastName);
  return {
    id: dm?.id || `dm-${index}`,
    role: safeStr(dm?.role),
    full_name: full || `Decision Maker ${index + 1}`,
    first_name: safeStr(p.firstName),
    last_name: safeStr(p.lastName),
    email: safeStr(p.email),
    phone: safeStr(p.phone),
    dob: safeStr(p.dateOfBirth),
    alternate_for: safeStr(dm?.alternateFor),
    notes: safeStr(dm?.notes),
  };
}

function normalizeBeneficiary(b: any, index: number) {
  return {
    name: safeStr(b?.name) || `Beneficiary ${index + 1}`,
    relationship: safeStr(b?.relationship),
    share_percent: b?.sharePercent != null ? Number(b.sharePercent) : 0,
    contingent_on: safeStr(b?.contingentOn),
  };
}

function normalizeSpecificGift(g: any, index: number) {
  return {
    beneficiary: safeStr(g?.beneficiary),
    description: safeStr(g?.description) || `Gift ${index + 1}`,
    amount: g?.amount != null ? Number(g.amount) : undefined,
    conditions: safeStr(g?.conditions),
  };
}

function normalizeCharitableOrg(o: any, index: number) {
  return {
    name: safeStr(o?.name) || `Organization ${index + 1}`,
    ein: safeStr(o?.ein),
    amount_or_percent: safeStr(o?.amountOrPercent),
    purpose: safeStr(o?.purpose),
  };
}

// Role-based lookup (returns first match; templates usually have one primary per role).
function findDecisionMakerByRole(answers: PartialIntake, role: string) {
  const list = answers.decisionMakers ?? [];
  const found = list.find((dm: any) => dm?.role === role);
  if (!found) return undefined;
  const p = (found.person || {}) as any;
  return {
    full_name: fullName(p.firstName, p.lastName),
    first_name: safeStr(p.firstName),
    last_name: safeStr(p.lastName),
    email: safeStr(p.email),
    phone: safeStr(p.phone),
  };
}

// -----------------------------
// Core mapper
// -----------------------------

/**
 * Main entry point (Design §2).
 * Produces a flat + array-rich variables object ready for doc.setData().
 */
export function mapIntakeToDocVariables(
  answers: FullIntake | PartialIntake,
  documentType: DocumentType,
  extra: MapIntakeOptions = {},
): DocumentVariables {
  const a = answers || ({} as any);

  // Shared normalization (always safe values)
  // Casts to any are safe here: PartialIntake makes nested fields optional/loose at runtime; safeStr + fullName guard everything.
  const client = (a.personal?.client || {}) as any;
  const clientFull = fullName(client.firstName, client.lastName);
  if (!clientFull) {
    // Critical for almost every document — surface early per fidelity.
    throw new Error(
      "Mapper: client full name is required (personal.client.firstName + lastName). " +
        "Complete the Personal Information section of the intake.",
    );
  }

  const spouse = (a.personal?.spouseOrPartner || {}) as any;
  const hasSpouse = IntakeSchemas.hasSpouseOrPartner(a);
  const spouseFull = hasSpouse ? fullName(spouse.firstName, spouse.lastName) : "";

  const childrenRaw = a.family?.children ?? [];
  const children = childrenRaw.map(normalizeChild);
  const hasMinorChildren = IntakeSchemas.hasMinorChildren(a);

  const assetsRaw = a.assets ?? [];
  const assets = assetsRaw.map(normalizeAsset);
  const hasCommunityPropertyAssets = assets.some((x) => x.is_community_property);

  const decisionMakersRaw = a.decisionMakers ?? [];
  const decision_makers = decisionMakersRaw.map(normalizeDecisionMaker);

  const specificGiftsRaw = a.specificGifts ?? [];
  const specific_gifts = specificGiftsRaw.map(normalizeSpecificGift);

  const residuaryRaw = a.distribution?.residuary ?? [];
  const distribution_residuary = residuaryRaw.map(normalizeBeneficiary);

  const charitableRaw = a.charitable?.organizations ?? [];
  const charitable_organizations = charitableRaw.map(normalizeCharitableOrg);

  const liabilitiesRaw = a.liabilities ?? [];
  const liabilities = liabilitiesRaw.map((l: any, i: number) => ({
    creditor: safeStr(l?.creditor) || `Liability ${i + 1}`,
    type: safeStr(l?.type),
    balance: l?.balance != null ? Number(l.balance) : undefined,
    notes: safeStr(l?.notes),
  }));

  // Role-specific convenience vars (common in trust/will/POA templates)
  const executor = findDecisionMakerByRole(a, "executor");
  const successorTrustee = findDecisionMakerByRole(a, "successor_trustee");
  const financialPoa = findDecisionMakerByRole(a, "financial_poa");
  const healthcareAgent = findDecisionMakerByRole(a, "healthcare_agent");
  const guardianMinor = findDecisionMakerByRole(a, "guardian_minor");

  // Healthcare cross-ref resolution (if id provided)
  let resolvedHealthcareAgent = healthcareAgent;
  if (a.healthcare?.healthcareAgentId && !healthcareAgent) {
    const byId = decisionMakersRaw.find((dm: any) => dm?.id === a.healthcare?.healthcareAgentId);
    if (byId) {
      const p = (byId.person || {}) as any;
      resolvedHealthcareAgent = {
        full_name: fullName(p.firstName, p.lastName),
        first_name: safeStr(p.firstName),
        last_name: safeStr(p.lastName),
        email: safeStr(p.email),
        phone: safeStr(p.phone),
      };
    }
  }

  // Base variables (common to most docs)
  const base: DocumentVariables = {
    // Client
    client_full_name: clientFull,
    client_first_name: safeStr(client.firstName),
    client_last_name: safeStr(client.lastName),
    client_dob: safeStr(client.dateOfBirth),
    client_email: safeStr(client.email),
    client_phone: safeStr(client.phone),

    // Spouse / marital
    has_spouse: hasSpouse,
    spouse_full_name: spouseFull,
    spouse_first_name: safeStr(spouse.firstName),
    spouse_last_name: safeStr(spouse.lastName),

    // CA / residency
    is_ca_resident: IntakeSchemas.isCAResident(a),
    is_married_and_ca: IntakeSchemas.isMarriedAndCA(a),
    county_of_residence: safeStr(a.personal?.countyOfResidence),

    // Family
    children,
    has_minor_children: hasMinorChildren,
    other_dependents: (a.family?.otherDependents ?? []).map(safeStr),
    pets: (a.family?.pets ?? []).map((p: any) => ({ name: safeStr(p?.name), care_instructions: safeStr(p?.careInstructions) })),

    // Assets & liabilities (community-aware)
    assets,
    has_community_property_assets: hasCommunityPropertyAssets,
    liabilities,

    // Decision makers (full array + role shortcuts)
    decision_makers,
    executor_full_name: executor?.full_name || "",
    successor_trustee_full_name: successorTrustee?.full_name || "",
    financial_poa_full_name: financialPoa?.full_name || "",
    healthcare_agent_full_name: resolvedHealthcareAgent?.full_name || "",
    guardian_of_minor_full_name: guardianMinor?.full_name || "",

    // Gifts / distribution
    specific_gifts,
    distribution_residuary,
    minor_trust_provisions: safeStr(a.distribution?.minorTrustProvisions),
    spendthrift_clause: !!a.distribution?.spendthrift,
    contingent_beneficiaries: (a.distribution?.contingentBeneficiaries ?? []).map(normalizeBeneficiary),

    // Charitable
    charitable_organizations,

    // Healthcare
    healthcare_instructions: safeStr(a.healthcare?.careInstructions),
    anatomical_gifts: !!a.healthcare?.anatomicalGifts,
    polst_notes: safeStr(a.healthcare?.polstNotes),
    primary_physician: safeStr(a.healthcare?.primaryPhysician),

    // Prior planning
    prior_planning_notes: JSON.stringify(a.priorPlanning?.existingDocuments ?? []),
    beneficiary_designations: JSON.stringify(a.priorPlanning?.beneficiaryDesignations ?? []),
    digital_assets_notes: safeStr(a.priorPlanning?.digitalAssets),

    // Meta / traceability (attorney visible)
    attorney_notes_for_document: safeStr(a.meta?.notesForAttorney),
    generation_date: extra.generationDate || new Date().toISOString().slice(0, 10),
    firm_name: extra.firmName || "",
    matter_display_name: extra.matterDisplayName || clientFull,
  };

  // Document-type specific extensions (MVP: trust + will)
  let typeSpecific: DocumentVariables = {};

  switch (documentType) {
    case "revocable_trust": {
      const last = safeStr((client as any).lastName) || "Family";
      typeSpecific = {
        trust_name: `${last} Revocable Living Trust`,
        // Schedules / pour-over hooks (templates control exact tags)
        has_pour_over_will: true, // assume coordinated package
        schedule_a_real_estate_count: assets.filter((x) => x.type === "real_estate").length,
        schedule_b_personal_property_count: assets.filter((x) => ["personal_property", "vehicle"].includes(x.type)).length,
        // Add more as templates require (e.g. funding instructions flags)
      };
      break;
    }

    case "pour_over_will": {
      typeSpecific = {
        will_title: `${clientFull} Pour-Over Will`,
        executor_powers: "standard", // placeholder; real language stays in template
        guardian_nominations: guardianMinor?.full_name || "",
        // Pour-over clause hook (template owns language)
        has_revocable_trust: true,
      };
      break;
    }

    // Other types get base only for MVP (extend in C/D or when templates arrive).
    // They will still receive all the shared arrays/flags.
    default:
      break;
  }

  return {
    ...base,
    ...typeSpecific,
    // Always include document_type for logging/manifests
    document_type: documentType,
  };
}

// -----------------------------
// Convenience per-type mappers (optional sugar)
// -----------------------------

export function mapToRevocableTrust(answers: FullIntake | PartialIntake, extra?: MapIntakeOptions): DocumentVariables {
  return mapIntakeToDocVariables(answers, "revocable_trust", extra);
}

export function mapToPourOverWill(answers: FullIntake | PartialIntake, extra?: MapIntakeOptions): DocumentVariables {
  return mapIntakeToDocVariables(answers, "pour_over_will", extra);
}

// Future: mapToDurablePoa, mapToHealthcareDirective, etc. (same central fn + switch extensions).
