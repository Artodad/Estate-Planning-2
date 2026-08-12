"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface NavLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  description?: string;
  onClick?: () => void; // for mobile close after nav
}

/**
 * NavLink
 *
 * Reusable styled link for dashboard sidebar items.
 * - Uses Next Link
 * - Active state: bg-accent + left border accent (per Design §1)
 * - Icon + label, good touch target
 * - Optional description for title/aria
 */
export function NavLink({
  href,
  label,
  icon: Icon,
  isActive,
  description,
  onClick,
}: NavLinkProps) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "hover:bg-accent hover:text-accent-foreground",
        isActive
          ? "bg-accent text-accent-foreground border-l-2 border-primary"
          : "text-muted-foreground hover:text-foreground border-l-2 border-transparent"
      )}
      aria-current={isActive ? "page" : undefined}
      title={description}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  );
}
