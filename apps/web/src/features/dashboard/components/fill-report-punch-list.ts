/**
 * Trust draft punch list from a stored generate fill report.
 *
 * Resolve leftover/empty tags via MAPPER_CONTRACT_KEYS / TAG_ALIASES only.
 * A real jump requires a Field id the wizard already sets (id={name}).
 * No mapper-key → field / section / required tables.
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
  SECTION_ORDER,
  SECTION_SCHEMAS,
  type SectionKey,
} from "@/features/intake/schemas/intake";

const CANONICAL_SET = new Set<string>(MAPPER_CONTRACT_KEYS);

export type PunchListRow = {
  tag: string;
  /** Set only when section + an existing Field id both exist. */
  href: string | null;
  section: SectionKey | null;
  field: string | null;
};

export function isWizardSectionKey(value: string | undefined | null): value is SectionKey {
  return !!value && (SECTION_ORDER as readonly string[]).includes(value);
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

function sectionForFieldId(fieldId: string): SectionKey | null {
  const top = fieldId.split(".")[0];
  for (const [section, schema] of Object.entries(SECTION_SCHEMAS)) {
    const shape = (schema as { shape?: Record<string, unknown> }).shape;
    if (shape && top in shape) return section as SectionKey;
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
  if (!field) return { section: null, field: null };
  return { section: sectionForFieldId(field), field };
}

export function punchListHref(section: SectionKey | null, field: string | null): string | null {
  if (!section || !field) return null;
  const params = new URLSearchParams({ section, field });
  return `?${params.toString()}`;
}

/**
 * leftoverBraces always (disabled if no existing Field id).
 * emptyOptionals only when they resolve to a required wizard Field.
 * Allowed (Zod optional / leave-blank) empties stay quiet.
 */
export function punchListFromFillReport(report: DocumentFillReport): PunchListRow[] {
  const seen = new Set<string>();
  const rows: PunchListRow[] = [];

  const push = (tag: string, emptyOptional: boolean) => {
    if (seen.has(tag)) return;
    const key = resolveFillTagToMapperKey(tag);
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
