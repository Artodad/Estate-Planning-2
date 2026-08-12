"use client";

import type { DocumentStatus } from "../../types";
import { getDocumentsStatusLabel, getDocumentsStatusClass } from "../clients/MockClientData";

/**
 * StatusBadge
 *
 * Reusable, professional badge for client document / intake status.
 * Colors are attorney-appropriate (emerald=ready, amber=pending, etc.).
 *
 * SCAFFOLD — purely presentational. Will map to real status enums later.
 */
interface StatusBadgeProps {
  status: DocumentStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        getDocumentsStatusClass(status),
        className || "",
      ].join(" ")}
    >
      {getDocumentsStatusLabel(status)}
    </span>
  );
}
