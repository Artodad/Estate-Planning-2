/**
 * Field `id=` values QuestionnaireWizard already renders.
 * Membership test only: after MAPPER_CONTRACT_KEYS / TAG_ALIASES + name transform,
 * accept the id if the wizard already has it. Not a mapper-key table.
 */
export const WIZARD_CONTROL_IDS = new Set<string>([
  "client.firstName",
  "client.lastName",
  "client.dateOfBirth",
  "client.email",
  "client.phone",
  "spouseOrPartner.firstName",
  "spouseOrPartner.lastName",
  "spouseOrPartner.dateOfBirth",
  "spouseOrPartner.email",
  "marriageCityState",
  "marriageDate",
  "countyOfResidence",
  "deemedSurvivorFullName",
  "citizenshipImmigrationNotes",
  "youngPersonRetentionAge",
  "outrightDistributionAge",
  "firstDistributionAge",
  "secondDistributionAge",
  "thirdDistributionAge",
  "educationalTrustEligibilityAge",
  "educationalTrustRemainderAge",
  "educationalTrustTerminationAge",
  "minorTrustProvisions",
  "primaryPhysician",
  "careInstructions",
]);
