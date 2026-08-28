/**
 * Parse a persisted Template.normalizeReport JSON snapshot.
 * Tag/blank names only — never file bytes or PII values.
 */

import { z } from "zod";

import type { TemplateUploadNormalizeSummary } from "./types";

const softSuggestionSchema = z.object({
  id: z.string(),
  ruleId: z.string(),
  before: z.string(),
  after: z.string().optional(),
  rationale: z.string(),
  part: z.string().optional(),
  mapperKey: z.string().nullable().optional(),
  applicable: z.boolean(),
});

export const templateUploadNormalizeSummarySchema = z.object({
  ok: z.boolean(),
  skipped: z.boolean().optional(),
  repairCount: z.number(),
  renameCount: z.number(),
  detectionCount: z.number(),
  warningCount: z.number(),
  errorCount: z.number(),
  softSuggestions: z.array(softSuggestionSchema),
  appliedSuggestionCount: z.number(),
  leftAsSuggestionCount: z.number(),
  taggedCount: z.number().optional(),
  acceptedSuggestionIds: z.array(z.string()).optional(),
  highlights: z.array(
    z.object({
      kind: z.string(),
      code: z.string(),
      message: z.string(),
      before: z.string().optional(),
      after: z.string().optional(),
    }),
  ),
  validation: z
    .object({
      ok: z.boolean(),
      missingTags: z.array(z.string()),
      syntaxErrors: z.array(z.string()),
    })
    .optional(),
});

export function parseStoredNormalizeReport(
  value: unknown,
): TemplateUploadNormalizeSummary | null {
  const parsed = templateUploadNormalizeSummarySchema.safeParse(value);
  if (!parsed.success) return null;
  return parsed.data as TemplateUploadNormalizeSummary;
}
