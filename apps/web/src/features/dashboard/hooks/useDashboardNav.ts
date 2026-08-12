"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  ClipboardList,
  FileText,
  FileCog,
} from "lucide-react";

import {
  useRole,
  hasRole,
  OWNER_STAFF,
  ALL_ROLES,
} from "@/features/auth";
import type { DashboardNavItem } from "../types";

/**
 * useDashboardNav
 *
 * Client hook providing the exact 5-item sidebar nav from the Design Document,
 * filtered by the current user's hydrated role using the existing RBAC primitives.
 *
 * - Never returns items the user is not allowed to see (no flash, respects isHydrated).
 * - Provides isActive(href) helper based on usePathname (exact for root, startsWith for sections).
 * - Exports the full static list (ALL_DASHBOARD_NAV_ITEMS) for tests / future use.
 *
 * This is the single source of truth for dashboard navigation structure (per Sub-agent A spec).
 *
 * Usage (inside client shell/sidebar):
 *   const { visibleNavItems, isActive, role, isHydrated } = useDashboardNav();
 */
import type { FirmRole } from "@/features/auth/types";

// Exact nav structure per Design Document §1 (authoritative)
const ALL_DASHBOARD_NAV_ITEMS: readonly DashboardNavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    allowed: ALL_ROLES,
    description: "Dashboard home with firm context, quick actions, and role demos",
  },
  {
    href: "/dashboard/clients",
    label: "Clients",
    icon: Users,
    allowed: OWNER_STAFF,
    description: "Manage clients, view intake progress, and start new matters",
  },
  {
    href: "/dashboard/intakes",
    label: "Intakes",
    icon: ClipboardList,
    allowed: OWNER_STAFF,
    description: "Active and recent client intake sessions (scaffold)",
  },
  {
    href: "/dashboard/documents",
    label: "Documents",
    icon: FileText,
    allowed: OWNER_STAFF,
    description: "Generated document packages and history (scaffold)",
  },
  {
    href: "/dashboard/templates",
    label: "Templates",
    icon: FileCog,
    allowed: ["owner"] as readonly FirmRole[],
    description: "Manage firm document templates (owner only)",
  },
];

export function useDashboardNav() {
  const { role, isHydrated } = useRole();
  const pathname = usePathname();

  // Filter using the pure hasRole util + hydrated state (prevents any privileged flash)
  const visibleNavItems = isHydrated
    ? ALL_DASHBOARD_NAV_ITEMS.filter((item) => hasRole(role, item.allowed))
    : [];

  /**
   * Active state logic (matches Design §1):
   * - Exact match for Overview (/dashboard)
   * - startsWith for section pages (supports future /clients/[id] etc.)
   */
  const isActive = (href: string): boolean => {
    if (!pathname) return false;
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/dashboard/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return {
    /** Full static definition (for tests, future extensions) */
    navItems: ALL_DASHBOARD_NAV_ITEMS,
    /** Role-filtered items safe to render for current user */
    visibleNavItems,
    /** Active predicate for styling current nav item */
    isActive,
    /** Current role (for debugging / secondary UI) */
    role,
    isHydrated,
  };
}

// Re-export for convenience + E2E / unit tests
export { ALL_DASHBOARD_NAV_ITEMS };
