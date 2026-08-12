/**
 * Types for the template normalization pipeline.
 *
 * Foundation slice: repair split Word runs, rename tags to the mapper contract,
 * and dry-run validate with docxtemplater. Does not rewrite legal language.
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
}

export interface NormalizeTemplateResult {
  buffer: Buffer;
  report: NormalizeReport;
}

export interface XmlPartRepairResult {
  xml: string;
  items: NormalizeReportItem[];
}
