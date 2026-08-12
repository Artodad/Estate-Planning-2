"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { useDashboardNav } from "@/features/dashboard/hooks/useDashboardNav";
import { AppSidebar } from "./sidebar/AppSidebar";
import { MobileNavDrawer } from "./sidebar/MobileNavDrawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ErrorCallout } from "@/components/ui/callouts";

/**
 * DashboardShell
 *
 * The core reusable layout component for the attorney dashboard (Sub-agent B).
 *
 * Responsibilities (exact per Design Document §2):
 * - Desktop (md+): Fixed AppSidebar on left.
 * - Mobile (<md): Hamburger in internal top bar → opens custom MobileNavDrawer (slide-in from left).
 * - Internal top bar / page title strip (below global AuthHeader).
 * - Main content area with generous padding, max-width container.
 * - Fully hydration-safe via useDashboardNav + existing RoleGuard / useRole primitives.
 * - Composes cleanly around global AuthHeader (never touches or duplicates it).
 * - All future dashboard pages render as {children} inside the <main>.
 *
 * Usage (from dashboard/layout.tsx):
 *   <DashboardShell>{children}</DashboardShell>
 *
 * The shell owns no auth logic itself — it delegates entirely to:
 *   - useDashboardNav (role filtering)
 *   - RoleGuard / requireRole (in pages + layout)
 */
interface DashboardShellProps {
  children: React.ReactNode;
}

function getPageTitle(pathname: string | null): string {
  if (!pathname) return "Dashboard";
  if (pathname === "/dashboard" || pathname === "/dashboard/") return "Overview";
  if (pathname.startsWith("/dashboard/clients")) return "Clients";
  if (pathname.startsWith("/dashboard/intakes")) return "Intakes";
  if (pathname.startsWith("/dashboard/documents")) return "Documents";
  if (pathname.startsWith("/dashboard/templates")) return "Templates";
  return "Dashboard";
}

/**
 * UrlErrorBanner (Wave B4)
 * Client component that reads ?error= from URL (set by requireRole redirects etc.)
 * and renders a dismissible standardized ErrorCallout.
 * Friendly messages for known codes; falls back gracefully.
 * Mounted once in DashboardShell for all dashboard surfaces.
 */
function UrlErrorBanner() {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const errorCode = searchParams?.get("error");

  if (!errorCode || dismissed) return null;

  const friendly: Record<string, string> = {
    "insufficient-permissions": "You do not have permission to access that resource. (Owner or staff role required.)",
    unauthorized: "Authentication required or session expired. Please sign in again.",
    "client-not-found": "The requested client was not found or does not belong to your firm.",
    "intake-not-found": "The requested intake session was not found or is not accessible.",
    "template-not-found": "The requested template was not found for your firm.",
  };

  const message = friendly[errorCode] || `An error occurred: ${errorCode}. Please try again or contact support.`;

  return (
    <div className="border-b bg-background px-4 py-2 md:px-6">
      <div className="mx-auto max-w-7xl">
        <ErrorCallout className="flex items-start justify-between gap-3">
          <span>{message}</span>
          <button
            onClick={() => setDismissed(true)}
            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
            aria-label="Dismiss error banner"
          >
            <X className="h-4 w-4" />
          </button>
        </ErrorCallout>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const { isHydrated } = useDashboardNav();

  const title = getPageTitle(pathname);

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Desktop fixed sidebar (role-aware items inside) */}
      <AppSidebar />

      {/* Main column: internal header bar + scrollable content */}
      <div className="flex flex-1 flex-col md:pl-64">
        {/* Internal dashboard header bar (title + mobile hamburger) */}
        <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur md:px-6">
          <div className="flex items-center gap-3">
            {/* Mobile hamburger — only visible < md */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </Button>

            <h1 className="text-lg font-semibold tracking-tight md:text-xl">
              {title}
            </h1>
          </div>

          {/* Right side of internal bar — room for future quick actions / user context (kept minimal for B) */}
          <div className="text-xs text-muted-foreground hidden sm:block">
            {isHydrated ? "Attorney Dashboard" : "Loading..."}
          </div>
        </div>

        {/* Wave B (Phase 6): Global URL error banner — consumes ?error= set by requireRole / redirects.
            Dismissible, uses standardized ErrorCallout. Covers common codes from RBAC + pages. */}
        <UrlErrorBanner />

        {/* Primary content area */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 md:p-6 lg:p-8">
            {children}
          </div>

          {/* Wave C5: Subtle persistent legal disclaimer footer (visible on all dashboard surfaces).
              Reinforces attorney control + DRAFT nature. Typography uses muted tokens for non-intrusive polish. */}
          <footer className="mx-auto max-w-7xl border-t px-4 py-3 text-[11px] text-muted-foreground md:px-6 lg:px-8">
            All generated documents are <strong>DRAFT</strong> — for attorney professional review only. This tool does not provide legal advice and does not create an attorney-client relationship.
          </footer>
        </main>
      </div>

      {/* Mobile drawer (controlled by shell state) */}
      <MobileNavDrawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
    </div>
  );
}
