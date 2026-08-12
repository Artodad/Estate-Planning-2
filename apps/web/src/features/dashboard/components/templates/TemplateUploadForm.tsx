"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { uploadTemplateForCurrentFirm } from "@/features/dashboard/server/actions";
import type { DocumentType } from "@/features/documents/types";
import type { TemplateUploadNormalizeSummary } from "@/features/documents/template-normalize/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ErrorCallout,
  SuccessCallout,
  WarningCallout,
  InfoCallout,
} from "@/components/ui/callouts";
import { toast } from "sonner";

/**
 * Client Component: TemplateUploadForm
 *
 * Minimal owner-only form for uploading a real attorney .docx template.
 * Uses the exact same patterns as OnboardingForm / InviteClientForm (useActionState + FormData + sonner).
 *
 * The Server Action (uploadTemplateForCurrentFirm) performs all RBAC, validation, normalization,
 * storage, DB create, audit, and revalidatePath. This component only renders the form + result feedback.
 *
 * After successful upload the parent server page (via revalidate) will show the new row.
 * A normalize report summary is shown so attorneys can see repairs/renames without alarm.
 */

const DOCUMENT_TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: "revocable_trust", label: "Revocable Living Trust" },
  { value: "pour_over_will", label: "Pour-Over Will" },
  { value: "durable_poa", label: "Durable Power of Attorney" },
  { value: "healthcare_directive", label: "Advance Healthcare Directive" },
  { value: "hipaa", label: "HIPAA Authorization" },
  { value: "certificate_of_trust", label: "Certificate of Trust" },
  { value: "personal_property_memo", label: "Personal Property Memorandum" },
  { value: "trust_funding", label: "Trust Funding Instructions" },
];

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Uploading & normalizing..." : "Upload Template"}
    </Button>
  );
}

function NormalizeReportPanel({
  report,
  variant,
}: {
  report: TemplateUploadNormalizeSummary;
  variant: "success" | "error";
}) {
  const hasChanges = report.repairCount > 0 || report.renameCount > 0;
  const headline = variant === "success"
    ? hasChanges
      ? "Template normalized and ready for generation."
      : "Template validated — no structural changes needed."
    : "Normalization report (upload not saved)";

  const highlightItems = report.highlights.filter(
    (h) =>
      h.kind === "repair" ||
      h.kind === "rename" ||
      h.kind === "warning" ||
      h.kind === "error" ||
      h.code === "SAMPLE_VALUE_SUGGESTION",
  );

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">{headline}</p>
      <p className="text-muted-foreground">
        {report.repairCount} repair{report.repairCount === 1 ? "" : "s"},{" "}
        {report.renameCount} rename{report.renameCount === 1 ? "" : "s"}
        {report.warningCount > 0
          ? `, ${report.warningCount} warning${report.warningCount === 1 ? "" : "s"}`
          : ""}
        {report.validation?.missingTags?.length
          ? `, ${report.validation.missingTags.length} tag(s) without fixture values`
          : ""}
        .
      </p>
      {highlightItems.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {highlightItems.slice(0, 8).map((item, idx) => (
            <li key={`${item.code}-${idx}`}>
              <span className="font-medium text-foreground/80">{item.code}</span>
              {": "}
              {item.message}
              {item.before && item.after ? (
                <span className="block font-mono text-[10px] opacity-80">
                  {item.before} → {item.after}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {report.validation?.syntaxErrors && report.validation.syntaxErrors.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-xs">
          {report.validation.syntaxErrors.slice(0, 6).map((err, idx) => (
            <li key={`syntax-${idx}`}>{err}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TemplateUploadForm() {
  const [state, formAction] = useActionState<
    Awaited<ReturnType<typeof uploadTemplateForCurrentFirm>> | null,
    FormData
  >(
    async (_prevState, formData) => {
      return await uploadTemplateForCurrentFirm(formData);
    },
    null
  );
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  // Handle success side-effects (toast + clear file name display)
  useEffect(() => {
    if (state && "success" in state && state.success) {
      if (state.normalizeReport?.skipped) {
        toast.success(
          "Template uploaded as-is (auto-normalize skipped). It is now available for document generation.",
        );
      } else {
        const repairs = state.normalizeReport?.repairCount ?? 0;
        const renames = state.normalizeReport?.renameCount ?? 0;
        toast.success(
          repairs + renames > 0
            ? `Template uploaded and normalized (${repairs} repairs, ${renames} renames).`
            : "Template uploaded successfully. It is now available for document generation.",
        );
      }
      setSelectedFileName("");
      // The parent RSC list will be fresh because the action called revalidatePath.
    }
  }, [state]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setSelectedFileName(f ? f.name : "");
  };

  const normalizeReport =
    state && "normalizeReport" in state ? state.normalizeReport : undefined;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="file">Template file (.docx)</Label>
            <Input
              id="file"
              name="file"
              type="file"
              accept=".docx"
              required
              onChange={handleFileChange}
              className="cursor-pointer"
            />
            {selectedFileName && (
              <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Max 8MB. On upload we repair split tags, rename known aliases, and validate
              with docxtemplater. Your legal language and formatting stay intact.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="documentType">Document type</Label>
            <select
              id="documentType"
              name="documentType"
              required
              className="w-full rounded border bg-background px-3 py-2 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Select document type…
              </option>
              {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground">
              Must match the type used in generation (the 8 canonical estate plan docs).
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">Template name</Label>
          <Input
            id="name"
            name="name"
            placeholder='e.g. "Austin Revocable Trust v2 - CA 2025"'
            required
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <textarea
            id="description"
            name="description"
            rows={2}
            placeholder="Notes for your team (version, effective date, special clauses, etc.)"
            className="w-full rounded border bg-background px-3 py-2 text-sm"
            maxLength={500}
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id="skipNormalize"
            name="skipNormalize"
            type="checkbox"
            value="true"
            className="mt-1 h-4 w-4 rounded border"
          />
          <div className="space-y-1">
            <Label htmlFor="skipNormalize" className="font-normal leading-snug">
              Skip auto-normalize (template already prepared)
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Default is off: we repair split tags, rename known aliases, validate, and keep a
              <code className="mx-0.5">*.original.docx</code> side file. Check this only if the
              .docx is already docxtemplater-ready — bytes are stored as uploaded with no
              normalize report or original side file.
            </p>
          </div>
        </div>

        <div className="pt-1">
          <SubmitButton />
        </div>

        {/* Result feedback (server action return) */}
        {state && "error" in state && state.error && (
          <ErrorCallout role="alert">
            <div className="space-y-2 whitespace-pre-wrap">{state.error}</div>
            {normalizeReport && (
              <div className="mt-3 border-t border-red-200/60 pt-2 dark:border-red-900/40">
                <NormalizeReportPanel report={normalizeReport} variant="error" />
              </div>
            )}
          </ErrorCallout>
        )}
        {state && "success" in state && state.success && (
          <>
            <SuccessCallout role="status">
              {normalizeReport?.skipped
                ? "Template registered as uploaded (auto-normalize skipped). Generation will use these exact bytes."
                : "Template registered. Normalized bytes are stored as the active template for generation; your original file is kept alongside for audit."}
            </SuccessCallout>
            {normalizeReport && !normalizeReport.skipped && (
              normalizeReport.warningCount > 0 ? (
                <WarningCallout>
                  <NormalizeReportPanel report={normalizeReport} variant="success" />
                </WarningCallout>
              ) : (
                <InfoCallout>
                  <NormalizeReportPanel report={normalizeReport} variant="success" />
                </InfoCallout>
              )
            )}
          </>
        )}
      </form>

      <p className="text-[10px] text-muted-foreground border-t pt-3">
        After upload, go to any client with a completed intake and click “Generate Full Estate Plan”.
        The resolver will pick up templates by documentType automatically.
      </p>
    </div>
  );
}
