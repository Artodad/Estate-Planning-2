/**
 * Stored Trust template leftover punch — same leftover-N idea as intake,
 * from persisted normalize report (not generate-time fillReport).
 *
 * Run: cd apps/web && npx tsx --test src/features/dashboard/components/normalize-report-punch-list.test.ts
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import type { TemplateUploadNormalizeSummary } from "@/features/documents/template-normalize/types";
import { parseStoredNormalizeReport } from "@/features/documents/template-normalize/stored-normalize-report";

import {
  leftoverCountFromNormalizeReport,
  leftoverPunchFromNormalizeReport,
  taggedCountFromNormalizeReport,
  templatePunchFromStoredReport,
  templateRowLeftoverLabel,
  templateRowPunchLabel,
} from "./normalize-report-punch-list";

function storedTrustReport(
  extra: Partial<TemplateUploadNormalizeSummary> = {},
): TemplateUploadNormalizeSummary {
  return {
    ok: true,
    repairCount: 4,
    renameCount: 0,
    detectionCount: 3,
    warningCount: 0,
    errorCount: 0,
    softSuggestions: [
      {
        id: "soft:0:blank_do_do_not",
        ruleId: "blank_do_do_not",
        before: "do/do not",
        after: "{do_or_do_not}",
        rationale: "Low-confidence blank — not auto-tagged",
        applicable: true,
      },
    ],
    appliedSuggestionCount: 0,
    leftAsSuggestionCount: 1,
    taggedCount: 2,
    acceptedSuggestionIds: [],
    highlights: [
      {
        kind: "repair",
        code: "SAMPLE_VALUE_TAGGED",
        message: "Tagged sample/blank as {trust_name}",
        after: "{trust_name}",
      },
    ],
    ...extra,
  };
}

test("reload of persisted Trust leftover punch reads stored JSON, not toast memory", () => {
  const persisted = storedTrustReport();
  const reloaded = parseStoredNormalizeReport(JSON.parse(JSON.stringify(persisted)));
  assert.ok(reloaded);
  assert.equal(leftoverCountFromNormalizeReport(reloaded), 1);
  assert.equal(taggedCountFromNormalizeReport(reloaded), 2);
  assert.equal(templateRowLeftoverLabel(reloaded), "1 leftovers");
  assert.equal(templateRowPunchLabel(reloaded), "2 tagged • 1 leftovers");
  assert.equal(leftoverPunchFromNormalizeReport(reloaded)[0]?.before, "do/do not");
});

test("templatePunchFromStoredReport is leftover N, not leftoverBraces / highlight cap", () => {
  const punch = templatePunchFromStoredReport(storedTrustReport());
  assert.equal(punch.leftoverCount, 1);
  assert.equal(punch.leftovers.length, punch.leftoverCount);
  assert.notEqual(punch.leftoverCount, punch.taggedCount);
  assert.notEqual(punch.leftoverCount, punch.report?.repairCount);
});

test("accepted soft suggestions drop out of leftover punch after reload", () => {
  const persisted = storedTrustReport({
    appliedSuggestionCount: 1,
    leftAsSuggestionCount: 0,
    acceptedSuggestionIds: ["soft:0:blank_do_do_not"],
    taggedCount: 3,
  });
  const punch = templatePunchFromStoredReport(JSON.parse(JSON.stringify(persisted)));
  assert.equal(punch.leftoverCount, 0);
  assert.equal(punch.punchLabel, "3 tagged • clean");
  assert.equal(templateRowLeftoverLabel(punch.report), "clean");
});

test("skipped / missing report is quiet (no leftover N)", () => {
  assert.equal(templatePunchFromStoredReport(null).punchLabel, null);
  assert.equal(templatePunchFromStoredReport({}).punchLabel, null);
  const skipped = storedTrustReport({ skipped: true, softSuggestions: [], taggedCount: 0 });
  assert.equal(templateRowPunchLabel(skipped), null);
  assert.equal(leftoverCountFromNormalizeReport(skipped), 0);
});
