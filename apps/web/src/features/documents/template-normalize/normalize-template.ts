/**
 * Orchestrator: repair split runs → alias-normalize tags → validate.
 *
 * Returns a normalized .docx buffer plus a structured report.
 * Does not rewrite legal language or detect sample client values (next slice).
 */

import { readFile } from "node:fs/promises";

import { repairDocxRuns } from "./repair-runs";
import { normalizeTagsInDocx } from "./normalize-tags";
import { validateTemplate } from "./validate-template";
import type {
  NormalizeReport,
  NormalizeReportItem,
  NormalizeTemplateInput,
  NormalizeTemplateOptions,
  NormalizeTemplateResult,
} from "./types";

function buildReport(items: NormalizeReportItem[], validation?: NormalizeReport["validation"]): NormalizeReport {
  const all = [...items];

  if (validation && !validation.ok) {
    for (const msg of validation.syntaxErrors) {
      all.push({
        kind: "error",
        code: "VALIDATION_SYNTAX",
        message: msg,
      });
    }
  }
  if (validation && validation.missingTags.length > 0) {
    all.push({
      kind: "warning",
      code: "VALIDATION_MISSING_TAGS",
      message: `Dry-run nullGetter recorded missing tags: ${validation.missingTags.join(", ")}`,
      details: { missingTags: validation.missingTags },
    });
  }

  const repairs = all.filter((i) => i.kind === "repair");
  const renames = all.filter((i) => i.kind === "rename");
  const detections = all.filter((i) => i.kind === "detection");
  const warnings = all.filter((i) => i.kind === "warning");
  const errors = all.filter((i) => i.kind === "error");
  const ok = errors.length === 0 && (validation?.ok ?? true);

  return { ok, items: all, repairs, renames, detections, warnings, errors, validation };
}

async function resolveBuffer(input: NormalizeTemplateInput): Promise<Buffer> {
  if (input.kind === "buffer") return input.buffer;
  return readFile(input.path);
}

/**
 * Normalize an attorney .docx template toward the mapper/docxtemplater contract.
 */
export async function normalizeTemplate(
  input: NormalizeTemplateInput,
  options: NormalizeTemplateOptions = {},
): Promise<NormalizeTemplateResult> {
  const shouldValidate = options.validate ?? true;
  const items: NormalizeReportItem[] = [];

  let buffer: Buffer;
  try {
    buffer = await resolveBuffer(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const report = buildReport([
      {
        kind: "error",
        code: "INPUT_READ_FAILED",
        message: `Failed to read input .docx: ${message}`,
      },
    ]);
    return { buffer: Buffer.alloc(0), report };
  }

  // 1. Repair split runs / tag shape
  const repaired = repairDocxRuns(buffer);
  buffer = repaired.buffer;
  items.push(...repaired.items);

  // 2. Alias rename → mapper contract
  const renamed = normalizeTagsInDocx(buffer);
  buffer = renamed.buffer;
  items.push(...renamed.items);

  // 3. Validate with docxtemplater (same options as generator)
  let validation: NormalizeReport["validation"];
  if (shouldValidate) {
    validation = validateTemplate(buffer, {
      renderFixture: options.renderFixture ?? true,
      fixtureVariables: options.fixtureVariables,
      templateLabel: input.kind === "path" ? input.path : "buffer.docx",
    });
    items.push({
      kind: "detection",
      code: "VALIDATION_COMPLETE",
      message: validation.ok
        ? "Validation dry-run passed"
        : `Validation dry-run failed (${validation.syntaxErrors.length} syntax error(s))`,
      details: {
        missingTags: validation.missingTags,
        syntaxErrors: validation.syntaxErrors,
      },
    });
  }

  const report = buildReport(items, validation);
  return { buffer, report };
}

/** Sync variant when the caller already has a Buffer (handy for tests). */
export function normalizeTemplateBuffer(
  buffer: Buffer,
  options: NormalizeTemplateOptions = {},
): NormalizeTemplateResult {
  const shouldValidate = options.validate ?? true;
  const items: NormalizeReportItem[] = [];

  const repaired = repairDocxRuns(buffer);
  let next = repaired.buffer;
  items.push(...repaired.items);

  const renamed = normalizeTagsInDocx(next);
  next = renamed.buffer;
  items.push(...renamed.items);

  let validation: NormalizeReport["validation"];
  if (shouldValidate) {
    validation = validateTemplate(next, {
      renderFixture: options.renderFixture ?? true,
      fixtureVariables: options.fixtureVariables,
      templateLabel: "buffer.docx",
    });
    items.push({
      kind: "detection",
      code: "VALIDATION_COMPLETE",
      message: validation.ok
        ? "Validation dry-run passed"
        : `Validation dry-run failed (${validation.syntaxErrors.length} syntax error(s))`,
      details: {
        missingTags: validation.missingTags,
        syntaxErrors: validation.syntaxErrors,
      },
    });
  }

  return { buffer: next, report: buildReport(items, validation) };
}
