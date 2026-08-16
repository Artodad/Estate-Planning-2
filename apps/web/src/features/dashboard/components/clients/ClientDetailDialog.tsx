"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import type { MockClient } from "../../types";
import {
  getDocumentsStatusLabel,
  formatLastActivity,
  getIntakeProgressClass,
} from "./MockClientData";
import { StatusBadge } from "../shared/StatusBadge";

/**
 * ClientDetailDialog
 *
 * Modal detail view for a single client (sample or real-normalized; opened from table/"View").
 * Generate Documents & Start/Resume Intake stay OWNER_STAFF gated.
 */
interface ClientDetailDialogProps {
  client: MockClient;
  trigger?: React.ReactNode; // optional custom trigger; falls back to text button
  onAction?: (action: string, client: MockClient) => void; // for parent to show feedback
}

export function ClientDetailDialog({
  client,
  trigger,
  onAction,
}: ClientDetailDialogProps) {
  const [internalFeedback, setInternalFeedback] = useState<string | null>(null);

  const isSampleRecord = client.id?.startsWith("cli_");

  const handleAction = (action: string) => {
    setInternalFeedback(`${action} for ${client.name}.`);
    onAction?.(action, client);
    setTimeout(() => setInternalFeedback(null), 4000);
  };

  const relativeActivity = formatLastActivity(client.lastActivityISO);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            View Details
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{client.name}</DialogTitle>
          <DialogDescription>
            {client.email} • Last activity: {relativeActivity}
          </DialogDescription>
        </DialogHeader>

        {isSampleRecord && (
          <p className="text-xs text-muted-foreground">
            Sample matter — create a client to run intake and generation on a real record.
          </p>
        )}

        {/* Key metrics row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Intake Progress
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">
                {client.intakeProgress}
              </span>
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Progress
              value={client.intakeProgress}
              className="mt-2 h-2"
              // Note: Progress component may not support indicator color via class easily; we show text color cue
            />
            <div
              className={`mt-1 text-[10px] font-medium ${getIntakeProgressClass(client.intakeProgress).replace("bg-", "text-")}`}
            >
              {client.intakeProgress === 100
                ? "Complete"
                : client.intakeProgress === 0
                  ? "Not started"
                  : "In progress"}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Documents
            </div>
            <div className="mt-2">
              <StatusBadge status={client.documentsStatus} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {getDocumentsStatusLabel(client.documentsStatus)}
            </div>
          </div>

          <div className="rounded-lg border p-3">
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              Assigned
            </div>
            <div className="mt-1 font-medium">
              {client.assignedAttorney ?? "Unassigned"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Attorney on the matter</div>
          </div>
        </div>

        {/* Notes / matter summary */}
        {client.notes && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Matter notes
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed text-foreground">
              {client.notes}
            </div>
          </div>
        )}

        {isSampleRecord && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <span>Sample intake snapshot</span>
              <span className="font-normal normal-case">12 of 18 answered</span>
            </div>
            <div className="rounded border p-3 text-xs text-muted-foreground">
              <ul className="list-disc space-y-1 pl-4">
                <li>Primary residence: 1234 Oak Grove, San Francisco, CA</li>
                <li>Spouse / partner: Listed (community property election)</li>
                <li>Children / beneficiaries: 2 adult, 1 minor</li>
                <li>Successor trustees: Named (attorney + adult child)</li>
                <li>Healthcare agent: Spouse / adult child alternate</li>
                <li>Remaining sections include specific gifts and digital assets.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Internal action feedback (if any) */}
        {internalFeedback && (
          <div
            role="status"
            className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
          >
            {internalFeedback}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <RoleGuard allowed={OWNER_STAFF}>
            <Button
              variant="default"
              onClick={() => handleAction("Resume / Start Intake")}
            >
              Resume Intake
            </Button>
          </RoleGuard>

          <RoleGuard allowed={OWNER_STAFF}>
            <Button
              variant="secondary"
              onClick={() => handleAction("Generate Full Document Package")}
            >
              Generate Documents
            </Button>
          </RoleGuard>

          <Button
            variant="outline"
            onClick={() => handleAction("Send Reminder Email")}
          >
            Send Reminder
          </Button>

          <DialogClose asChild>
            <Button variant="ghost" className="ml-auto">
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
