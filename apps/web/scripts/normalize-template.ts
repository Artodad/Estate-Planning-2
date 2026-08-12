#!/usr/bin/env npx tsx
/**
 * CLI: normalize an attorney .docx toward the mapper/docxtemplater contract.
 *
 * Usage:
 *   pnpm --filter web normalize-template -- path/to/template.docx
 *   pnpm --filter web exec tsx scripts/normalize-template.ts path/to/template.docx
 *
 * Writes:
 *   path/to/template.normalized.docx
 *   path/to/template.normalize-report.json
 *
 * See docs/template-normalizer.md
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

import { normalizeTemplate } from "../src/features/documents/template-normalize/normalize-template";

function printUsage(): never {
  console.error(`Usage: tsx scripts/normalize-template.ts <input.docx> [--out <path>]

Normalizes placeholder structure (split-run repair + alias rename + validate).
Does not rewrite legal language. Sample-value auto-tagging is not in this slice.`);
  process.exit(2);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printUsage();
  }

  let inputPath: string | undefined;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--") continue; // pnpm/npm arg separator
    if (a === "--out") {
      outPath = args[++i];
      continue;
    }
    if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      printUsage();
    }
    if (!inputPath) inputPath = a;
    else {
      console.error("Unexpected extra argument:", a);
      printUsage();
    }
  }

  if (!inputPath) printUsage();

  const resolved = path.resolve(inputPath);
  if (!resolved.toLowerCase().endsWith(".docx")) {
    console.error("Input must be a .docx file");
    process.exit(2);
  }

  const base = resolved.replace(/\.docx$/i, "");
  const normalizedPath = outPath
    ? path.resolve(outPath)
    : `${base}.normalized.docx`;
  const finalReportPath = outPath
    ? normalizedPath.replace(/\.docx$/i, "") + ".normalize-report.json"
    : `${base}.normalize-report.json`;

  console.log(`[normalize] Reading ${resolved}`);
  const { buffer, report } = await normalizeTemplate({ kind: "path", path: resolved });

  if (buffer.length === 0) {
    console.error("[normalize] Failed — empty output buffer");
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  await writeFile(normalizedPath, buffer);
  await writeFile(finalReportPath, JSON.stringify(report, null, 2), "utf8");

  console.log(`[normalize] Wrote ${normalizedPath}`);
  console.log(`[normalize] Wrote ${finalReportPath}`);
  console.log(
    `[normalize] Summary: repairs=${report.repairs.length} renames=${report.renames.length} warnings=${report.warnings.length} errors=${report.errors.length} ok=${report.ok}`,
  );

  if (!report.ok) {
    console.error("[normalize] Completed with validation/errors — inspect the report JSON");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[normalize] Fatal:", err);
  process.exit(1);
});
