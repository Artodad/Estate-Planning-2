"use client";

import { useState } from "react";

import { RoleGuard, OWNER_STAFF } from "@/features/auth";
import {
  deleteClientForCurrentFirm,
  updateClientForCurrentFirm,
} from "@/features/dashboard/server/actions";
import { ErrorCallout } from "@/components/ui/callouts";
import { Button } from "@/components/ui/button";

/**
 * Client island for notes + delete on client detail.
 * Generate Trust draft lives on GenerateTrustDraftCta — not here.
 */
export function GenerateAndNotes({
  clientId,
  clientDisplayName,
  initialNotes = "",
  onDelete,
}: {
  clientId: string;
  clientDisplayName: string;
  initialNotes?: string;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [notesSaved, setNotesSaved] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);

  // Wave B (Phase 6) — Replace native alert() on destructive delete with local error state
  // (explicit quick win from Error Handling research). Renders a visible red callout.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      const res = await updateClientForCurrentFirm(clientId, { notes: notes.trim() });
      if ("error" in res) {
        // Non-fatal for notes
        console.warn("Notes save failed:", res.error);
      }
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 2000);
    } finally {
      setNotesSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete client "${clientDisplayName}"? This cannot be undone.`)) return;
    setDeleteError(null);
    try {
      const res = await deleteClientForCurrentFirm(clientId);
      if ("error" in res) {
        setDeleteError(res.error || "Delete failed.");
        return;
      }
      onDelete();
    } catch {
      setDeleteError("Delete failed. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <div className="mb-2 text-sm font-medium">Internal notes</div>
        <textarea
          className="w-full rounded border p-2 text-sm"
          rows={4}
          placeholder="Key facts, referrals, special instructions for the matter..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSaveNotes} disabled={notesSaving}>
            {notesSaving ? "Saving..." : "Save Notes"}
          </Button>
          {notesSaved && <span className="text-xs text-emerald-600">Saved</span>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Visible only to your firm.
        </p>
      </div>

      {/* Light delete (owner/staff) */}
      <RoleGuard allowed={OWNER_STAFF}>
        <div>
          {deleteError && <ErrorCallout className="mb-2">{deleteError}</ErrorCallout>}
          <Button variant="destructive" onClick={handleDelete}>
            Delete Client
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            Confirmation required. This cannot be undone.
          </span>
        </div>
      </RoleGuard>
    </div>
  );
}
