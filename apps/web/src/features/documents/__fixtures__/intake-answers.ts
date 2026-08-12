/**
 * Shared FullIntake-shaped fixtures for intake → mapper → template fill tests.
 * Mirrors the Elena Vargas sample used in verify-generation.ts / Phase 4 E2E.
 */

import type { PartialIntake } from "../../intake/schemas/intake";

/** Married CA resident with minor children, community property, full decision-maker roles. */
export const marriedCaRichIntake: PartialIntake = {
  personal: {
    client: {
      firstName: "Elena",
      lastName: "Vargas",
      dateOfBirth: "1975-04-12",
      email: "elena@example.com",
      phone: "415-555-0100",
    },
    maritalStatus: "married",
    spouseOrPartner: {
      firstName: "Diego",
      lastName: "Vargas",
      dateOfBirth: "1974-09-01",
    },
    isCAResident: true,
    countyOfResidence: "San Francisco",
  },
  family: {
    children: [
      {
        id: "c1",
        firstName: "Sofia",
        lastName: "Vargas",
        dateOfBirth: "2015-03-12",
        relationship: "daughter",
        isMinor: true,
        guardianPreference: "Marco (uncle)",
      },
      {
        id: "c2",
        firstName: "Leo",
        lastName: "Vargas",
        dateOfBirth: "2018-06-01",
        relationship: "son",
        isMinor: true,
      },
    ],
    otherDependents: ["Mother-in-law Rosa"],
    pets: [{ name: "Mochi", careInstructions: "Stay with Sofia" }],
  },
  assets: [
    {
      id: "a1",
      type: "real_estate",
      description: "456 Maple Ave, San Francisco, CA 94102",
      estimatedValue: 1850000,
      ownership: "community",
      location: "San Francisco County, CA",
    },
    {
      id: "a2",
      type: "bank_account",
      description: "Chase Checking ****1234",
      ownership: "separate",
    },
    {
      id: "a3",
      type: "vehicle",
      description: "2020 Honda CR-V",
      ownership: "community",
    },
  ],
  liabilities: [
    {
      id: "l1",
      type: "mortgage",
      creditor: "First Republic",
      balance: 620000,
    },
  ],
  decisionMakers: [
    {
      id: "dm1",
      role: "executor",
      person: { firstName: "Elena", lastName: "Vargas" },
    },
    {
      id: "dm2",
      role: "successor_trustee",
      person: { firstName: "Isabella", lastName: "Vargas" },
    },
    {
      id: "dm3",
      role: "financial_poa",
      person: { firstName: "Isabella", lastName: "Vargas" },
    },
    {
      id: "dm4",
      role: "healthcare_agent",
      person: { firstName: "Marco", lastName: "Vargas" },
    },
    {
      id: "dm5",
      role: "guardian_minor",
      person: { firstName: "Marco", lastName: "Vargas" },
    },
  ],
  specificGifts: [
    {
      beneficiary: "Sofia Vargas",
      description: "Grandmother's piano",
      amount: undefined,
    },
  ],
  distribution: {
    residuary: [
      { name: "Sofia Vargas", relationship: "daughter", sharePercent: 50 },
      { name: "Leo Vargas", relationship: "son", sharePercent: 50 },
    ],
    contingentBeneficiaries: [
      { name: "Isabella Vargas", relationship: "sister", sharePercent: 100 },
    ],
    minorTrustProvisions: "Distribute at age 25",
    spendthrift: true,
  },
  charitable: {
    organizations: [
      {
        name: "SF Food Bank",
        ein: "94-1234567",
        amountOrPercent: "5%",
        purpose: "hunger relief",
      },
    ],
  },
  healthcare: {
    careInstructions: "Prefer comfort care",
    anatomicalGifts: true,
    polstNotes: "No life support if permanent vegetative state",
    primaryPhysician: "Dr. Chen",
  },
  priorPlanning: {
    existingDocuments: ["old will 2010"],
    beneficiaryDesignations: ["401k → Diego"],
    digitalAssets: "Password manager with Isabella",
  },
  meta: {
    version: 1,
    completedSections: ["personal", "family", "assets"],
    notesForAttorney: "Emphasize education funding for the children.",
  },
};

/** Single CA resident, no children, empty optional sections. */
export const singleNoChildrenIntake: PartialIntake = {
  personal: {
    client: {
      firstName: "Alex",
      lastName: "Nguyen",
      dateOfBirth: "1988-11-02",
      email: "alex@example.com",
    },
    maritalStatus: "single",
    isCAResident: true,
    countyOfResidence: "Alameda",
  },
  family: { children: [] },
  assets: [
    {
      id: "a1",
      type: "brokerage",
      description: "Vanguard brokerage",
      ownership: "separate",
      estimatedValue: 250000,
    },
  ],
  liabilities: [],
  decisionMakers: [
    {
      id: "dm1",
      role: "executor",
      person: { firstName: "Jordan", lastName: "Nguyen" },
    },
    {
      id: "dm2",
      role: "successor_trustee",
      person: { firstName: "Jordan", lastName: "Nguyen" },
    },
  ],
  specificGifts: [],
  distribution: {
    residuary: [
      { name: "Jordan Nguyen", relationship: "sibling", sharePercent: 100 },
    ],
  },
  charitable: { organizations: [] },
  healthcare: {},
  priorPlanning: {
    existingDocuments: [],
    beneficiaryDesignations: [],
    digitalAssets: "",
  },
  meta: { version: 1, completedSections: ["personal"], notesForAttorney: "" },
};

/** Non-CA partnered client with adult children only (no minors). */
export const partneredAdultChildrenNonCaIntake: PartialIntake = {
  personal: {
    client: {
      firstName: "Sam",
      lastName: "Okoro",
      dateOfBirth: "1960-01-15",
    },
    maritalStatus: "partnered",
    spouseOrPartner: { firstName: "Riley", lastName: "Okoro" },
    isCAResident: false,
    countyOfResidence: "Multnomah",
  },
  family: {
    children: [
      {
        id: "c1",
        firstName: "Pat",
        lastName: "Okoro",
        dateOfBirth: "1995-05-05",
        relationship: "child",
        isMinor: false,
      },
    ],
  },
  assets: [
    {
      id: "a1",
      type: "real_estate",
      description: "Portland home",
      ownership: "joint",
    },
  ],
  decisionMakers: [
    {
      id: "dm1",
      role: "healthcare_agent",
      person: { firstName: "Riley", lastName: "Okoro" },
    },
  ],
  distribution: {
    residuary: [
      { name: "Pat Okoro", relationship: "child", sharePercent: 100 },
    ],
  },
  meta: { version: 1, completedSections: [] },
};

/** Minimal answers missing client name — mapper must reject. */
export const missingClientNameIntake: PartialIntake = {
  personal: {
    client: { firstName: "", lastName: "" },
    maritalStatus: "single",
    isCAResident: true,
  },
};
