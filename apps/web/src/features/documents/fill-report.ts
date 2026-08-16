/**
 * Small post-generate fill report: which template tags filled, which stayed empty,
 * leftover `{…}` in the rendered draft, and loop iteration counts.
 *
 * Tag names only — never values (PII). Built from a real generate (template +
 * rendered buffer + mapper variables + nullGetter misses), not a hand-built object.
 */

import PizZip from "pizzip";
import { z } from "zod";

import type { DocumentFillReport, DocumentVariables, GenerateDocumentResult } from "./types";

const WORD_PART = /^word\/(document|header\d*|footer\d*)\.xml$/;
const MAX_ITEMS = 80;

/** `{#name}` / `{^name}` / `{/name}` / `{name}` */
const TEMPLATE_TAG_RE = /\{([#/^])?([a-zA-Z_][a-zA-Z0-9_.]*)\}/g;
const LEFTOVER_BRACE_RE = /\{([^{}]{1,80})\}/g;

export const documentFillReportSchema = z.object({
  filledScalars: z.array(z.string()),
  emptyOptionals: z.array(z.string()),
  leftoverBraces: z.array(z.string()),
  loopCounts: z.record(z.string(), z.number()),
});

export function wordPlainTextFromDocx(buffer: Buffer): string {
  const zip = new PizZip(buffer);
  return Object.keys(zip.files)
    .filter((k) => WORD_PART.test(k))
    .map((k) => zip.file(k)?.asText() ?? "")
    .join("\n")
    .replace(/<[^>]+>/g, "");
}

function uniqueSorted(items: Iterable<string>): string[] {
  return [...new Set(items)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_ITEMS);
}

function isEmptyScalar(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

function isFilledScalarValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (typeof value === "number") return true;
  return false;
}

function loopCountFor(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value && typeof value === "object") return 1;
  if (typeof value === "number") return value > 0 ? value : 0;
  if (typeof value === "string") return value.trim() ? 1 : 0;
  return 0;
}

/**
 * Classify tags from the template vs the rendered draft + mapper bag.
 */
export function buildFillReport(args: {
  templateBuffer: Buffer;
  generatedBuffer: Buffer;
  variables: DocumentVariables;
  emptyFromNullGetter?: Iterable<string>;
}): DocumentFillReport {
  const templateText = wordPlainTextFromDocx(args.templateBuffer);
  const generatedText = wordPlainTextFromDocx(args.generatedBuffer);

  const scalarTags = new Set<string>();
  const loopTags = new Set<string>();

  TEMPLATE_TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TEMPLATE_TAG_RE.exec(templateText)) !== null) {
    const prefix = match[1] ?? "";
    const name = match[2];
    if (!name) continue;
    if (prefix === "#") loopTags.add(name);
    else if (prefix === "") scalarTags.add(name);
  }

  const filledScalars: string[] = [];
  const emptyOptionals = new Set<string>();

  for (const tag of scalarTags) {
    if (!(tag in args.variables)) continue;
    const value = args.variables[tag];
    if (Array.isArray(value) || (value !== null && typeof value === "object")) continue;
    if (isFilledScalarValue(value)) filledScalars.push(tag);
    else if (isEmptyScalar(value)) emptyOptionals.add(tag);
  }

  for (const tag of args.emptyFromNullGetter ?? []) {
    if (!loopTags.has(tag)) emptyOptionals.add(tag);
  }

  const leftoverBraces: string[] = [];
  LEFTOVER_BRACE_RE.lastIndex = 0;
  let leftover: RegExpExecArray | null;
  while ((leftover = LEFTOVER_BRACE_RE.exec(generatedText)) !== null) {
    const inner = leftover[1].trim();
    if (inner) leftoverBraces.push(inner);
  }

  const loopCounts: Record<string, number> = {};
  for (const name of [...loopTags].sort((a, b) => a.localeCompare(b))) {
    loopCounts[name] = loopCountFor(args.variables[name]);
  }

  return documentFillReportSchema.parse({
    filledScalars: uniqueSorted(filledScalars),
    emptyOptionals: uniqueSorted(emptyOptionals),
    leftoverBraces: uniqueSorted(leftoverBraces),
    loopCounts,
  });
}

/**
 * Return the stored fill-report JSON after shape-check.
 * Does not rebuild from a draft — invalid/missing JSON is null.
 */
export function parseStoredFillReport(value: unknown): DocumentFillReport | null {
  if (documentFillReportSchema.safeParse(value).success) {
    return value as DocumentFillReport;
  }
  return null;
}

/** Persist the generate result's fill report — never a separately assembled object. */
export function generatedDocumentPersistFromGenerate(
  result: GenerateDocumentResult,
  extras: { intakeSessionId: string; templateId: string | null; documentType: string },
) {
  return {
    intakeSessionId: extras.intakeSessionId,
    templateId: extras.templateId,
    documentType: extras.documentType,
    fileKey: result.fileKey,
    status: "generated" as const,
    generatedAt: new Date(),
    fillReport: result.fillReport,
  };
}
