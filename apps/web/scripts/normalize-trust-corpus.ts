#!/usr/bin/env npx tsx
/**
 * Batch-normalize the real Trust Family corpus and write per-file reports.
 *
 * Usage:
 *   pnpm --filter web exec tsx scripts/normalize-trust-corpus.ts
 *   pnpm --filter web exec tsx scripts/normalize-trust-corpus.ts --out-dir ../../docs/template-normalizer-reports/iteration
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { normalizeTemplate } from "../src/features/documents/template-normalize/normalize-template";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, "..");

const FILES = [
  "templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprg7y50.docx",
  "templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprnxupt.docx",
  "templates/aaa-1780034544721732674/revocable_trust/Trust-_Family-changed-mprpud8a.docx",
  "templates/firm-12-1779936733274746364/revocable_trust/Trust-_Family-changed-mprg6n30.docx",
  "templates/verify/revocable_trust_test_v1.docx",
];

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  let outDir = path.resolve(WEB_ROOT, "../../docs/template-normalizer-reports/iteration");
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--out-dir") outDir = path.resolve(args[++i]);
  }

  await mkdir(outDir, { recursive: true });
  const summary: Array<Record<string, unknown>> = [];
  const seenSha = new Map<string, string>();

  for (const rel of FILES) {
    const abs = path.join(WEB_ROOT, ".local-document-storage", rel);
    const base = path.basename(rel, ".docx");
    const raw = await readFile(abs);
    const digest = sha256(raw);
    const duplicateOf = seenSha.get(digest) ?? null;
    if (!duplicateOf) seenSha.set(digest, base);

    console.log(`\n[corpus] ${base} sha=${digest.slice(0, 12)}…${duplicateOf ? ` (dup of ${duplicateOf})` : ""}`);
    const { buffer, report } = await normalizeTemplate({ kind: "path", path: abs });

    const outDocx = path.join(outDir, `${base}.normalized.docx`);
    const outReport = path.join(outDir, `${base}.normalize-report.json`);
    await writeFile(outDocx, buffer);
    await writeFile(outReport, JSON.stringify(report, null, 2), "utf8");

    const row = {
      file: rel,
      base,
      sha256: digest,
      duplicateOf,
      ok: report.ok,
      repairs: report.repairs.length,
      renames: report.renames.length,
      warnings: report.warnings.length,
      errors: report.errors.length,
      orphanClosersRemoved: report.repairs.filter((r) => r.code === "ORPHAN_CLOSER_REMOVED").length,
      sampleTagged: report.repairs.filter((r) => r.code === "SAMPLE_VALUE_TAGGED").length,
      sampleSuggestions: report.detections.filter((d) => d.code === "SAMPLE_VALUE_SUGGESTION").length,
      validationOk: report.validation?.ok ?? null,
      syntaxErrors: report.validation?.syntaxErrors ?? [],
      missingTags: report.validation?.missingTags ?? [],
    };
    summary.push(row);
    console.log(
      `[corpus] ok=${row.ok} repairs=${row.repairs} sampleTagged=${row.sampleTagged} suggestions=${row.sampleSuggestions} orphans=${row.orphanClosersRemoved}`,
    );
  }

  const summaryPath = path.join(outDir, "summary.json");
  await writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  const md = [
    "# Trust Family corpus — normalizer iteration results",
    "",
    `| File | Distinct | ok | repairs | orphans removed | samples tagged | suggestions | syntax errors |`,
    `|---|---|---|---:|---:|---:|---:|---|`,
    ...summary.map((r) => {
      const syn = (r.syntaxErrors as string[]).length
        ? (r.syntaxErrors as string[]).join("; ").slice(0, 80)
        : "—";
      return `| \`${r.base}\` | ${r.duplicateOf ? `dup→${r.duplicateOf}` : "yes"} | ${r.ok} | ${r.repairs} | ${r.orphanClosersRemoved} | ${r.sampleTagged} | ${r.sampleSuggestions} | ${syn} |`;
    }),
    "",
    `Reports written to \`${outDir}\`.`,
    "",
  ].join("\n");
  await writeFile(path.join(outDir, "SUMMARY.md"), md, "utf8");
  console.log(`\n[corpus] Wrote ${summaryPath}`);
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
