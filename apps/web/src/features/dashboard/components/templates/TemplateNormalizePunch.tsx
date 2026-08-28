import type { TemplateUploadNormalizeSummary } from "@/features/documents/template-normalize/types";

import {
  leftoverPunchFromNormalizeReport,
  taggedCountFromNormalizeReport,
  templateRowPunchLabel,
} from "../normalize-report-punch-list";

/**
 * Tagged vs still-blank leftover punch from a persisted normalize report.
 * Confirm copy stays here — never written into the .docx.
 */
export function TemplateNormalizePunch({
  report,
}: {
  report: TemplateUploadNormalizeSummary | null;
}) {
  if (!report || report.skipped) {
    return (
      <p className="text-sm text-[#5c6570]" data-testid="template-normalize-punch-empty">
        No leftover punch stored for this template.
      </p>
    );
  }

  const leftovers = leftoverPunchFromNormalizeReport(report);
  const tagged = taggedCountFromNormalizeReport(report);
  const punchLabel = templateRowPunchLabel(report);

  return (
    <div className="space-y-3" data-testid="template-normalize-punch">
      <p
        className="text-sm font-medium tabular-nums text-[#2c3338]"
        data-testid="template-punch-label"
        data-leftover-count={String(leftovers.length)}
        data-tagged-count={String(tagged)}
      >
        {punchLabel}
      </p>
      <p className="text-xs text-[#5c6570]">
        {leftovers.length > 0
          ? "Still-blank leftovers stay in the .docx. Tag them in Word or accept them on re-upload before generating for a client."
          : "No leftover blanks. This Trust .docx is ready to generate a draft for attorney review."}
      </p>
      {leftovers.length > 0 ? (
        <ul className="divide-y divide-[#2c3338]/10" data-testid="template-leftover-punch">
          {leftovers.map((row) => (
            <li
              key={row.id}
              data-punch-row=""
              data-leftover-id={row.id}
              className="py-2 text-sm"
            >
              <div className="font-mono text-xs text-[#2c3338]">
                {row.before}
                {row.after ? ` → ${row.after}` : ""}
              </div>
              <div className="text-xs text-[#5c6570]">{row.rationale}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
