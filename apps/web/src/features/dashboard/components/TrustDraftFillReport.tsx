import type { DocumentFillReport } from "@/features/documents/types";

function humanizeField(name: string): string {
  return name
    .replace(/[{}]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function FieldChips({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li
          key={item}
          className="rounded-md border bg-background px-2 py-0.5 text-xs text-foreground"
        >
          {humanizeField(item)}
        </li>
      ))}
    </ul>
  );
}

/**
 * Scannable fill snapshot for the Trust draft.
 * Driven by the existing DocumentFillReport object — same fields, no new data.
 */
export function TrustDraftFillReport({ report }: { report: DocumentFillReport }) {
  const loopEntries = Object.entries(report.loopCounts);
  const leftoverCount = report.leftoverBraces.length;

  return (
    <div
      className="rounded-lg border bg-card p-4"
      data-testid="trust-draft-fill-report"
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold tracking-tight">Fill report</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What this draft captured from the intake. Review leftovers before sending to the client.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Filled
            <span className="ml-1.5 tabular-nums">({report.filledScalars.length})</span>
          </h4>
          <FieldChips items={report.filledScalars} emptyLabel="No scalar fields filled." />
        </section>

        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Empty optionals
            <span className="ml-1.5 tabular-nums">({report.emptyOptionals.length})</span>
          </h4>
          <FieldChips items={report.emptyOptionals} emptyLabel="No optional blanks left empty." />
        </section>

        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Leftover braces
            <span className="ml-1.5 tabular-nums">({leftoverCount})</span>
          </h4>
          {leftoverCount > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {report.leftoverBraces.map((item) => (
                <li
                  key={item}
                  className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                >
                  {humanizeField(item)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">None — no leftover template braces.</p>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Loops
            <span className="ml-1.5 tabular-nums">({loopEntries.length})</span>
          </h4>
          {loopEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repeating sections in this draft.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {loopEntries.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between gap-3">
                  <span>{humanizeField(name)}</span>
                  <span className="tabular-nums text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
