"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface CalloutProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "error" | "success" | "info" | "warning";
}

/**
 * Reusable callout components for consistent error/success/info feedback.
 * Extracted during Wave B (Error Handling, Monitoring & Polish) to replace
 * repeated ad-hoc divs across the app (ClientsList, client detail, forms, etc.).
 *
 * These are intentionally lightweight and do not depend on sonner.
 * Use <Toaster /> + toast() from sonner for transient notifications.
 */

export function Callout({ className, variant = "info", children, ...props }: CalloutProps) {
  const variantClasses = {
    error: "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
    info: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300",
    warning: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300",
  };

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "rounded border p-3 text-sm",
        variantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function ErrorCallout(props: Omit<CalloutProps, "variant">) {
  return <Callout variant="error" {...props} />;
}

export function SuccessCallout(props: Omit<CalloutProps, "variant">) {
  return <Callout variant="success" {...props} />;
}

export function InfoCallout(props: Omit<CalloutProps, "variant">) {
  return <Callout variant="info" {...props} />;
}

export function WarningCallout(props: Omit<CalloutProps, "variant">) {
  return <Callout variant="warning" {...props} />;
}
