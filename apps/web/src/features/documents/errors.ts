/**
 * Custom error hierarchy for Document Generation (Phase 4).
 *
 * Per .cursor/rules/document-fidelity.mdc (non-negotiable) and Design §3:
 * - ALWAYS surface exact missing variables with clear, attorney-actionable messages.
 * - Never silently continue, approximate, or hide template issues.
 * - Distinguish template load vs render vs storage vs mapping errors.
 *
 * Used by generator.ts + future package + UI error states (C).
 */

export class DocumentGenerationError extends Error {
  public readonly details?: Record<string, unknown>;
  public readonly code: string;

  constructor(message: string, details?: Record<string, unknown>, code = "DOCUMENT_GENERATION_ERROR") {
    super(message);
    this.name = "DocumentGenerationError";
    this.code = code;
    this.details = details;
    // Maintains proper stack for modern TS
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocumentGenerationError);
    }
  }
}

export class TemplateLoadError extends DocumentGenerationError {
  public readonly templateFileKey: string;

  constructor(templateFileKey: string, cause?: unknown) {
    super(
      `Failed to load attorney template from storage (fileKey: ${templateFileKey}). ` +
        `Verify the template exists in storage and the key in the Template record is correct. ` +
        `Cause: ${cause instanceof Error ? cause.message : String(cause)}`,
      { templateFileKey, cause: cause instanceof Error ? cause.message : cause },
      "TEMPLATE_LOAD_ERROR",
    );
    this.name = "TemplateLoadError";
    this.templateFileKey = templateFileKey;
  }
}

export class MissingTemplateVariablesError extends DocumentGenerationError {
  public readonly missingVariables: string[];
  public readonly templateFileKey: string;

  constructor(
    missingVariables: string[],
    templateFileKey: string,
    intakeSessionId?: string,
    documentType?: string,
  ) {
    const varList = missingVariables.length > 0 ? missingVariables.join(", ") : "(none reported)";
    super(
      `Template requires variables that were not provided by the mapper: [${varList}]. ` +
        `Template: ${templateFileKey}${documentType ? ` (type: ${documentType})` : ""}. ` +
        `IntakeSession: ${intakeSessionId ?? "unknown"}. ` +
        `Attorney action: (1) Verify the intake captured all required data for this document type, ` +
        `(2) Confirm the .docx template uses the exact variable names the mapper outputs (see Template Compatibility Guide), ` +
        `or (3) update the mapper for new template tags. ` +
        `This error is intentional per document-fidelity rules — no approximation or partial render is performed.`,
      {
        missingVariables,
        templateFileKey,
        intakeSessionId,
        documentType,
      },
      "MISSING_TEMPLATE_VARIABLES",
    );
    this.name = "MissingTemplateVariablesError";
    this.missingVariables = missingVariables;
    this.templateFileKey = templateFileKey;
  }
}

export class RenderingError extends DocumentGenerationError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details, "RENDERING_ERROR");
    this.name = "RenderingError";
  }
}

export class StorageError extends DocumentGenerationError {
  public readonly fileKey: string;

  constructor(operation: "read" | "write", fileKey: string, cause?: unknown) {
    super(
      `Storage ${operation} failed for fileKey "${fileKey}". ` +
        `This is a server-side infrastructure or permissions issue (not a data problem).`,
      { operation, fileKey, cause: cause instanceof Error ? cause.message : cause },
      "STORAGE_ERROR",
    );
    this.name = "StorageError";
    this.fileKey = fileKey;
  }
}

// Helper to normalize unknown docxtemplater errors into our hierarchy.
export function normalizeDocxtemplaterError(
  err: unknown,
  templateFileKey: string,
  intakeSessionId?: string,
  documentType?: string,
): DocumentGenerationError {
  if (err && typeof err === "object" && "properties" in err) {
    const e = err as { properties?: { errors?: Array<{ name?: string; message?: string; properties?: any }> } };
    const errors = e.properties?.errors ?? [];
    const missing = errors
      .filter((er) => er?.name === "placeholder_error" || /not found|missing|undefined/i.test(er?.message || ""))
      .map((er) => er?.properties?.id || er?.message || "unknown_var")
      .filter(Boolean);

    if (missing.length > 0) {
      return new MissingTemplateVariablesError(missing, templateFileKey, intakeSessionId, documentType);
    }

    return new RenderingError(
      `docxtemplater render error in template ${templateFileKey}: ${errors.map((er) => er?.message || er?.name).join("; ")}`,
      { raw: err, templateFileKey },
    );
  }

  if (err instanceof Error) {
    return new RenderingError(`Unexpected render failure for ${templateFileKey}: ${err.message}`, {
      original: err.message,
      templateFileKey,
    });
  }

  return new RenderingError(`Unknown render failure for template ${templateFileKey}`, { raw: err });
}
