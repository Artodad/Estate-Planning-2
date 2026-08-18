"use client";

import { useState } from "react";

import { generateDocumentForIntake } from "@/features/dashboard/server/actions";
import { GenerationErrorBoundary } from "@/features/dashboard/components/GenerationErrorBoundary";
import { ErrorCallout } from "@/components/ui/callouts";
import { Button } from "@/components/ui/button";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import { buildGenerateTrustDraftParams } from "./generate-trust-draft";
import type { StoredTrustDraft } from "./generate-trust-draft";
import { TrustDraftFillReport } from "./TrustDraftFillReport";

export { buildGenerateTrustDraftParams, TRUST_DRAFT_DOCUMENT_TYPE } from "./generate-trust-draft";

/**
 * Single-doc Trust Family draft CTA.
 * Calls generateDocumentForIntake (not the 8-doc ZIP package).
 * `initialDraft` is the stored GeneratedDocument row (reload), not a client-rebuilt report.
 */
export function GenerateTrustDraftButton({
  intakeId,
  initialDraft = null,
}: {
  intakeId: string;
  initialDraft?: StoredTrustDraft | null;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StoredTrustDraft | null>(initialDraft);

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
      setResult({ fileKey: res.generated.fileKey, fillReport: res.generated.fillReport });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trust draft generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <RoleGuard allowed={OWNER_STAFF}>
      <GenerationErrorBoundary>
        <section className="space-y-4 border-t pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">Generate Trust draft</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Next step after intake: fill one Revocable Living Trust from these answers.
                The file is watermarked DRAFT — for attorney review only.
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !intakeId}
              size="lg"
              className="shrink-0"
            >
              {isGenerating ? "Generating Trust draft…" : "Generate Trust draft"}
            </Button>
          </div>

          {error && <ErrorCallout>{error}</ErrorCallout>}

          {result && (
            <div className="space-y-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Trust draft is ready</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Download the DRAFT, then clear any holes below. Every page is watermarked
                    for attorney review only.
                  </p>
                </div>
                <a
                  href={`/api/documents/download?fileKey=${encodeURIComponent(result.fileKey)}`}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  download
                >
                  Download Trust DRAFT
                </a>
              </div>
              {result.fillReport && <TrustDraftFillReport report={result.fillReport} />}
            </div>
          )}
        </section>
      </GenerationErrorBoundary>
    </RoleGuard>
  );
}
