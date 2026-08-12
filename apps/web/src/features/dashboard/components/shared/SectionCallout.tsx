"use client";

import { cn } from "@/lib/utils";

/**
 * SectionCallout
 *
 * Prominent but non-alarming banner used at the top of every scaffold / mock-data section.
 * Mandatory per Design Document §3 for Clients and all stubs.
 *
 * Variants:
 * - "warning" (default): amber/yellow for mock data
 * - "info": subtle blue for coming-soon placeholders
 */
interface SectionCalloutProps {
  children: React.ReactNode;
  variant?: "warning" | "info";
  className?: string;
}

export function SectionCallout({
  children,
  variant = "warning",
  className,
}: SectionCalloutProps) {
  const base =
    "rounded-md border px-4 py-2.5 text-sm flex items-start gap-2";

  const styles =
    variant === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
      : "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200";

  return (
    <div className={cn(base, styles, className)} role="status">
      <div className="mt-0.5 shrink-0 text-base leading-none">⚠️</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
