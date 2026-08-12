"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import { uploadTemplateForCurrentFirm } from "@/features/dashboard/server/actions";
import type { DocumentType } from "@/features/documents/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorCallout, SuccessCallout } from "@/components/ui/callouts";
import { toast } from "sonner";

/**
 * Client Component: TemplateUploadForm
 *
 * Minimal owner-only form for uploading a real attorney .docx template.
 * Uses the exact same patterns as OnboardingForm / InviteClientForm (useActionState + FormData + sonner).
 *
 * The Server Action (uploadTemplateForCurrentFirm) performs all RBAC, validation, storage,
 * DB create, audit, and revalidatePath. This component only renders the form + result feedback.
 *
 * After successful upload the parent server page (via revalidate) will show the new row.
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
      {pending ? "Uploading template..." : "Upload Template"}
    </Button>
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
      toast.success("Template uploaded successfully. It is now available for document generation.");
      setSelectedFileName("");
      // The parent RSC list will be fresh because the action called revalidatePath.
    }
  }, [state]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setSelectedFileName(f ? f.name : "");
  };

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
              Max 8MB. Your original formatting, styles, and language are preserved exactly.
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

        <div className="pt-1">
          <SubmitButton />
        </div>

        {/* Result feedback (server action return) */}
        {state && "error" in state && state.error && (
          <ErrorCallout role="alert">{state.error}</ErrorCallout>
        )}
        {state && "success" in state && state.success && (
          <SuccessCallout role="status">
            Template registered. It will appear in the list below and can be used immediately for generation.
          </SuccessCallout>
        )}
      </form>

      <p className="text-[10px] text-muted-foreground border-t pt-3">
        After upload, go to any client with a completed intake and click “Generate Full Estate Plan”.
        The resolver will pick up templates by documentType automatically.
      </p>
    </div>
  );
}
