/**
 * Dry-run validation of a (repaired/normalized) .docx template with docxtemplater.
 *
 * Uses the same constructor options as generator.ts (`paragraphLoop: true`).
 * Surfaces syntax errors and missing tags using the documents error helpers
 * where possible — never approximates a successful render.
 *
 * Note: docxtemplater 3.6x compiles during construction and prefers render(data)
 * over the deprecated setData/compile chain still used in generator.ts.
 */

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

import { normalizeDocxtemplaterError } from "../errors";
import {
  createRecordingNullGetter,
  DOCXTEMPLATER_BASE_OPTIONS,
} from "../docxtemplater-options";
import { buildFixtureVariables } from "./normalize-tags";
import type { TemplateValidationResult } from "./types";

export interface ValidateTemplateOptions {
  /** Call render() after successful construct/compile (default: true) */
  renderFixture?: boolean;
  /** Fixture variables; defaults to empty-safe mapper contract values */
  fixtureVariables?: Record<string, unknown>;
  /** Label used in error messages */
  templateLabel?: string;
}

function collectSyntaxErrors(err: unknown): string[] {
  const syntaxErrors: string[] = [];
  if (err && typeof err === "object" && "properties" in err) {
    const e = err as {
      properties?: {
        errors?: Array<{
          message?: string;
          name?: string;
          properties?: { explanation?: string; xtag?: string; id?: string };
        }>;
      };
    };
    for (const sub of e.properties?.errors ?? []) {
      const detail = sub.properties?.explanation || sub.message || sub.name || "syntax error";
      const tag = sub.properties?.xtag || sub.properties?.id;
      syntaxErrors.push(tag ? `${detail} (tag: ${tag})` : detail);
    }
  }
  return syntaxErrors;
}

/**
 * Compile (and optionally render) a template buffer; return a structured result.
 */
export function validateTemplate(
  buffer: Buffer,
  options: ValidateTemplateOptions = {},
): TemplateValidationResult {
  const renderFixture = options.renderFixture ?? true;
  const templateLabel = options.templateLabel ?? "normalized-template.docx";
  const fixture = buildFixtureVariables(options.fixtureVariables ?? {});

  const missingTags = new Set<string>();
  const syntaxErrors: string[] = [];
  const messages: string[] = [];

  let doc: Docxtemplater;

  try {
    const zip = new PizZip(buffer);
    // Construction compiles the template (modern docxtemplater).
    doc = new Docxtemplater(zip, {
      ...DOCXTEMPLATER_BASE_OPTIONS,
      nullGetter: createRecordingNullGetter(missingTags),
    });
  } catch (err) {
    const collected = collectSyntaxErrors(err);
    if (collected.length > 0) {
      syntaxErrors.push(...collected);
    } else {
      syntaxErrors.push(normalizeDocxtemplaterError(err, templateLabel).message);
    }
    return {
      ok: false,
      missingTags: [],
      syntaxErrors,
      messages: ["Failed to load/compile template into docxtemplater"],
    };
  }

  if (renderFixture) {
    try {
      // Modern API: render(data) replaces setData + compile + render()
      doc.render(fixture);
    } catch (err) {
      const normalized = normalizeDocxtemplaterError(err, templateLabel);
      if (normalized.name === "MissingTemplateVariablesError") {
        const missing = (normalized as { missingVariables?: string[] }).missingVariables ?? [];
        for (const m of missing) missingTags.add(m);
      } else {
        const collected = collectSyntaxErrors(err);
        if (collected.length > 0) syntaxErrors.push(...collected);
        else syntaxErrors.push(normalized.message);
      }
      return {
        ok: false,
        missingTags: [...missingTags],
        syntaxErrors,
        messages: ["Template render dry-run failed"],
      };
    }
  }

  if (missingTags.size > 0) {
    messages.push(
      `Dry-run recorded ${missingTags.size} tag(s) without fixture values (nullGetter). ` +
        `These may be intentional custom tags or mapper gaps.`,
    );
  } else {
    messages.push(
      (renderFixture ? "Compile+render" : "Compile") + " dry-run succeeded with fixture variables",
    );
  }

  return {
    ok: syntaxErrors.length === 0,
    missingTags: [...missingTags].sort(),
    syntaxErrors,
    messages,
  };
}
