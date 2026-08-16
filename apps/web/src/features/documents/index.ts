/**
 * Public API barrel for the Document Generation feature (Phase 4).
 *
 * Re-exports the core engine pieces implemented in Sub-agent B.
 * Consumers (server actions in C, package logic in D, tests in E) import from here.
 */

export * from "./types";
export * from "./errors";
export * from "./storage";
export * from "./draft-watermark-module";
export * from "./mapper";
export * from "./generator";
export * from "./package";
export {
  buildFillReport,
  documentFillReportSchema,
  generatedDocumentPersistFromGenerate,
  wordPlainTextFromDocx,
} from "./fill-report";
export * from "./template-normalize";
