/**
 * Trust draft punch list from a stored generate fill report.
 *
 * Resolve leftover/empty tags via MAPPER_CONTRACT_KEYS / TAG_ALIASES only.
 * Jump href needs a wizard section; Field id is optional (section door).
 * After a Field miss, derive section from SECTION_SCHEMAS shape / nest /
 * DecisionMakerSchema.role — no mapper-key → field / section / required tables.
 * Session answers drop computed leftovers (full names / has_spouse / is_ca_resident)
 * when the parts that compose them are already present.
 */

import { z } from "zod";

import type { DocumentFillReport } from "@/features/documents/types";
import {
  MAPPER_CONTRACT_KEYS,
  TAG_ALIASES,
  splitTag,
  type MapperContractKey,
} from "@/features/documents/template-normalize/normalize-tags";
import { WIZARD_CONTROL_IDS } from "@/features/intake/components/wizard-control-ids";
import {
  DecisionMakerSchema,
  PersonalInfoSchema,
  SECTION_SCHEMAS,
  hasSpouseOrPartner,
  isCAResident,
  restoreJumpSection,
  type PartialIntake,
  type SectionKey,
} from "@/features/intake/schemas/intake";

const CANONICAL_SET = new Set<string>(MAPPER_CONTRACT_KEYS);

export type PunchListRow = {
  tag: string;
  /** Section door (section only) or field door (section + Field id). */
  href: string | null;
  section: SectionKey | null;
  field: string | null;
};

export function isWizardSectionKey(value: string | undefined | null): value is SectionKey {
  return restoreJumpSection(value) !== null;
}

/** Strip leftover `{#name}` / `{^name}` / `{name}` down to the identifier. */
export function resolveFillTagToMapperKey(raw: string): MapperContractKey | null {
  const inner = raw.replace(/^\{/, "").replace(/\}$/, "").trim();
  const split = splitTag(inner);
  const name = split?.name || inner.replace(/^[#/^]/, "");
  if (!name) return null;
  if (CANONICAL_SET.has(name)) return name as MapperContractKey;
  return TAG_ALIASES[name] ?? null;
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/** client_first_name → client.firstName (first segment + camel remainder). */
function snakeToNestedId(s: string): string | null {
  const i = s.indexOf("_");
  if (i <= 0) return null;
  return `${s.slice(0, i)}.${snakeToCamel(s.slice(i + 1))}`;
}

/**
 * Mapper key → existing Field id, or null.
 * Tries camelCase and first-underscore nesting; accepts only ids the wizard already sets.
 */
export function existingFieldIdForMapperKey(key: string): string | null {
  const camel = snakeToCamel(key);
  if (WIZARD_CONTROL_IDS.has(camel)) return camel;
  const nested = snakeToNestedId(key);
  if (nested && WIZARD_CONTROL_IDS.has(nested)) return nested;
  return null;
}

function zodObjectShape(schema: unknown): Record<string, unknown> | null {
  const shape = (schema as { shape?: Record<string, unknown> }).shape;
  return shape && typeof shape === "object" ? shape : null;
}

function sectionForFieldId(fieldId: string): SectionKey | null {
  const top = fieldId.split(".")[0];
  for (const [section, schema] of Object.entries(SECTION_SCHEMAS)) {
    const shape = zodObjectShape(schema);
    if (shape && top in shape) return section as SectionKey;
  }
  return null;
}

/**
 * After a Field miss: walk SECTION_SCHEMAS / nest / DecisionMakerSchema.role.
 * No mapper-key → section table. Cut role names fail the enum (not special-cased).
 */
function sectionForMapperKey(key: string): SectionKey | null {
  const camel = snakeToCamel(key);

  for (const [section, schema] of Object.entries(SECTION_SCHEMAS)) {
    const shape = zodObjectShape(schema);
    if (shape && (key in shape || camel in shape)) return section as SectionKey;
  }

  if (isWizardSectionKey(key) && key !== "review") return key;
  if (isWizardSectionKey(camel) && camel !== "review") return camel;

  if (key.endsWith("_full_name")) {
    const rolePrefix = key.slice(0, -"_full_name".length);
    if (DecisionMakerSchema.shape.role.safeParse(rolePrefix).success) {
      return "decisionMakers";
    }
  }

  const nested = snakeToNestedId(key);
  if (nested) {
    const [top, ...rest] = nested.split(".");
    const remainder = rest.join(".");
    if (isWizardSectionKey(top) && top !== "review") {
      const schema = SECTION_SCHEMAS[top as keyof typeof SECTION_SCHEMAS];
      const shape = zodObjectShape(schema);
      if (shape && remainder && remainder in shape) return top;
    }
  }

  return null;
}

function zodTypeAtPath(schema: z.ZodTypeAny, path: string): z.ZodTypeAny | null {
  const parts = path.split(".");
  let current: z.ZodTypeAny | undefined = schema;
  for (const part of parts) {
    const obj = current as z.ZodTypeAny & { shape?: Record<string, z.ZodTypeAny> };
    const shape = obj.shape;
    if (!shape || !(part in shape)) return null;
    current = shape[part];
  }
  return current ?? null;
}

/** Required = Zod rejects `undefined` at this existing Field path (not `.optional()`). */
function isRequiredWizardField(fieldId: string): boolean {
  const section = sectionForFieldId(fieldId);
  if (!section) return false;
  const schema = SECTION_SCHEMAS[section as keyof typeof SECTION_SCHEMAS];
  const type = zodTypeAtPath(schema as z.ZodTypeAny, fieldId);
  if (!type) return false;
  return type.safeParse(undefined).success === false;
}

export function punchJumpForMapperKey(key: string): {
  section: SectionKey | null;
  field: string | null;
} {
  const field = existingFieldIdForMapperKey(key);
  const section = field ? sectionForFieldId(field) : sectionForMapperKey(key);
  if (!restoreJumpSection(section)) return { section: null, field: null };
  return { section, field };
}

export function punchListHref(section: SectionKey | null, field: string | null): string | null {
  const live = restoreJumpSection(section);
  if (!live) return null;
  const params = new URLSearchParams({ section: live });
  if (field) params.set("field", field);
  return `?${params.toString()}`;
}

/** family → Family, decisionMakers → Decision Makers. Not SECTIONS_CONFIG.label. */
export function camelSplitSectionKey(section: string): string {
  return section
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Leftover inner with braces stripped (`#children` / `children`). */
function leftoverInner(tag: string): string {
  return tag.replace(/^\{/, "").replace(/\}$/, "").trim();
}

/**
 * Loop leftovers only (`#` / `^`). loopCounts[raw] ?? loopCounts[canonical].
 * Noun is the loopCounts key that hit. Never answers.family.children.length.
 * Bare scalars (residuary / successor) get no number.
 */
export function loopCountForPunchTag(
  tag: string,
  report: DocumentFillReport,
): { count: number; noun: string } | null {
  const inner = leftoverInner(tag);
  if (!/^[#^]/.test(inner)) return null;
  const raw = inner.replace(/^[#^]/, "");
  if (Object.hasOwn(report.loopCounts, raw)) {
    return { count: report.loopCounts[raw], noun: raw };
  }
  const canonical = resolveFillTagToMapperKey(tag);
  if (canonical && Object.hasOwn(report.loopCounts, canonical)) {
    return { count: report.loopCounts[canonical], noun: canonical };
  }
  return null;
}

/** Field door: "Go to field". Section door: "N noun — Open Section" or "Open Section". No door: "Still in the draft". */
export function punchListActionCopy(row: PunchListRow, report: DocumentFillReport): string {
  if (!row.href) return "Still in the draft";
  if (row.field) return "Go to field";
  const sectionLabel = row.section ? camelSplitSectionKey(row.section) : "";
  const loop = loopCountForPunchTag(row.tag, report);
  if (loop) return `${loop.count} ${loop.noun} — Open ${sectionLabel}`;
  return `Open ${sectionLabel}`;
}

function trimmedNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function firstAndLastPresent(person: { firstName?: string; lastName?: string } | undefined): boolean {
  return trimmedNonEmpty(person?.firstName) && trimmedNonEmpty(person?.lastName);
}

function maritalStatusIsSet(answers?: PartialIntake | null): boolean {
  return PersonalInfoSchema.shape.maritalStatus.safeParse(answers?.personal?.maritalStatus).success;
}

/**
 * Computed mapper leftovers are not holes when the parts that make them are present.
 * has_spouse / is_ca_resident cannot be proven from filledScalars (booleans ignored).
 */
function computedTagPartsPresent(
  key: MapperContractKey,
  report: DocumentFillReport,
  answers?: PartialIntake | null,
): boolean {
  if (key === "client_full_name") {
    return firstAndLastPresent(answers?.personal?.client) || report.filledScalars.includes("client_full_name");
  }
  if (key === "spouse_full_name") {
    const session = answers ?? {};
    if (!hasSpouseOrPartner(session)) return true;
    return (
      firstAndLastPresent(session.personal?.spouseOrPartner) || report.filledScalars.includes("spouse_full_name")
    );
  }
  if (key === "has_spouse") {
    return maritalStatusIsSet(answers);
  }
  if (key === "is_ca_resident") {
    if (answers == null) return false;
    return typeof isCAResident(answers) === "boolean";
  }
  return false;
}

/**
 * leftoverBraces always (disabled if no section door or Field).
 * emptyOptionals only when they resolve to a required wizard Field.
 * Allowed (Zod optional / leave-blank) empties stay quiet.
 * Computed leftovers drop when their source parts are present on session answers.
 */
export function punchListFromFillReport(
  report: DocumentFillReport,
  answers?: PartialIntake | null,
): PunchListRow[] {
  const seen = new Set<string>();
  const rows: PunchListRow[] = [];

  const push = (tag: string, emptyOptional: boolean) => {
    if (seen.has(tag)) return;
    const key = resolveFillTagToMapperKey(tag);
    if (key && computedTagPartsPresent(key, report, answers)) return;
    const { section, field } = key
      ? punchJumpForMapperKey(key)
      : { section: null, field: null };

    if (emptyOptional) {
      if (!field || !isRequiredWizardField(field)) return;
    }

    seen.add(tag);
    rows.push({
      tag,
      href: punchListHref(section, field),
      section,
      field,
    });
  };

  for (const tag of report.leftoverBraces) push(tag, false);
  for (const tag of report.emptyOptionals) push(tag, true);

  return rows;
}
