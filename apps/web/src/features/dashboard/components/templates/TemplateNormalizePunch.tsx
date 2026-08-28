import type { TemplateUploadNormalizeSummary } from "@/features/documents/template-normalize/types";

import {
  leftoverCountFromNormalizeReport,
  leftoverPunchFromNormalizeReport,
  taggedPunchFromNormalizeReport,
  templateRowPunchLabel,
  wordBlankDisplay,
} from "../normalize-report-punch-list";

const STILL_IN_THE_WORD = "Still in the Word. Intake cannot fill these.";
const STILL_IN_THE_DRAFT = "Still in the draft";
const CLEAN_FOOTER =
  "When this is clean, start a client. Do not generate a draft to find these holes.";

/**
 * Post-upload Trust instrument punch. Confirm copy stays here — never in the .docx.
 */
export function TemplateNormalizePunch({
  report,
}: {
  report: TemplateUploadNormalizeSummary | null;
}) {
  if (!report || report.skipped) return null;

  const leftovers = leftoverPunchFromNormalizeReport(report);
  const leftoverCount = leftoverCountFromNormalizeReport(report);
  const tagged = taggedPunchFromNormalizeReport(report);
  const verdict = templateRowPunchLabel(report);

  return (
    <div className="space-y-10" data-testid="template-normalize-punch">
      <div>
        <h2
          className="text-xl font-semibold tracking-tight text-[#2c3338]"
          data-testid="template-leftover"
          data-leftover-count={String(leftoverCount)}
        >
          {verdict}
        </h2>
        {leftoverCount > 0 ? (
          <p className="mt-2 text-[#5c6570]">{STILL_IN_THE_WORD}</p>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold tracking-tight text-[#2c3338]">
          Needs attention
          <span className="ml-1.5 tabular-nums text-[#5c6570]">({leftoverCount})</span>
        </h3>
        {leftoverCount === 0 ? null : (
          <ul className="mt-1 divide-y divide-[#2c3338]/10" data-testid="template-leftover-punch">
            {leftovers.map((row) => (
              <li
                key={row.id}
                data-punch-row=""
                data-leftover-id={row.id}
                className="flex items-center justify-between gap-4 py-2.5"
              >
                <span className="font-mono text-[13px] leading-6 text-[#2c3338]">
                  {wordBlankDisplay(row.before)}
                </span>
                <span className="shrink-0 text-xs text-[#5c6570]">{STILL_IN_THE_DRAFT}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="text-sm text-[#5c6570]" data-testid="template-tagged-disclosure">
        <summary className="cursor-pointer hover:text-[#2c3338]">Tagged</summary>
        {tagged.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {tagged.map((row, idx) => (
              <li
                key={`${row.code}-${row.after ?? row.before ?? idx}`}
                className="font-mono text-[13px]"
              >
                {row.after || row.before}
              </li>
            ))}
          </ul>
        ) : null}
      </details>

      <p className="border-t border-[#2c3338]/12 pt-6 text-sm text-[#5c6570]">{CLEAN_FOOTER}</p>
    </div>
  );
}
