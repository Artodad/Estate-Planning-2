import { ChevronRight } from "lucide-react";

import type { DocumentFillReport } from "@/features/documents/types";
import type { PartialIntake } from "@/features/intake/schemas/intake";

import {
  loopCountForPunchTag,
  punchListActionCopy,
  punchListFromFillReport,
} from "./fill-report-punch-list";

/** Prefix a relative punchListHref (`?section=`) for Documents. Intake omits this. */
export function prefixedPunchListHref(
  href: string | null,
  hrefPrefix?: string,
): string | null {
  if (!href) return null;
  return hrefPrefix ? `${hrefPrefix}${href}` : href;
}

/**
 * Punch list under the Trust draft download.
 * Section doors lead with punchListActionCopy (people they already entered).
 * Field / unmapped rows still show the leftover tag.
 */
export function TrustDraftFillReport({
  report,
  answers,
  hrefPrefix,
}: {
  report: DocumentFillReport;
  answers?: PartialIntake | null;
  hrefPrefix?: string;
}) {
  const rows = punchListFromFillReport(report, answers);
  const filledCount = report.filledScalars.length;

  return (
    <div className="space-y-5" data-testid="trust-draft-fill-report">
      <div data-testid="trust-draft-punch-list">
        <h3 className="text-sm font-semibold tracking-tight">
          Needs attention
          <span className="ml-1.5 tabular-nums text-muted-foreground">({rows.length})</span>
        </h3>
        {rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Nothing needs attention.</p>
        ) : (
          <ul className="mt-1 divide-y">
            {rows.map((row) => {
              const loop = loopCountForPunchTag(row.tag, report);
              const door = row.href ? (row.field ? "field" : "section") : "none";
              const action = punchListActionCopy(row, report);
              const jumpHref = prefixedPunchListHref(row.href, hrefPrefix);
              const hooks = {
                "data-punch-row": "" as const,
                "data-tag": row.tag,
                "data-punch-door": door,
                "data-loop-count": loop ? String(loop.count) : undefined,
                "data-loop-noun": loop?.noun,
              };
              return (
                <li key={row.tag}>
                  {door === "section" && jumpHref ? (
                    <a
                      href={`${jumpHref}#intake-wizard`}
                      {...hooks}
                      className="group flex items-center justify-between gap-4 rounded-md py-2.5 text-foreground outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="text-sm font-medium leading-6">{action}</span>
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                        aria-hidden
                      />
                    </a>
                  ) : jumpHref ? (
                    <a
                      href={`${jumpHref}#intake-wizard`}
                      {...hooks}
                      className="group flex items-center justify-between gap-4 rounded-md py-2.5 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="font-mono text-[13px] leading-6">{row.tag}</span>
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground">
                        {action}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      {...hooks}
                      className="flex w-full cursor-default items-center justify-between gap-4 py-2.5 text-left text-muted-foreground"
                    >
                      <span className="font-mono text-[13px] leading-6">{row.tag}</span>
                      <span className="shrink-0 text-xs">{action}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Filled
          <span className="ml-1.5 tabular-nums">({filledCount})</span>
        </summary>
        {filledCount > 0 ? (
          <ul className="mt-2 space-y-1">
            {report.filledScalars.map((tag) => (
              <li key={tag} className="font-mono text-[13px] text-muted-foreground">
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}
