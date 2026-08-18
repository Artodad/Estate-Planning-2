import type { DocumentFillReport } from "@/features/documents/types";

import { punchListFromFillReport } from "./fill-report-punch-list";

/**
 * Punch list next to the Trust draft download.
 * Rows come from that generate's stored fill report — tag names only.
 */
export function TrustDraftFillReport({ report }: { report: DocumentFillReport }) {
  const rows = punchListFromFillReport(report);
  const filledCount = report.filledScalars.length;

  return (
    <div className="space-y-3" data-testid="trust-draft-fill-report">
      <details className="rounded-lg border bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">
          Filled
          <span className="ml-1.5 tabular-nums text-muted-foreground">({filledCount})</span>
        </summary>
      </details>

      <div
        className="rounded-lg border bg-card p-4"
        data-testid="trust-draft-punch-list"
      >
        <h3 className="text-sm font-semibold tracking-tight">Punch list</h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No leftover tags.</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {rows.map((row) => (
              <li key={row.tag}>
                {row.href ? (
                  <a
                    href={`${row.href}#intake-wizard`}
                    data-punch-row=""
                    data-tag={row.tag}
                    className="flex w-full rounded-md border bg-background px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    {row.tag}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled
                    data-punch-row=""
                    data-tag={row.tag}
                    className="flex w-full cursor-not-allowed rounded-md border bg-background px-3 py-2 text-left text-sm text-muted-foreground"
                  >
                    {row.tag}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
