/**
 * Types for the Document Generation Engine (Phase 4, Sub-agent B).
 *
 * Single source for variable contracts, DocumentType enum, options, results.
 * Matches Design §2/3 exactly + fidelity.mdc constraints.
 * Used by mapper, generator, future package + actions (C).
 *
 * NO docx generation logic here — pure types only.
 */

import type { FullIntake, PartialIntake } from "@/features/intake/schemas/intake";

// The 8 canonical document types from schema.prisma + fidelity rule (packages must include all).
export type DocumentType =
  | "revocable_trust"
  | "pour_over_will"
  | "durable_poa"
  | "healthcare_directive"
  | "hipaa"
  | "certificate_of_trust"
  | "personal_property_memo"
  | "trust_funding";

// Flexible variable bag for docxtemplater.
// Attorney templates dictate exact keys (loops like {#children}, conditionals like {^hasSpouse}).
// Mapper produces this shape (snake_case common in legal templates).
export type DocumentVariables = Record<string, unknown>;

// Input for generation (from Design §3 generateDocument).
export interface GenerateDocumentParams {
  templateFileKey: string; // From Template.fileKey (firm-scoped by caller)
  variables: DocumentVariables; // From mapper (FullIntake -> normalized vars)
  firmId: string; // Non-negotiable multi-tenancy (from auth context)
  options?: {
    addDraftWatermark?: boolean; // default: true (fidelity rule)
    documentType?: DocumentType;
    clientLastName?: string;
    clientFirstName?: string;
    firmSlug?: string; // for key namespacing (e.g. from currentFirm.slug)
  };
}

/** Tag-name-only snapshot of what filled vs what did not (no PII values). */
export interface DocumentFillReport {
  filledScalars: string[];
  emptyOptionals: string[];
  leftoverBraces: string[];
  loopCounts: Record<string, number>;
}

// Result (buffer kept in memory for ZIP assembly in D without re-fetch).
export interface GenerateDocumentResult {
  fileKey: string; // Computed per fidelity naming: {Last}-{First}-{Type}-DRAFT-{YYYY-MM-DD}.docx (namespaced)
  buffer: Buffer;
  documentType?: DocumentType;
  fillReport: DocumentFillReport;
}

// For mapper (Design §2).
export interface MapIntakeOptions {
  firmName?: string;
  generationDate?: string; // ISO date or YYYY-MM-DD
  matterDisplayName?: string;
}

// Re-export for convenience in consumers.
export type { FullIntake, PartialIntake } from "@/features/intake/schemas/intake";
