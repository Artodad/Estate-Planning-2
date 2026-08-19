"use client";

import { useState, useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { uploadTemplateForCurrentFirm } from "@/features/dashboard/server/actions";
import type { DocumentType } from "@/features/documents/types";
import type {
  TemplateUploadNormalizeSummary,
  TemplateUploadSoftSuggestion,
} from "@/features/documents/template-normalize/types";

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
 * Soft (low-confidence) normalizer suggestions are human-gated: when present, the first submit
 * returns needsConfirmation (nothing persisted). The attorney multi-selects accepts (default: none),
 * then confirms — only accepted patches are applied before final validate + persist.
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

function SubmitButton({
  pendingLabel,
  label,
}: {
  pendingLabel: string;
  label: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? pendingLabel : label}
    </Button>
  );
}

function NormalizeReportPanel({
  report,
  variant,
}: {
  report: TemplateUploadNormalizeSummary;
  variant: "success" | "error" | "confirm";
}) {
  const hasChanges = report.repairCount > 0 || report.renameCount > 0;
  const headline =
    variant === "confirm"
      ? "Review soft suggestions before saving"
      : variant === "success"
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
      h.code === "SAMPLE_VALUE_SUGGESTION" ||
      h.code === "SAMPLE_VALUE_SUGGESTION_APPLIED",
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
        {report.softSuggestions.length > 0
          ? `, ${report.softSuggestions.length} soft suggestion${report.softSuggestions.length === 1 ? "" : "s"}`
          : ""}
        {variant === "success" && report.appliedSuggestionCount > 0
          ? ` (${report.appliedSuggestionCount} applied, ${report.leftAsSuggestionCount} left as suggestions)`
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

function SoftSuggestionPicker({
  suggestions,
  acceptedIds,
  onToggle,
}: {
  suggestions: TemplateUploadSoftSuggestion[];
  acceptedIds: Set<string>;
  onToggle: (id: string, checked: boolean) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-3" data-testid="soft-suggestion-picker">
      <div className="space-y-1">
        <p className="text-sm font-medium">Soft suggestions (optional)</p>
        <p className="text-[11px] text-muted-foreground">
          High-confidence repairs already ran. These low-confidence blanks are{" "}
          <span className="font-medium text-foreground/80">not</span> applied unless you
          check Accept. Unchecked items are left as-is in the template.
        </p>
      </div>
      <ul className="space-y-3">
        {suggestions.map((s) => {
          const checked = acceptedIds.has(s.id);
          return (
            <li
              key={s.id}
              className="rounded border border-border/70 px-3 py-2 text-xs"
              data-testid={`soft-suggestion-${s.id}`}
            >
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!s.applicable}
                  onChange={(e) => onToggle(s.id, e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border"
                />
                <span className="space-y-1">
                  <span className="block font-medium text-foreground/90">
                    {s.applicable ? "Accept proposed tag" : "Ignore only (no safe proposed tag)"}
                    {!s.applicable ? null : checked ? " — will apply" : " — leave as suggestion"}
                  </span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {s.before}
                    {s.after ? ` → ${s.after}` : ""}
                  </span>
                  <span className="block text-muted-foreground">{s.rationale}</span>
                  {s.ruleId ? (
                    <span className="block text-[10px] text-muted-foreground/80">
                      rule: {s.ruleId}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type RetainedMeta = {
  name: string;
  documentType: string;
  description: string;
  skipNormalize: boolean;
};

export function TemplateUploadForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [retainedFile, setRetainedFile] = useState<File | null>(null);
  const [retainedMeta, setRetainedMeta] = useState<RetainedMeta | null>(null);
  const [awaitingSoftConfirm, setAwaitingSoftConfirm] = useState(false);
  const [pendingSoftSuggestions, setPendingSoftSuggestions] = useState<
    TemplateUploadSoftSuggestion[]
  >([]);
  const [pendingReport, setPendingReport] = useState<TemplateUploadNormalizeSummary | null>(
    null,
  );
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  const [state, formAction] = useActionState<
    Awaited<ReturnType<typeof uploadTemplateForCurrentFirm>> | null,
    FormData
  >(
    async (_prevState, formData) => {
      // Capture metadata on first pass so confirm can resubmit (disabled fields are omitted).
      if (!formData.get("confirmSoftSuggestions")) {
        setRetainedMeta({
          name: String(formData.get("name") ?? ""),
          documentType: String(formData.get("documentType") ?? ""),
          description: String(formData.get("description") ?? ""),
          skipNormalize:
            formData.get("skipNormalize") === "on" ||
            formData.get("skipNormalize") === "true" ||
            formData.get("skipNormalize") === "1",
        });
      }
      // Re-attach retained file + meta when confirming soft suggestions.
      if (formData.get("confirmSoftSuggestions")) {
        if (!formData.get("file") && retainedFile) {
          formData.set("file", retainedFile);
        }
        if (retainedMeta) {
          if (!formData.get("name")) formData.set("name", retainedMeta.name);
          if (!formData.get("documentType")) {
            formData.set("documentType", retainedMeta.documentType);
          }
          if (!formData.get("description") && retainedMeta.description) {
            formData.set("description", retainedMeta.description);
          }
          if (retainedMeta.skipNormalize && !formData.get("skipNormalize")) {
            formData.set("skipNormalize", "true");
          }
        }
      }
      return await uploadTemplateForCurrentFirm(formData);
    },
    null,
  );
  const [selectedFileName, setSelectedFileName] = useState<string>("");

  useEffect(() => {
    if (!state) return;

    if ("needsConfirmation" in state && state.needsConfirmation) {
      setAwaitingSoftConfirm(true);
      setPendingSoftSuggestions(state.normalizeReport.softSuggestions);
      setPendingReport(state.normalizeReport);
      setAcceptedIds(new Set()); // default: nothing soft applied
      toast.message("Review soft suggestions, then confirm upload.", {
        description: "Nothing was saved yet. Accept only the replacements you want.",
      });
      return;
    }

    if ("success" in state && state.success) {
      setAwaitingSoftConfirm(false);
      setPendingSoftSuggestions([]);
      setPendingReport(null);
      setAcceptedIds(new Set());
      setRetainedFile(null);
      setRetainedMeta(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      if (state.normalizeReport?.skipped) {
        toast.success(
          "Template uploaded as-is (auto-normalize skipped). It is now available for Trust draft.",
        );
      } else {
        const repairs = state.normalizeReport?.repairCount ?? 0;
        const renames = state.normalizeReport?.renameCount ?? 0;
        const applied = state.normalizeReport?.appliedSuggestionCount ?? 0;
        const left = state.normalizeReport?.leftAsSuggestionCount ?? 0;
        const softNote =
          applied + left > 0 ? ` Soft: ${applied} applied, ${left} left as suggestions.` : "";
        toast.success(
          repairs + renames > 0
            ? `Template uploaded and normalized (${repairs} repairs, ${renames} renames).${softNote}`
            : `Template uploaded successfully.${softNote}`,
        );
      }
      setSelectedFileName("");
    }

    if ("error" in state && state.error) {
      // Keep soft-confirm UI if we were confirming and validation failed after apply
      if (!awaitingSoftConfirm) {
        setPendingSoftSuggestions([]);
        setPendingReport(null);
      }
    }
  }, [state, awaitingSoftConfirm]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setSelectedFileName(f ? f.name : "");
    setRetainedFile(f);
    setRetainedMeta(null);
    setAwaitingSoftConfirm(false);
    setPendingSoftSuggestions([]);
    setPendingReport(null);
    setAcceptedIds(new Set());
  };

  const normalizeReport =
    state && "normalizeReport" in state ? state.normalizeReport : undefined;
  const showConfirm = awaitingSoftConfirm && pendingSoftSuggestions.length > 0;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="file">Template file (.docx)</Label>
            <Input
              ref={fileInputRef}
              id="file"
              name="file"
              type="file"
              accept=".docx"
              required={!retainedFile}
              onChange={handleFileChange}
              className="cursor-pointer"
              disabled={showConfirm}
            />
            {selectedFileName && (
              <p className="text-xs text-muted-foreground">Selected: {selectedFileName}</p>
            )}
            <p className="text-[10px] text-muted-foreground">
              Max 8MB. On upload we repair split tags, rename known aliases, and validate
              with docxtemplater. Soft blanks stay suggestions until you accept them.
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
              disabled={showConfirm}
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
              Must match the document type. Trust draft uses Revocable Living Trust.
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
            disabled={showConfirm}
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
            disabled={showConfirm}
          />
        </div>

        <div className="flex items-start gap-2">
          <input
            id="skipNormalize"
            name="skipNormalize"
            type="checkbox"
            value="true"
            className="mt-1 h-4 w-4 rounded border"
            disabled={showConfirm}
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

        {showConfirm && pendingReport && (
          <WarningCallout>
            <div className="space-y-4">
              <NormalizeReportPanel report={pendingReport} variant="confirm" />
              <SoftSuggestionPicker
                suggestions={pendingSoftSuggestions}
                acceptedIds={acceptedIds}
                onToggle={(id, checked) => {
                  setAcceptedIds((prev) => {
                    const next = new Set(prev);
                    if (checked) next.add(id);
                    else next.delete(id);
                    return next;
                  });
                }}
              />
              {/* Controlled checkboxes above are the source of truth; mirror for FormData */}
              {Array.from(acceptedIds).map((id) => (
                <input key={id} type="hidden" name="acceptedSuggestionIds" value={id} />
              ))}
              <input type="hidden" name="confirmSoftSuggestions" value="true" />
              {retainedMeta && (
                <>
                  <input type="hidden" name="name" value={retainedMeta.name} />
                  <input type="hidden" name="documentType" value={retainedMeta.documentType} />
                  {retainedMeta.description ? (
                    <input type="hidden" name="description" value={retainedMeta.description} />
                  ) : null}
                  {retainedMeta.skipNormalize ? (
                    <input type="hidden" name="skipNormalize" value="true" />
                  ) : null}
                </>
              )}
              <p className="text-[11px] text-muted-foreground">
                Confirm to save normalized bytes
                {acceptedIds.size > 0
                  ? ` with ${acceptedIds.size} accepted soft replacement${acceptedIds.size === 1 ? "" : "s"}`
                  : " (all soft suggestions left as-is)"}
                . Your original file is kept as <code>*.original.docx</code>.
              </p>
            </div>
          </WarningCallout>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <SubmitButton
            pendingLabel={
              showConfirm ? "Confirming upload..." : "Uploading & normalizing..."
            }
            label={showConfirm ? "Confirm upload" : "Upload Template"}
          />
          {showConfirm && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setAwaitingSoftConfirm(false);
                setPendingSoftSuggestions([]);
                setPendingReport(null);
                setAcceptedIds(new Set());
              }}
            >
              Cancel review
            </Button>
          )}
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
              normalizeReport.warningCount > 0 ||
              normalizeReport.leftAsSuggestionCount > 0 ? (
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
        After upload, open a completed intake and generate a Trust draft.
        The resolver will pick up templates by documentType automatically.
      </p>
    </div>
  );
}
