"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

import { useDashboardNav } from "@/features/dashboard/hooks/useDashboardNav";
import { useFirm, useRole } from "@/features/auth";
import { NavLink } from "./NavLink";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * MobileNavDrawer
 *
 * Custom slide-in drawer for mobile/tablet (< md breakpoint).
 * - Slides from left (translate-x)
 * - Backdrop overlay with click-to-close
 * - Full nav list + firm/role footer (same as desktop sidebar)
 * - Esc key closes
 * - Excellent touch targets (py-3 etc)
 * - No external Sheet dependency (uses existing primitives only)
 *
 * Rendered inside DashboardShell when on mobile.
 */
export function MobileNavDrawer({ open, onClose }: MobileNavDrawerProps) {
  const { visibleNavItems, isActive, isHydrated, role } = useDashboardNav();
  const { currentFirm } = useFirm();
  const { isHydrated: roleHydrated } = useRole();

  const hydrated = isHydrated && roleHydrated;

  // Close on Escape
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Prevent body scroll when open (good UX)
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-[60] flex w-72 flex-col border-r bg-background shadow-xl transition-transform duration-200 ease-out md:hidden",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Dashboard navigation"
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b px-4 py-3 pt-16">
          <div className="text-sm font-semibold tracking-tight">Navigation</div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close navigation"
            className="size-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {!hydrated ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-9 animate-pulse rounded-md bg-muted/60"
                />
              ))}
            </div>
          ) : (
            visibleNavItems.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                isActive={isActive(item.href)}
                description={item.description}
                onClick={onClose} // close drawer after navigation
              />
            ))
          )}
        </nav>

        {/* Footer (mirrors desktop) */}
        <div className="border-t p-4 text-xs text-muted-foreground">
          {hydrated && currentFirm?.name ? (
            <div className="space-y-0.5">
              <div className="font-medium text-foreground truncate">
                {currentFirm.name}
              </div>
              {role && (
                <div className="font-mono uppercase tracking-wider text-[10px] opacity-70">
                  {role}
                </div>
              )}
              <div className="pt-1 text-[10px]">Switch firms in the top header</div>
            </div>
          ) : (
            <div className="h-8 animate-pulse rounded bg-muted/40" />
          )}
        </div>
      </div>
    </>
  );
}
