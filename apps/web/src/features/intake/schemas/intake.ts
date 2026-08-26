import { z } from 'zod';

/**
 * Zod schemas for the Estate Planning Intake (MVP).
 *
 * Co-located with XState machine per feature-sliced architecture (AGENTS.md, Phase 3 Design).
 * These are the single source of truth for:
 * - Wizard form validation (react-hook-form + resolver)
 * - XState guards (sectionIsComplete, canProceed)
 * - Conversational AI output validation (future)
 * - Persistence shape (IntakeSession.answers JSONB)
 * - Phase 4 document mapper
 *
 * California-aware: community property, minor children/guardianship, residency.
 * PII minimized (no full SSN, DOB strings only).
 *
 * Follows exact outlines from Sub-agent A Design §2 + official Phase 3 vision.
 * Extensible: add fields, then update machine guards + doc templates in lockstep.
 */

// --- Base primitives (reusable) ---
export const PersonSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional()
    .describe('ISO date string (yyyy-mm-dd). Used for age/minor calculations and document generation.'),
  email: z.string().email('Invalid email').optional(),
  phone: z.string().optional(),
  // PII: deliberately no full SSN / government ID in MVP
});

export const AddressSchema = z
  .object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().length(2, 'Use 2-letter state code').optional(),
    zip: z.string().optional(),
  })
  .partial();

export const ChildSchema = z.object({
  id: z.string().uuid().optional().describe('Stable key for React lists / references'),
  ...PersonSchema.shape,
  relationship: z.string().optional().describe('e.g. "son", "daughter", "stepchild"'),
  isMinor: z.boolean().optional().describe('Explicit flag; derived from DOB if absent'),
  specialNeeds: z.string().optional(),
  guardianPreference: z.string().optional().describe('Notes or named preference (data only)'),
});

export const PetSchema = z.object({
  name: z.string().min(1),
  careInstructions: z.string().optional(),
});

export const AssetSchema = z.object({
  id: z.string().optional(),
  type: z.enum([
    'real_estate',
    'bank_account',
    'brokerage',
    'retirement',
    'business_interest',
    'personal_property',
    'vehicle',
    'other',
  ]),
  description: z.string().min(1, 'Description required'),
  // Very tolerant during wizard editing — empty/invalid numbers are common while typing.
  // Real coercion + validation happens in onFormAdvance + machine saveAnswer + final document mapping.
  estimatedValue: z.union([
    z.coerce.number().nonnegative(),
    z.string().transform((v) => (v === '' ? undefined : Number(v))).pipe(z.number().nonnegative().optional()),
    z.null(),
    z.undefined(),
  ]).optional(),
  ownership: z.enum(['separate', 'community', 'joint', 'tenant_in_common', 'other']).describe('Critical for CA community property characterization'),
  location: z.string().optional().describe('Especially important for CA real property (situs)'),
  currentBeneficiary: z.string().optional(),
  notes: z.string().optional(),
});

export const LiabilitySchema = z.object({
  id: z.string().optional(),
  type: z.enum(['mortgage', 'auto_loan', 'credit_card', 'personal_loan', 'other']),
  creditor: z.string().min(1),
  // Tolerant during editing (same reason as AssetSchema)
  balance: z.union([
    z.coerce.number().nonnegative(),
    z.string().transform((v) => (v === '' ? undefined : Number(v))).pipe(z.number().nonnegative().optional()),
    z.null(),
    z.undefined(),
  ]).optional(),
  securedByAssetId: z.string().optional().describe('Reference to asset id if collateralized'),
  notes: z.string().optional(),
});

export const DecisionMakerSchema = z.object({
  id: z.string().optional(),
  role: z.enum([
    'executor',
    'successor_trustee',
    'financial_poa',
    'healthcare_agent',
    'guardian_minor',
    'alternate',
  ]),
  person: PersonSchema,
  alternateFor: z.string().optional(),
  notes: z.string().optional().describe('Acceptance, contact, or special instructions (data only)'),
});

export const SpecificGiftSchema = z.object({
  id: z.string().optional(),
  beneficiary: z.string().min(1),
  description: z.string().min(1, 'Item or cash bequest description'),
  // Tolerant during wizard editing — empty optional amount is common (same pattern as AssetSchema).
  amount: z.union([
    z.coerce.number().nonnegative(),
    z.string().transform((v) => (v === '' ? undefined : Number(v))).pipe(z.number().nonnegative().optional()),
    z.null(),
    z.undefined(),
  ]).optional(),
  conditions: z.string().optional(),
});

export const BeneficiaryShareSchema = z.object({
  name: z.string().min(1),
  relationship: z.string().optional(),
  sharePercent: z.number().min(0).max(100),
  contingentOn: z.string().optional(),
});

/** Optional age blanks as attorney-facing text (e.g. "25"); template owns legal wording. */
const OptionalAgeText = z.string().max(32, 'Keep age short (e.g. 25)').optional();

export const DistributionSchema = z.object({
  residuary: z.array(BeneficiaryShareSchema).default([]),
  contingentBeneficiaries: z.array(BeneficiaryShareSchema).optional(),
  minorTrustProvisions: z.string().optional().describe('Data notes only — e.g. "age 25 distribution, trustee discretion"'),
  spendthrift: z.boolean().optional(),
  /** Young Persons “under the age of …” retention threshold. */
  youngPersonRetentionAge: OptionalAgeText,
  /** Staggered principal ladder ages (first / second / third). */
  firstDistributionAge: OptionalAgeText,
  secondDistributionAge: OptionalAgeText,
  thirdDistributionAge: OptionalAgeText,
  /** Single-age outright principal alternative (“attains the age of …”). */
  outrightDistributionAge: OptionalAgeText,
  /** Educational Trust: child under this age at surviving settlor’s death. */
  educationalTrustEligibilityAge: OptionalAgeText,
  /** Educational Trust: age when remainder is distributed (“has attained”). */
  educationalTrustRemainderAge: OptionalAgeText,
  /** Educational Trust: hold-until / turns age. */
  educationalTrustTerminationAge: OptionalAgeText,
});

export const CharitableIntentSchema = z.object({
  organizations: z
    .array(
      z.object({
        name: z.string().min(1),
        ein: z.string().optional(),
        amountOrPercent: z.string().optional(),
        purpose: z.string().optional(),
      }),
    )
    .default([]),
});

export const HealthcareSchema = z.object({
  healthcareAgentId: z.string().optional().describe('Cross-ref to decisionMakers'),
  primaryPhysician: z.string().optional(),
  careInstructions: z.string().optional().describe('AHCD Part 2 instructions'),
  anatomicalGifts: z.boolean().optional(),
  polstNotes: z.string().optional().describe('Readiness / preferences (not the POLST form)'),
});

export const PriorPlanningSchema = z.object({
  existingDocuments: z
    .array(
      z.object({
        type: z.string(),
        date: z.string().optional(),
        attorneyOrFirm: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  beneficiaryDesignations: z
    .array(
      z.object({
        accountOrAsset: z.string(),
        beneficiary: z.string(),
        type: z.string().optional(), // TOD/POD etc
      }),
    )
    .default([]),
  digitalAssets: z.string().optional(),
});

export const MetaSchema = z.object({
  version: z.literal(1),
  completedSections: z.array(z.string()).default([]),
  lastSavedAt: z.string().optional(),
  notesForAttorney: z.string().optional(),
});

// --- Section schemas ---
export const PersonalInfoSchema = z.object({
  client: PersonSchema,
  spouseOrPartner: PersonSchema.optional(),
  maritalStatus: z.enum(['single', 'married', 'partnered', 'divorced', 'widowed']),
  isCAResident: z.boolean().default(true),
  countyOfResidence: z.string().optional(),
  /** Free-text venue for trust marriage recital blanks, e.g. "San Diego, California". */
  marriageCityState: z.string().optional(),
  /** Marriage date as attorney-facing text (ISO or written form); template owns formatting. */
  marriageDate: z.string().optional(),
  /**
   * Simultaneous-death named survivor (trust “deemed survivor” blank).
   * Dedicated free-text — do not assume spouse or client.
   */
  deemedSurvivorFullName: z.string().optional(),
  citizenshipImmigrationNotes: z.string().optional().describe('Minimized PII; attorney notes only'),
});

export const FamilySchema = z.object({
  children: z.array(ChildSchema).default([]),
  otherDependents: z.array(z.string()).optional(),
  pets: z.array(PetSchema).optional(),
});

// --- Full intake (the shape stored in IntakeSession.answers) ---
export const FullIntakeSchema = z
  .object({
    personal: PersonalInfoSchema,
    family: FamilySchema,
    assets: z.array(AssetSchema).default([]),
    liabilities: z.array(LiabilitySchema).default([]),
    decisionMakers: z.array(DecisionMakerSchema).default([]),
    specificGifts: z.array(SpecificGiftSchema).default([]),
    distribution: DistributionSchema,
    charitable: CharitableIntentSchema,
    healthcare: HealthcareSchema,
    priorPlanning: PriorPlanningSchema,
    meta: MetaSchema.optional(),
  })
  .refine(
    (data) => {
      // Example cross-field CA rule (soft for MVP; strengthens in later phases)
      if (data.personal.isCAResident && (data.personal.maritalStatus === 'married' || data.personal.maritalStatus === 'partnered')) {
        // Assets should have ownership characterized (encouraged, not hard fail in intake)
        // In production mapper this becomes critical.
      }
      return true;
    },
    { message: 'CA community property characterization recommended for married/partnered CA residents' },
  );

// --- Per-section map for guards, forms, AI validation ---
export const SECTION_SCHEMAS = {
  personal: PersonalInfoSchema,
  family: FamilySchema,
  assets: z.array(AssetSchema),
  liabilities: z.array(LiabilitySchema),
  decisionMakers: z.array(DecisionMakerSchema),
  gifts: z.array(SpecificGiftSchema), // alias for specificGifts in answers
  distribution: DistributionSchema,
  charitable: CharitableIntentSchema,
  healthcare: HealthcareSchema,
  priorPlanning: PriorPlanningSchema,
} as const;

export const SECTION_ORDER = [
  'personal',
  'family',
  'assets',
  'liabilities',
  'decisionMakers',
  'gifts',
  'distribution',
  'charitable',
  'healthcare',
  'priorPlanning',
  'review',
] as const;

export type SectionKey = (typeof SECTION_ORDER)[number];

/**
 * Trust-visible walk. Single source of truth for live SectionKeys.
 * Quarantined keys stay on SECTION_ORDER + SECTION_SCHEMAS + FullIntake
 * (empty-default completeness for generate). Do not use hasMinorChildren /
 * isMarriedAndCA / hasSpouse as section gates.
 */
export const TRUST_VISIBLE_SECTION_KEYS = [
  'personal',
  'family',
  'decisionMakers',
  'distribution',
  'review',
] as const satisfies readonly SectionKey[];

export function isTrustVisibleSection(section: string): section is SectionKey {
  return (TRUST_VISIBLE_SECTION_KEYS as readonly string[]).includes(section);
}

export type FullIntake = z.infer<typeof FullIntakeSchema>;
export type PartialIntake = Partial<FullIntake>;

// --- Pure guard / helper fns (exported for machine + UI + tests; no side effects) ---
export function hasSpouseOrPartner(answers: PartialIntake): boolean {
  const status = answers.personal?.maritalStatus;
  return status === 'married' || status === 'partnered';
}

export function isCAResident(answers: PartialIntake): boolean {
  return answers.personal?.isCAResident ?? true;
}

export function isMarriedAndCA(answers: PartialIntake): boolean {
  return hasSpouseOrPartner(answers) && isCAResident(answers);
}

export function hasMinorChildren(answers: PartialIntake): boolean {
  const children = answers.family?.children ?? [];
  return children.some((child) => {
    if (typeof child.isMinor === 'boolean') return child.isMinor;
    if (child.dateOfBirth) {
      try {
        const birth = new Date(child.dateOfBirth);
        const now = Date.now();
        const ageYears = (now - birth.getTime()) / (1000 * 3600 * 24 * 365.25);
        return ageYears < 18 && ageYears > 0;
      } catch {
        return false;
      }
    }
    return false;
  });
}

export function sectionIsComplete(section: string, answers: PartialIntake): boolean {
  const schema = (SECTION_SCHEMAS as any)[section];
  if (!schema) {
    // review / meta sections
    return true;
  }
  const value = (answers as any)[section === 'gifts' ? 'specificGifts' : section];
  if (value === undefined || value === null) {
    // arrays default empty = "started" but for required personal/family treat missing as incomplete
    if (section === 'personal' || section === 'family' || section === 'distribution') return false;
    return Array.isArray(value) ? true : false; // presence of array key is enough for optional lists
  }
  const result = schema.safeParse(value);

  // Temporary debug - only warn ONCE when we see the exact wrapper-object corruption for assets
  if (!result.success && section === 'assets') {
    const looksLikeWrapper = value && typeof value === 'object' && !Array.isArray(value) &&
      (('children' in value) || ('pets' in value) || ('assets' in value));
    if (looksLikeWrapper && !(window as any).__assetsCorruptionWarnedOnce) {
      (window as any).__assetsCorruptionWarnedOnce = true;
      console.warn(`[DEBUG] Assets data is still corrupted (object with section keys instead of array). Submitting Family should trigger repair now.`);
    }
  }

  return result.success;
}

export function canProceedToNext(currentSection: string, answers: PartialIntake, visited: string[]): boolean {
  const currentOk = sectionIsComplete(currentSection, answers);
  if (!currentOk) return false;

  const applicable = getApplicableSections(answers);
  const idx = applicable.indexOf(currentSection as SectionKey);
  // Quarantined current (punch landing): current completeness is enough.
  if (idx === -1) return true;
  if (idx <= 0) return true;

  for (let i = 0; i < idx; i++) {
    const prior = applicable[i];
    if (prior === 'review') continue;
    if (!sectionIsComplete(prior, answers)) return false;
  }
  return true;
}

// --- Progress calculation (pure, branch-aware, used by machine action) ---
// Weights chosen for realistic attorney workflow emphasis on personal/family/decision makers.
const SECTION_WEIGHTS: Record<string, number> = {
  personal: 15,
  family: 15,
  assets: 12,
  liabilities: 5,
  decisionMakers: 15,
  gifts: 5,
  distribution: 12,
  charitable: 5,
  healthcare: 10,
  priorPlanning: 6,
};

export function calculateProgress(answers: PartialIntake, visitedSections: string[] = []): number {
  let totalWeight = 0;
  let achieved = 0;

  const applicable = getApplicableSections(answers).filter((s) => s !== 'review');

  for (const sec of applicable) {
    const weight = SECTION_WEIGHTS[sec] ?? 5;
    totalWeight += weight;

    // Branch awareness example: if no minors, de-emphasize (but still allow) guardian parts
    // For MVP we keep simple: full weight if complete per schema
    if (sectionIsComplete(sec, answers)) {
      achieved += weight;
    } else if (visitedSections.includes(sec)) {
      // Partial credit for visited but incomplete (encourages progress)
      achieved += Math.round(weight * 0.3);
    }
  }

  if (totalWeight === 0) return 0;
  const pct = Math.round((achieved / totalWeight) * 100);
  return Math.min(100, Math.max(0, pct));
}

export function getApplicableSections(_answers?: PartialIntake): readonly SectionKey[] {
  return TRUST_VISIBLE_SECTION_KEYS;
}
