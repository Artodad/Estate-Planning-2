/**
 * Overview landing counts vs today's list-then-.length semantics.
 *
 * Fixtures: progress=0 in_progress (not counted), progress-50 abandoned
 * (counted), leftover ZIP / non-Trust rows (excluded — same hide as the table).
 *
 * Run: pnpm --filter web test:unit
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import { isHiddenEstatePlanPackageRow } from "../components/documents-trust-draft-row";
import {
  OVERVIEW_DEAD_IN_PROGRESS_STATUS,
  countOverviewCardsFromCountFilters,
  countOverviewCardsFromListLength,
  isOverviewIntakeInProgress,
  matchesOverviewDocumentCountWhere,
  matchesOverviewIntakeCountWhere,
  overviewDocumentCountWhere,
  overviewIntakesInProgressWhere,
  shouldPaintOverviewActivity,
  type OverviewIntakeRow,
} from "./overview-stats-counts";

const FIRM = "firm_overview";
const OTHER = "firm_other";

const progressZeroInProgress: OverviewIntakeRow = {
  firmId: FIRM,
  status: "in_progress",
  progress: 0,
  completedAt: null,
};

const abandonedProgress50: OverviewIntakeRow = {
  firmId: FIRM,
  status: "abandoned",
  progress: 50,
  completedAt: null,
};

const completedIntake: OverviewIntakeRow = {
  firmId: FIRM,
  status: "completed",
  progress: 100,
  completedAt: new Date("2026-05-18T14:30:00Z"),
};

const leftoverZipKey =
  "generated/2026-05-26/Smith-John-Full-Estate-Plan-Package-DRAFT-2026-05-26.zip";
const trustDocKey = "generated/pkg/Ada-Lovelace-Trust-DRAFT.docx";
const leftoverWillKey = "generated/pkg/Ada-Lovelace-Will-DRAFT.docx";
const leftoverAhcdKey = "generated/pkg/Ada-Lovelace-Healthcare-DRAFT.docx";

const clients = [
  { firmId: FIRM },
  { firmId: FIRM },
  { firmId: OTHER },
];

const intakes: OverviewIntakeRow[] = [
  progressZeroInProgress,
  abandonedProgress50,
  completedIntake,
  {
    firmId: OTHER,
    status: "abandoned",
    progress: 50,
    completedAt: null,
  },
];

const documents = [
  { firmId: FIRM, fileKey: trustDocKey, documentType: "revocable_trust" },
  { firmId: FIRM, fileKey: leftoverZipKey, documentType: "pour_over_will" },
  { firmId: FIRM, fileKey: leftoverWillKey, documentType: "pour_over_will" },
  { firmId: FIRM, fileKey: leftoverAhcdKey, documentType: "healthcare_directive" },
  { firmId: OTHER, fileKey: "generated/other/archive.zip", documentType: "revocable_trust" },
];

test("three Overview counts match current .length filters on the fixture set", () => {
  const fromLength = countOverviewCardsFromListLength({
    firmId: FIRM,
    clients,
    intakes,
    documents,
  });
  const fromCounts = countOverviewCardsFromCountFilters({
    firmId: FIRM,
    clients,
    intakes,
    documents,
  });

  assert.deepEqual(fromCounts, fromLength);
  assert.deepEqual(fromCounts, {
    totalClients: 2,
    intakesInProgress: 1,
    documentsGenerated: 1,
  });
});

test("progress=0 in_progress is not an Overview intake; abandoned 50 is", () => {
  assert.equal(isOverviewIntakeInProgress(progressZeroInProgress), false);
  assert.equal(matchesOverviewIntakeCountWhere(progressZeroInProgress, FIRM), false);
  assert.equal(isOverviewIntakeInProgress(abandonedProgress50), true);
  assert.equal(matchesOverviewIntakeCountWhere(abandonedProgress50, FIRM), true);
  assert.equal(isOverviewIntakeInProgress(completedIntake), false);
  assert.equal(matchesOverviewIntakeCountWhere(completedIntake, FIRM), false);
});

test("Overview Documents Generated excludes ZIP / package / non-Trust (same hide as the table)", () => {
  assert.equal(isHiddenEstatePlanPackageRow(leftoverZipKey, "pour_over_will"), true);
  assert.equal(isHiddenEstatePlanPackageRow(leftoverWillKey, "pour_over_will"), true);
  assert.equal(isHiddenEstatePlanPackageRow(leftoverAhcdKey, "healthcare_directive"), true);
  assert.equal(isHiddenEstatePlanPackageRow(trustDocKey, "revocable_trust"), false);

  const fromCounts = countOverviewCardsFromCountFilters({
    firmId: FIRM,
    clients,
    intakes,
    documents,
  });
  const visibleOnDocuments = documents.filter(
    (d) =>
      d.firmId === FIRM && !isHiddenEstatePlanPackageRow(d.fileKey, d.documentType),
  ).length;

  assert.equal(fromCounts.documentsGenerated, 1);
  assert.equal(visibleOnDocuments, 1);
  assert.equal(
    fromCounts.documentsGenerated,
    visibleOnDocuments,
    "Overview count must match the Documents table hide",
  );
  assert.equal(matchesOverviewDocumentCountWhere(documents[0]!, FIRM), true);
  assert.equal(matchesOverviewDocumentCountWhere(documents[1]!, FIRM), false);
  assert.equal(overviewDocumentCountWhere(FIRM).documentType, "revocable_trust");
});

test("intake count where keeps the dead IN_PROGRESS clause, not status in_progress", () => {
  const where = overviewIntakesInProgressWhere(FIRM);
  assert.equal(OVERVIEW_DEAD_IN_PROGRESS_STATUS, "IN_PROGRESS");
  assert.notEqual(OVERVIEW_DEAD_IN_PROGRESS_STATUS, "in_progress");
  assert.equal(where.OR[0] && "status" in where.OR[0] && where.OR[0].status, "IN_PROGRESS");

  const deadUppercase: OverviewIntakeRow = {
    firmId: FIRM,
    status: OVERVIEW_DEAD_IN_PROGRESS_STATUS,
    progress: 0,
    completedAt: null,
  };
  assert.equal(isOverviewIntakeInProgress(deadUppercase), true);
  assert.equal(matchesOverviewIntakeCountWhere(deadUppercase, FIRM), true);
});

test("Overview activity drops leftover full-estate-plan package events", () => {
  assert.equal(shouldPaintOverviewActivity("document.package.generated"), false);
  assert.equal(shouldPaintOverviewActivity("document.generated"), true);
  assert.equal(shouldPaintOverviewActivity("client.created"), true);
});
