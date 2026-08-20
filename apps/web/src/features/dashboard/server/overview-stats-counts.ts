/**
 * Overview landing card counts.
 *
 * Preserves today's list-then-.length semantics (including the dead
 * `status === "IN_PROGRESS"` clause). Schema writes `"in_progress"`.
 * Documents Generated is unbounded — no ZIP hide, no take 1000.
 */

export type OverviewIntakeRow = {
  firmId: string;
  status: string;
  progress: number;
  completedAt: Date | string | null | undefined;
};

/**
 * Dead clause from the original JS filter. Schema writes `"in_progress"`.
 * Do not change this to `in_progress` — that would count progress=0 sessions.
 */
export const OVERVIEW_DEAD_IN_PROGRESS_STATUS = "IN_PROGRESS" as const;

/** Exact JS used by getOverviewStatsForCurrentFirm before count() queries. */
export function isOverviewIntakeInProgress(session: OverviewIntakeRow): boolean {
  return (
    session.status === OVERVIEW_DEAD_IN_PROGRESS_STATUS ||
    (session.progress > 0 && session.progress < 100 && !session.completedAt)
  );
}

export function overviewClientCountWhere(firmId: string) {
  return { firmId };
}

/** Every GeneratedDocument row for the firm. No isHiddenEstatePlanPackageRow. */
export function overviewDocumentCountWhere(firmId: string) {
  return { firmId };
}

/**
 * Prisma where for Intakes In Progress.
 * Do not use `status: "in_progress"` — that would change the card.
 */
export function overviewIntakesInProgressWhere(firmId: string) {
  return {
    firmId,
    OR: [
      { status: OVERVIEW_DEAD_IN_PROGRESS_STATUS },
      {
        progress: { gt: 0, lt: 100 },
        completedAt: null,
      },
    ],
  };
}

/** Apply the Prisma count where to an in-memory intake row. */
export function matchesOverviewIntakeCountWhere(
  row: OverviewIntakeRow,
  firmId: string,
): boolean {
  const where = overviewIntakesInProgressWhere(firmId);
  if (row.firmId !== where.firmId) return false;
  const [uppercaseInProgress, progressWindow] = where.OR;
  if (row.status === uppercaseInProgress.status) return true;
  return (
    row.progress > progressWindow.progress.gt &&
    row.progress < progressWindow.progress.lt &&
    row.completedAt === progressWindow.completedAt
  );
}

export function countOverviewCardsFromListLength(input: {
  firmId: string;
  clients: { firmId: string }[];
  intakes: OverviewIntakeRow[];
  documents: { firmId: string }[];
}) {
  const { firmId } = input;
  const clients = input.clients.filter((c) => c.firmId === firmId);
  const intakes = input.intakes.filter((i) => i.firmId === firmId);
  const documents = input.documents.filter((d) => d.firmId === firmId);
  return {
    totalClients: clients.length,
    intakesInProgress: intakes.filter(isOverviewIntakeInProgress).length,
    documentsGenerated: documents.length,
  };
}

export function countOverviewCardsFromCountFilters(input: {
  firmId: string;
  clients: { firmId: string }[];
  intakes: OverviewIntakeRow[];
  documents: { firmId: string }[];
}) {
  const { firmId } = input;
  const clientWhere = overviewClientCountWhere(firmId);
  const documentWhere = overviewDocumentCountWhere(firmId);
  return {
    totalClients: input.clients.filter((c) => c.firmId === clientWhere.firmId)
      .length,
    intakesInProgress: input.intakes.filter((i) =>
      matchesOverviewIntakeCountWhere(i, firmId),
    ).length,
    documentsGenerated: input.documents.filter(
      (d) => d.firmId === documentWhere.firmId,
    ).length,
  };
}
