import type { DocumentFillReport } from "@/features/documents/types";

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "none";
}

function loopSummary(loopCounts: Record<string, number>): string {
  const entries = Object.entries(loopCounts);
  if (entries.length === 0) return "none";
  return entries.map(([name, count]) => `${name} (${count})`).join(", ");
}

/** Compact fill snapshot next to the Trust draft download — not a dashboard. */
export function TrustDraftFillReport({ report }: { report: DocumentFillReport }) {
  return (
    <div
      className="mt-3 rounded border border-emerald-200/80 bg-white/60 p-2 text-[11px] text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-100"
      data-testid="trust-draft-fill-report"
    >
      <div className="font-medium">Fill report</div>
      <ul className="mt-1 space-y-0.5 text-muted-foreground dark:text-emerald-200/80">
        <li>
          <span className="font-medium text-foreground dark:text-emerald-100">Filled:</span>{" "}
          {listOrNone(report.filledScalars)}
        </li>
        <li>
          <span className="font-medium text-foreground dark:text-emerald-100">Empty optionals:</span>{" "}
          {listOrNone(report.emptyOptionals)}
        </li>
        <li>
          <span className="font-medium text-foreground dark:text-emerald-100">Leftover braces:</span>{" "}
          {listOrNone(report.leftoverBraces)}
        </li>
        <li>
          <span className="font-medium text-foreground dark:text-emerald-100">Loops:</span>{" "}
          {loopSummary(report.loopCounts)}
        </li>
      </ul>
    </div>
  );
}
