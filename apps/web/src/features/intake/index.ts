/**
 * Intake Feature Public API
 *
 * Feature-sliced entrypoint (per AGENTS.md + development-workflow.mdc).
 * Consumers (dashboard integration E, conversational D, pages, tests) import from here.
 *
 * Wizard UI (C) exports the production-ready component + contracts for persistence layer.
 * Machine + schemas remain co-located but also re-exported for convenience.
 */

export { QuestionnaireWizard } from "./components/QuestionnaireWizard";
export type { QuestionnaireWizardProps } from "./components/QuestionnaireWizard";

// Re-export the deterministic core (machine is the single source of truth)
export {
  questionnaireMachine,
  getInitialContext,
  createAndStartActor,
  SECTIONS_CONFIG,
  guards,
  actions,
  type IntakeContext,
  type IntakeEvent,
  type IntakeInput,
  type QuestionnaireActor,
  type QuestionnaireSnapshot,
} from "./machine";

// Re-export Zod schemas + pure helpers (used by RHF, AI validation, mappers, tests)
export {
  FullIntakeSchema,
  PersonalInfoSchema,
  FamilySchema,
  SECTION_SCHEMAS,
  SECTION_ORDER,
  hasMinorChildren,
  isMarriedAndCA,
  hasSpouseOrPartner,
  sectionIsComplete,
  canProceedToNext,
  calculateProgress,
  type FullIntake,
  type PartialIntake,
} from "./schemas/intake";
