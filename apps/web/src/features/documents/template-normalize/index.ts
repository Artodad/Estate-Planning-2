/**
 * Template normalization: repair split/orphan braces → sample/blank detect →
 * alias rename + settlor spouse polarity → docxtemplater validate.
 */

export type {
  NormalizeTemplateInput,
  NormalizeTemplateOptions,
  NormalizeTemplateResult,
  NormalizeReport,
  NormalizeReportItem,
  NormalizeReportItemKind,
  TemplateValidationResult,
  TemplateUploadNormalizeSummary,
  XmlPartRepairResult,
} from "./types";

export {
  isLikelyPlaceholderInner,
  normalizePlaceholderInner,
  repairParagraphXml,
  repairXmlPart,
  repairDocxRuns,
  removeOrphanClosers,
  buildTextRun,
  buildTextRunWithChrome,
  splitRunChrome,
} from "./repair-runs";

export {
  MAPPER_CONTRACT_KEYS,
  TAG_ALIASES,
  splitTag,
  resolveAlias,
  renameTagsInXml,
  fixSettlorSpousePolarityInXml,
  normalizeTagsInDocx,
  buildFixtureVariables,
} from "./normalize-tags";

export {
  SAMPLE_DETECTION_RULES,
  detectSampleValuesInParagraph,
  detectSampleValuesInXml,
  detectSampleValuesInDocx,
} from "./detect-sample-values";
export type { SampleDetectionRule } from "./detect-sample-values";

export { validateTemplate } from "./validate-template";
export type { ValidateTemplateOptions } from "./validate-template";

export { normalizeTemplate, normalizeTemplateBuffer } from "./normalize-template";

export {
  prepareTemplateUpload,
  type PrepareTemplateUploadOptions,
  type PrepareTemplateUploadResult,
} from "./prepare-template-upload";
export type { PrepareTemplateUploadResult } from "./prepare-template-upload";
