"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CurrentFirm } from "./types";

/**
 * Zustand store for current firm (organization) context.
 *
 * This is the single source of truth for which firm the user is
 * currently operating in on the client.
 *
 * Usage:
 *   const { currentFirm, setCurrentFirm, hydrate } = useFirm();
 */

interface FirmState {
  currentFirm: CurrentFirm | null;
  isLoading: boolean;
  isHydrated: boolean;

  // Actions
  setCurrentFirm: (firm: CurrentFirm) => void;
  clearFirm: () => void;
  setLoading: (loading: boolean) => void;

  /**
   * Hydrate the store from server-fetched data.
   * Call this once on the client after you have the result from getCurrentAuthContext.
   */
  hydrate: (firm: CurrentFirm | null) => void;
}

export const useFirm = create<FirmState>()(
  persist(
    (set) => ({
      currentFirm: null,
      isLoading: true,
      isHydrated: false,

      setCurrentFirm: (firm) =>
        set({
          currentFirm: firm,
          isLoading: false,
          isHydrated: true,
        }),

      clearFirm: () =>
        set({
          currentFirm: null,
          isLoading: false,
          isHydrated: true,
        }),

      setLoading: (loading) => set({ isLoading: loading }),

      hydrate: (firm) =>
        set({
          currentFirm: firm,
          isLoading: false,
          isHydrated: true,
        }),
    }),
    {
      name: "estate-planning-firm",
      partialize: (state) => ({ currentFirm: state.currentFirm }),
    }
  )
);

export function useCurrentFirmId() {
  return useFirm((state) => state.currentFirm?.id ?? null);
}
