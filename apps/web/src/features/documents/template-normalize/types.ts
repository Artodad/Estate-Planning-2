/**
 * Types for the template normalization pipeline.
 *
 * Pipeline: repair split Word runs / orphan braces → sample/blank detect →
 * rename tags to the mapper contract → dry-run validate with docxtemplater.
 * Does not rewrite legal language.
 */

/** How to supply the source .docx */
export type NormalizeTemplateInput =
  | { kind: "buffer"; buffer: Buffer }
  | { kind: "path"; path: string };

export type NormalizeReportItemKind =
  | "repair"
  | "rename"
  | "detection"
  | "warning"
  | "error";

export interface NormalizeReportItem {
  kind: NormalizeReportItemKind;
  code: string;
  message: string;
  /** XML part path inside the .docx, e.g. word/document.xml */
  part?: string;
  /** Optional before/after for repairs and renames */
  before?: string;
  after?: string;
  details?: Record<string, unknown>;
}

export interface NormalizeReport {
  ok: boolean;
  items: NormalizeReportItem[];
  repairs: NormalizeReportItem[];
  renames: NormalizeReportItem[];
  detections: NormalizeReportItem[];
  warnings: NormalizeReportItem[];
  errors: NormalizeReportItem[];
  validation?: TemplateValidationResult;
}

export interface TemplateValidationResult {
  ok: boolean;
  /** Tags that compiled but had no fixture value (via nullGetter) */
  missingTags: string[];
  /** Compile/render syntax or structural errors */
  syntaxErrors: string[];
  /** Other actionable messages */
  messages: string[];
}

export interface NormalizeTemplateOptions {
  /** When false, skip the docxtemplater dry-run (default: true) */
  validate?: boolean;
  /** When true, call render() with fixture vars after compile() (default: true) */
  renderFixture?: boolean;
  /** Optional override fixture variables for validation render */
  fixtureVariables?: Record<string, unknown>;
  /**
   * When false, skip sample-value / underscore-blank detection (default: true).
   * High-confidence hits become tags; low-confidence hits are report suggestions.
   */
  detectSamples?: boolean;
}

export interface NormalizeTemplateResult {
  buffer: Buffer;
  report: NormalizeReport;
}

/**
 * Soft (low-confidence) suggestion row for upload accept/reject UI.
 * Mirrors `SAMPLE_VALUE_SUGGESTION` report items — not a parallel model.
 */
export interface TemplateUploadSoftSuggestion {
  id: string;
  ruleId: string;
  before: string;
  /** Proposed replacement tag when docxtemplater-safe */
  after?: string;
  rationale: string;
  part?: string;
  mapperKey?: string | null;
  /** False when ignore/reject only (no safe proposed tag) */
  applicable: boolean;
}

/**
 * Client-safe summary returned from template upload (no buffers / file content).
 * Used by the dashboard TemplateUploadForm and upload Server Action.
 */
export interface TemplateUploadNormalizeSummary {
  ok: boolean;
  /**
   * True when the uploader opted out of auto-normalize (`skipNormalize`).
   * Counts are zero and no `*.original.docx` side file is written.
   */
  skipped?: boolean;
  repairCount: number;
  renameCount: number;
  detectionCount: number;
  warningCount: number;
  errorCount: number;
  /** Soft suggestions awaiting attorney accept/reject (default: none applied). */
  softSuggestions: TemplateUploadSoftSuggestion[];
  /** How many soft suggestions were applied on confirm upload. */
  appliedSuggestionCount: number;
  /** Soft suggestions left unapplied (rejected/ignored or non-applicable). */
  leftAsSuggestionCount: number;
  /**
   * High-confidence SAMPLE_VALUE_TAGGED + applied soft suggestions.
   * Derived at persist time from the full report (not the capped highlights).
   */
  taggedCount?: number;
  /** Accepted soft-suggestion ids at persist. Empty = leftover punch is all softSuggestions. */
  acceptedSuggestionIds?: string[];
  /** SAMPLE_VALUE_TAGGED / applied soft rows for the collapsed Tagged disclosure. */
  taggedPunch?: Array<{ before?: string; after?: string; code: string }>;
  /** Original .docx filename from upload (display only — not the storage key). */
  sourceFileName?: string;
  /** Short list for UI (capped). */
  highlights: Array<{
    kind: NormalizeReportItemKind;
    code: string;
    message: string;
    before?: string;
    after?: string;
  }>;
  validation?: {
    ok: boolean;
    missingTags: string[];
    syntaxErrors: string[];
  };
}

export interface XmlPartRepairResult {
  xml: string;
  items: NormalizeReportItem[];
}
