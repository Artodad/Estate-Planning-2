"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ClientFilter } from "../../types";

/**
 * ClientFilters
 *
 * Search input + segmented filter chips for the Clients table.
 * Purely client-side (state lives in parent ClientsList).
 *
 * Design §3: "All | Intake In Progress | Documents Pending | Completed"
 * (we map to "in-progress", "pending", "ready" + all)
 */
interface ClientFiltersProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  activeFilter: ClientFilter;
  onFilterChange: (filter: ClientFilter) => void;
  resultCount: number;
  totalCount: number;
  /** Dynamic label for the count line during mock-to-real transition (D). Defaults to "MOCK DATA" to preserve prior UX. */
  dataSourceLabel?: string;
}

const FILTERS: { value: ClientFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "in-progress", label: "Intake In Progress" },
  { value: "ready", label: "Documents Ready" },
  { value: "pending", label: "Needs Attention" },
];

export function ClientFilters({
  searchTerm,
  onSearchChange,
  activeFilter,
  onFilterChange,
  resultCount,
  totalCount,
  dataSourceLabel = "MOCK DATA",
}: ClientFiltersProps) {
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="flex-1">
          <Input
            type="search"
            placeholder="Search clients by name or email..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full"
            aria-label="Search clients"
          />
        </div>

        {/* Clear */}
        {(searchTerm || activeFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSearchChange("");
              onFilterChange("all");
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter clients">
        {FILTERS.map((f) => {
          const isActive = activeFilter === f.value;
          return (
            <Button
              key={f.value}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(f.value)}
              className="text-xs"
              aria-pressed={isActive}
              role="tab"
            >
              {f.label}
            </Button>
          );
        })}
      </div>

      {/* Results count + scaffold note */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing <span className="font-medium text-foreground">{resultCount}</span> of{" "}
          <span className="font-medium text-foreground">{totalCount}</span> clients
          <span className="ml-1">({dataSourceLabel})</span>
        </span>
        <span className="hidden sm:inline">Client-side filtering only</span>
      </div>
    </div>
  );
}
