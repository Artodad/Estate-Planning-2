"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
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
        data-slot="trust-draft-download-confirm"
        data-testid="trust-draft-download-confirm"
        data-leftover-count={String(leftoverCount)}
      >
        <DialogHeader>
          <DialogTitle data-slot="trust-draft-download-confirm-phrase">
            {phrase}
          </DialogTitle>
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
              {phrase}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
