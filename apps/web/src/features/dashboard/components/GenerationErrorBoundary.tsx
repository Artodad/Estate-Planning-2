"use client";

import * as Sentry from "@sentry/nextjs";
import React from "react";

interface GenerationErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onReset?: () => void;
}

/**
 * Error boundary specifically for document generation flows.
 * Recommended by Phase 6 Error Handling research for the highest-risk attorney action.
 *
 * Usage:
 *   <GenerationErrorBoundary>
 *     <GenerateFullPlanButton ... />
 *   </GenerationErrorBoundary>
 */
export class GenerationErrorBoundary extends React.Component<
  GenerationErrorBoundaryProps,
  { hasError: boolean; error?: Error }
> {
  constructor(props: GenerationErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Send to Sentry with context
    Sentry.captureException(error, {
      tags: {
        boundary: "generation",
      },
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300" role="alert">
          <div className="font-medium">Document generation encountered an issue.</div>
          <p className="mt-1 text-xs">
            Your intake data is safe. Please try again or contact your attorney if the problem persists.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-3 rounded border border-red-300 px-3 py-1 text-xs hover:bg-red-100 dark:hover:bg-red-950"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
