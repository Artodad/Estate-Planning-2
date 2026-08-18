"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Stable Dialog hook for Trust-draft download confirm.
 * Designer restyles this surface only — do not restyle the dashboard around it.
 *
 * Slots:
 *   data-slot="trust-draft-download-confirm"
 *   data-slot="trust-draft-download-confirm-phrase"
 *   data-slot="trust-draft-download-confirm-cancel"
 *   data-slot="trust-draft-download-confirm-proceed"
 */
export function TrustDraftDownloadConfirmDialog({
  open,
  leftoverCount,
  phrase,
  downloadHref,
  onOpenChange,
}: {
  open: boolean;
  leftoverCount: number;
  phrase: string;
  downloadHref: string;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        data-slot="trust-draft-download-confirm"
        data-testid="trust-draft-download-confirm"
        data-leftover-count={String(leftoverCount)}
        className="gap-5 sm:max-w-md"
      >
        <DialogHeader className="gap-3 pr-0">
          <DialogTitle
            data-slot="trust-draft-download-confirm-phrase"
            className="text-lg leading-snug tracking-tight"
          >
            {phrase}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            You reviewed the holes. This download records that you sent the draft
            with those leftovers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" data-slot="trust-draft-download-confirm-cancel">
              Cancel
            </Button>
          </DialogClose>
          <Button asChild>
            <a
              href={downloadHref}
              download
              data-slot="trust-draft-download-confirm-proceed"
              data-testid="trust-draft-download-confirm-proceed"
              onClick={() => onOpenChange(false)}
            >
              Download anyway
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
