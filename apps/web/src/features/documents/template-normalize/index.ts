/**
 * Template normalization foundation (placeholder repair + alias rename + validate).
 *
 * Sample-value → tag detection is intentionally out of scope (next slice).
 */

export type {
  NormalizeTemplateInput,
  NormalizeTemplateOptions,
  NormalizeTemplateResult,
  NormalizeReport,
  NormalizeReportItem,
  NormalizeReportItemKind,
  TemplateValidationResult,
  XmlPartRepairResult,
} from "./types";

export {
  isLikelyPlaceholderInner,
  normalizePlaceholderInner,
  repairParagraphXml,
  repairXmlPart,
  repairDocxRuns,
} from "./repair-runs";

export {
  MAPPER_CONTRACT_KEYS,
  TAG_ALIASES,
  splitTag,
  resolveAlias,
  renameTagsInXml,
  normalizeTagsInDocx,
  buildFixtureVariables,
} from "./normalize-tags";

export { validateTemplate } from "./validate-template";
export type { ValidateTemplateOptions } from "./validate-template";

export { normalizeTemplate, normalizeTemplateBuffer } from "./normalize-template";
