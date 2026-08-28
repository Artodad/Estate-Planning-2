/**
 * Template upload Server Action core (testable without Clerk / Next runtime).
 *
 * `uploadTemplateForCurrentFirm` in actions.ts is a thin "use server" wrapper that
 * wires real checkOwnerOrStaff / Prisma / audit / revalidatePath into this impl.
 *
 * Keeps normalize-on-upload + skipNormalize policy identical to the dashboard path.
 */

import type { AuthContext, FirmRole } from "@/features/auth/types";
import type { DocumentType } from "@/features/documents/types";
import {
  uploadTemplate,
  computeTemplateFileKey,
  computeOriginalTemplateFileKey,
} from "@/features/documents/storage";
import { prepareTemplateUpload } from "@/features/documents/template-normalize/prepare-template-upload";
import type { TemplateUploadNormalizeSummary } from "@/features/documents/template-normalize/types";
import { FULL_PLAN_DOCUMENT_ORDER } from "@/features/documents/package";

export type OwnerStaffCheckResult =
  | { ok: true; context: AuthContext; role: FirmRole }
  | {
      ok: false;
      error: string;
      role: FirmRole | null;
      context: AuthContext | null;
    };

export type TemplateUploadActionResult =
  | {
      success: true;
      template: {
        id: string;
        firmId: string;
        name: string;
        fileKey: string;
        documentType: string;
        description?: string | null;
        [key: string]: unknown;
      };
      normalizeReport: TemplateUploadNormalizeSummary;
      /** Present when normalize ran and a `*.original.docx` side file was written. */
      originalFileKey?: string;
    }
  | {
      /** Soft suggestions present — review/accept before persist. */
      needsConfirmation: true;
      normalizeReport: TemplateUploadNormalizeSummary;
    }
  | {
      error: string;
      details?: unknown;
      normalizeReport?: TemplateUploadNormalizeSummary;
    };

export type UploadTemplateActionDeps = {
  checkOwnerOrStaff: () => Promise<OwnerStaffCheckResult>;
  createForFirm: (
    firmId: string,
    data: {
      name: string;
      fileKey: string;
      documentType: string;
      description?: string;
      normalizeReport?: TemplateUploadNormalizeSummary;
    },
  ) => Promise<{
    id: string;
    firmId: string;
    name: string;
    fileKey: string;
    documentType: string;
    description?: string | null;
    normalizeReport?: unknown;
    [key: string]: unknown;
  }>;
  logAuditEvent: (event: {
    firmId: string;
    actorClerkId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
  }) => void;
  revalidatePath: (path: string) => void;
  /** Optional overrides (tests use real defaults from storage). */
  uploadTemplate?: typeof uploadTemplate;
  computeTemplateFileKey?: typeof computeTemplateFileKey;
  computeOriginalTemplateFileKey?: typeof computeOriginalTemplateFileKey;
};

/**
 * Execute owner/staff template upload with injected auth + persistence deps.
 */
export async function executeUploadTemplateForCurrentFirm(
  formData: FormData,
  deps: UploadTemplateActionDeps,
): Promise<TemplateUploadActionResult> {
  const check = await deps.checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const firmId = ctx.currentFirm?.id;
  const firmSlug = ctx.currentFirm?.slug ?? undefined;
  if (!firmId) {
    return { error: "Active firm context required. Complete firm setup first." };
  }

  const persist = deps.uploadTemplate ?? uploadTemplate;
  const keyFn = deps.computeTemplateFileKey ?? computeTemplateFileKey;
  const originalKeyFn =
    deps.computeOriginalTemplateFileKey ?? computeOriginalTemplateFileKey;

  try {
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { error: "A .docx template file is required." };
    }
    if (file.size === 0) {
      return { error: "The uploaded file is empty." };
    }
    if (file.size > 8 * 1024 * 1024) {
      return { error: "Template files must be under 8MB." };
    }
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".docx")) {
      return { error: "Only .docx files are supported for templates." };
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const name = (formData.get("name") as string | null)?.trim() || "";
    const description =
      (formData.get("description") as string | null)?.trim() || undefined;
    const documentType = (formData.get("documentType") as string | null) as
      | DocumentType
      | null;
    const skipNormalizeRaw = formData.get("skipNormalize");
    const skipNormalize =
      skipNormalizeRaw === "on" ||
      skipNormalizeRaw === "true" ||
      skipNormalizeRaw === "1";
    const confirmSoftRaw = formData.get("confirmSoftSuggestions");
    const confirmSoftSuggestions =
      confirmSoftRaw === "on" ||
      confirmSoftRaw === "true" ||
      confirmSoftRaw === "1";
    const acceptedSuggestionIds = formData
      .getAll("acceptedSuggestionIds")
      .filter((v): v is string => typeof v === "string" && v.length > 0);

    if (!name) {
      return { error: "Template name is required." };
    }
    if (!documentType || !FULL_PLAN_DOCUMENT_ORDER.includes(documentType)) {
      return {
        error:
          "A valid document type is required (one of the 8 estate plan documents).",
      };
    }

    // Preview pass (no accepted ids) surfaces soft suggestions; confirm pass applies them.
    const prepared = prepareTemplateUpload(buffer, {
      skipNormalize,
      acceptedSuggestionIds: confirmSoftSuggestions ? acceptedSuggestionIds : [],
    });
    if (!prepared.ok) {
      return {
        error: prepared.error,
        normalizeReport: prepared.summary,
        details: "NORMALIZE_VALIDATION_FAILED",
      };
    }

    // Human-gate soft suggestions: nothing soft is applied until the attorney confirms.
    if (
      !skipNormalize &&
      !confirmSoftSuggestions &&
      prepared.summary.softSuggestions.length > 0
    ) {
      return {
        needsConfirmation: true,
        normalizeReport: prepared.summary,
      };
    }

    const fileKey = keyFn({
      documentType,
      originalName: file.name,
      firmSlug: firmSlug ?? undefined,
    });

    await persist(prepared.normalizedBuffer, fileKey);

    let originalFileKey: string | undefined;
    if (!skipNormalize) {
      originalFileKey = originalKeyFn(fileKey);
      await persist(prepared.originalBuffer, originalFileKey);
    }

    const normalizeReport = {
      ...prepared.summary,
      sourceFileName: file.name,
    };

    const created = await deps.createForFirm(firmId, {
      name,
      description,
      fileKey,
      documentType,
      normalizeReport,
    });

    deps.logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "template.uploaded",
      targetType: "template",
      targetId: created.id,
      metadata: {
        documentType,
        name,
        size: prepared.normalizedBuffer.length,
        originalSize: prepared.originalBuffer.length,
        normalized: !skipNormalize,
        skipNormalize,
        repairCount: prepared.summary.repairCount,
        renameCount: prepared.summary.renameCount,
        warningCount: prepared.summary.warningCount,
        appliedSuggestionCount: prepared.summary.appliedSuggestionCount,
        leftAsSuggestionCount: prepared.summary.leftAsSuggestionCount,
      },
    });

    deps.revalidatePath("/dashboard/templates");
    deps.revalidatePath(`/dashboard/templates/${created.id}`);

    return {
      success: true,
      template: created,
      normalizeReport,
      ...(originalFileKey ? { originalFileKey } : {}),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : null;
    console.error(
      "[dashboard/upload-template-action] executeUploadTemplateForCurrentFirm failed:",
      err,
    );
    const msg =
      message.includes("uploadTemplate") || message.includes("storage")
        ? "Failed to store the template file. Please try again or contact support."
        : "Failed to register the template. Please check the file and try again.";
    return { error: msg, details: name };
  }
}
