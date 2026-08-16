"use client";

import { useState } from "react";

import { generateDocumentForIntake } from "@/features/dashboard/server/actions";
import { GenerationErrorBoundary } from "@/features/dashboard/components/GenerationErrorBoundary";
import { ErrorCallout } from "@/components/ui/callouts";
import { Button } from "@/components/ui/button";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import { buildGenerateTrustDraftParams } from "./generate-trust-draft";

export { buildGenerateTrustDraftParams, TRUST_DRAFT_DOCUMENT_TYPE } from "./generate-trust-draft";

/**
 * Single-doc Trust Family draft CTA.
 * Calls generateDocumentForIntake (not the 8-doc ZIP package).
 */
export function GenerateTrustDraftButton({ intakeId }: { intakeId: string }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fileKey: string } | null>(null);

  async function handleGenerate() {
    if (!intakeId) {
      setError("This intake session is missing an id.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setResult(null);

    try {
      const res = await generateDocumentForIntake(buildGenerateTrustDraftParams(intakeId));
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setResult({ fileKey: res.generated.fileKey });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trust draft generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <RoleGuard allowed={OWNER_STAFF}>
      <GenerationErrorBoundary>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium">Trust Family draft</div>
              <div className="text-xs text-muted-foreground">
                Fills one Revocable Living Trust DRAFT from this intake. For attorney review only.
              </div>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !intakeId}
              size="lg"
            >
              {isGenerating ? "Generating Trust draft…" : "Generate Trust draft"}
            </Button>
          </div>

          {error && <ErrorCallout className="mt-3">{error}</ErrorCallout>}

          {result && (
            <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <div className="font-semibold">Trust draft generated</div>
              <a
                href={`/api/documents/download?fileKey=${encodeURIComponent(result.fileKey)}`}
                className="mt-2 inline-flex items-center rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                download
              >
                Download Trust DRAFT
              </a>
              <p className="mt-2 text-[10px] text-emerald-600">
                Visible DRAFT watermark. Exact fidelity to your attorney Trust Family template.
              </p>
            </div>
          )}
        </div>
      </GenerationErrorBoundary>
    </RoleGuard>
  );
}
