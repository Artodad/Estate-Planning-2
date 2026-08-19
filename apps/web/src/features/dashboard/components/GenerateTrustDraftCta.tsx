"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { generateDocumentForIntake } from "@/features/dashboard/server/actions";
import { GenerationErrorBoundary } from "@/features/dashboard/components/GenerationErrorBoundary";
import { ErrorCallout } from "@/components/ui/callouts";
import { Button } from "@/components/ui/button";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import { buildGenerateTrustDraftParams } from "./generate-trust-draft";

/**
 * Thin Trust-draft generate for client-detail. Same click path as intake
 * (generateDocumentForIntake + buildGenerateTrustDraftParams). After success,
 * refresh so the existing #37 Trust row is the only review surface — this
 * island does not own a punch list.
 */
export function GenerateTrustDraftCta({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!intakeId) {
      setError("This intake session is missing an id.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await generateDocumentForIntake(buildGenerateTrustDraftParams(intakeId));
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Trust draft generation failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <RoleGuard allowed={OWNER_STAFF}>
      <GenerationErrorBoundary>
        <div className="space-y-2">
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !intakeId}
            size="sm"
          >
            {isGenerating ? "Generating Trust draft…" : "Generate Trust draft"}
          </Button>
          {error && <ErrorCallout>{error}</ErrorCallout>}
        </div>
      </GenerationErrorBoundary>
    </RoleGuard>
  );
}
