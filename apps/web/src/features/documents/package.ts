/**
 * Thin Coordinated Full Estate Plan Package Generator (Phase 4 D slice).
 *
 * Re-uses the exact existing single-document engine 100%:
 *   - mapIntakeToDocVariables (Phase 3 helpers for CA/minors/community property, etc.)
 *   - generateDocument (docxtemplater + PizZip + post-render DRAFT watermark on EVERY doc)
 *   - storage upload for both individual docs and the final ZIP
 *
 * Fidelity guarantees (AGENTS.md + document-fidelity.mdc):
 *   - ZERO changes to attorney template language/formatting.
 *   - Visible "DRAFT – For Attorney Review Only" on every single page of every document inside the package.
 *   - No new legal text ever generated.
 *
 * Multi-tenancy: firmId passed through on every call. All storage keys are opaque.
 *
 * No new dependencies. Uses the already-present "pizzip" for ZIP assembly (same lib used for template reading).
 */

import PizZip from "pizzip";

import { generateDocument } from "./generator";
import { mapIntakeToDocVariables } from "./mapper";
import type {
  DocumentType,
  FullIntake,
  PartialIntake,
  MapIntakeOptions,
} from "./types";
import { uploadGenerated } from "./storage";
import { DocumentGenerationError } from "./errors";

// Canonical order for a complete estate plan package (standard attorney workflow).
export const FULL_PLAN_DOCUMENT_ORDER: DocumentType[] = [
  "revocable_trust",
  "pour_over_will",
  "durable_poa",
  "healthcare_directive",
  "hipaa",
  "certificate_of_trust",
  "personal_property_memo",
  "trust_funding",
];

export interface PackageTemplateRef {
  templateFileKey: string;
  templateId?: string | null;
}

export interface GenerateFullPlanPackageParams {
  answers: FullIntake | PartialIntake;
  firmId: string;

  /**
   * Templates to generate for this package.
   * Now supports partial sets (e.g. only the templates the firm has uploaded so far).
   * Only the provided document types will be generated.
   */
  templates: Partial<Record<DocumentType, PackageTemplateRef>>;

  // Client info for file naming + mapper extras (same shape the single-doc path uses)
  clientLastName: string;
  clientFirstName?: string;
  firmName?: string;
  generationDate?: string; // YYYY-MM-DD
  matterDisplayName?: string;
}

export interface PackageManifestEntry {
  documentType: DocumentType;
  individualFileKey: string; // The DRAFT .docx that was uploaded for this doc
  templateFileKeyUsed: string;
}

export interface GenerateFullPlanPackageResult {
  packageFileKey: string; // The final .zip
  buffer: Buffer; // In-memory ZIP (caller can offer immediate download)
  manifest: PackageManifestEntry[];
  documentCount: number;
}

/**
 * Generate the complete 8-document estate plan package as a single ZIP.
 *
 * Every inner document is produced by the exact same fidelity path as a standalone generation.
 * The outer ZIP is just a convenience container with human-friendly names.
 */
export async function generateFullPlanPackage(
  params: GenerateFullPlanPackageParams
): Promise<GenerateFullPlanPackageResult> {
  const {
    answers,
    firmId,
    templates,
    clientLastName,
    clientFirstName = "X",
    firmName,
    generationDate,
    matterDisplayName,
  } = params;

  if (!firmId) {
    throw new DocumentGenerationError("firmId is required for full plan package generation");
  }

  // Build the list of document types we actually have templates for.
  // This now supports partial uploads (e.g. only revocable_trust uploaded so far).
  const requestedDocTypes = (Object.keys(templates) as DocumentType[]).filter(
    (dt) => FULL_PLAN_DOCUMENT_ORDER.includes(dt) && templates[dt]?.templateFileKey
  );

  if (requestedDocTypes.length === 0) {
    throw new DocumentGenerationError(
      "No usable templates were provided to generateFullPlanPackage"
    );
  }

  const manifest: PackageManifestEntry[] = [];
  const outerZip = new PizZip();

  const extra: MapIntakeOptions = {
    firmName,
    generationDate: generationDate || new Date().toISOString().slice(0, 10),
    matterDisplayName: matterDisplayName || "",
  };

  for (const docType of requestedDocTypes) {
    const tpl = templates[docType]!; // we already filtered for presence above

    // Map answers → variables using the exact same pure mapper as single-doc generation
    const variables = mapIntakeToDocVariables(answers, docType, extra);

    // Generate using the exact production engine (includes DRAFT watermark on every page)
    const generated = await generateDocument({
      templateFileKey: tpl.templateFileKey,
      variables,
      firmId,
      options: {
        addDraftWatermark: true,
        documentType: docType,
        clientLastName,
        clientFirstName,
      },
    });

    // Friendly name inside the ZIP
    const friendly = friendlyNameForType(docType);
    const zipEntryName = `${(FULL_PLAN_DOCUMENT_ORDER.indexOf(docType) + 1)
      .toString()
      .padStart(2, "0")} - ${friendly} - DRAFT.docx`;

    outerZip.file(zipEntryName, generated.buffer);

    manifest.push({
      documentType: docType,
      individualFileKey: generated.fileKey,
      templateFileKeyUsed: tpl.templateFileKey,
    });
  }

  // Assemble the final package ZIP
  const packageBuffer = outerZip.generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  // Canonical package fileKey (parallel to individual DRAFT naming)
  const today = new Date().toISOString().slice(0, 10);
  const safeLast = (clientLastName || "Client").replace(/[^A-Za-z0-9-]/g, "").slice(0, 40) || "Client";
  const packageFileKey = `generated/${today}/${safeLast}-Full-Estate-Plan-Package-DRAFT-${today}.zip`;

  // Upload the container (same storage abstraction used for every individual doc)
  await uploadGenerated(packageBuffer, packageFileKey, "application/zip");

  return {
    packageFileKey,
    buffer: packageBuffer,
    manifest,
    documentCount: manifest.length,
  };
}

function friendlyNameForType(t: DocumentType): string {
  const map: Record<DocumentType, string> = {
    revocable_trust: "Revocable Living Trust",
    pour_over_will: "Pour-Over Will",
    durable_poa: "Durable Power of Attorney (Financial)",
    healthcare_directive: "Advance Healthcare Directive",
    hipaa: "HIPAA Authorization",
    certificate_of_trust: "Certificate of Trust",
    personal_property_memo: "Personal Property Memorandum",
    trust_funding: "Trust Funding Instructions",
  };
  return map[t] || t;
}

export { FULL_PLAN_DOCUMENT_ORDER as FULL_PLAN_ORDER };
