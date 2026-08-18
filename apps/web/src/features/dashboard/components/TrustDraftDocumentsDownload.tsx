"use client";

import { useState } from "react";

import { TrustDraftDownloadConfirmDialog } from "./TrustDraftDownloadConfirmDialog";
import {
  trustDraftDownloadConfirmPhrase,
  trustDraftStampedDownloadHref,
} from "./trust-draft-download-confirm";

/**
 * Documents-row download island for revocable_trust.
 * RSC page computes N; this client island only gates the stamp href.
 */
export function TrustDraftDocumentsDownload({
  fileKey,
  leftoverCount,
}: {
  fileKey: string;
  leftoverCount: number;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const stampedHref = trustDraftStampedDownloadHref(fileKey);
  const phrase = trustDraftDownloadConfirmPhrase(leftoverCount);

  return (
    <>
      <a
        href={stampedHref}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        download
        data-testid="trust-draft-download"
        data-leftover-count={String(leftoverCount)}
        onClick={(e) => {
          if (leftoverCount > 0) {
            e.preventDefault();
            setConfirmOpen(true);
          }
        }}
      >
        Download Trust DRAFT
      </a>
      {leftoverCount > 0 && (
        <TrustDraftDownloadConfirmDialog
          open={confirmOpen}
          leftoverCount={leftoverCount}
          phrase={phrase}
          downloadHref={stampedHref}
          onOpenChange={setConfirmOpen}
        />
      )}
    </>
  );
}
