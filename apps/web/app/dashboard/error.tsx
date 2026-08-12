"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[400px] items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h2 className="text-xl font-semibold tracking-tight">Dashboard Error</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading this section. The error has been logged.
        </p>
        <button
          onClick={() => reset()}
          className="mt-4 rounded-md border px-4 py-2 text-sm hover:bg-accent"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
