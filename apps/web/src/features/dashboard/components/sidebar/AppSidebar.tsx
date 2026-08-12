"use client";

import { useDashboardNav } from "@/features/dashboard/hooks/useDashboardNav";
import { useFirm, useRole } from "@/features/auth";
import { NavLink } from "./NavLink";
import { cn } from "@/lib/utils";

/**
 * AppSidebar
 *
 * Desktop (md+) fixed left sidebar navigation.
 * - Width 256px (w-64)
 * - Role-filtered nav items (via useDashboardNav)
 * - Lightweight footer with current firm + role (read-only, complements global AuthHeader)
 * - No collapse in initial B impl (can be added later via localStorage)
 *
 * Hydration-safe: renders empty skeleton until hydrated.
 */
export function AppSidebar() {
  const { visibleNavItems, isActive, isHydrated, role } = useDashboardNav();
  const { currentFirm } = useFirm();
  const { isHydrated: roleHydrated } = useRole();

  const hydrated = isHydrated && roleHydrated;

  return (
    <aside
      className={cn(
        "hidden md:flex md:flex-col",
        "fixed inset-y-0 left-0 z-40 w-64 border-r bg-background pt-16" // pt-16 to sit below global fixed AuthHeader
      )}
      aria-label="Dashboard navigation"
    >
      {/* Nav list */}
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
            />
          ))
        )}
      </nav>

      {/* Sidebar footer (firm context, useful on desktop when header is compact) */}
      <div className="border-t p-3 text-xs text-muted-foreground">
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
            <div className="pt-1 text-[10px] leading-none">
              Switch via header OrgSwitcher
            </div>
          </div>
        ) : (
          <div className="h-8 animate-pulse rounded bg-muted/40" />
        )}
      </div>
    </aside>
  );
}
