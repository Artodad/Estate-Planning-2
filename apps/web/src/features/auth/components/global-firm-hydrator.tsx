"use client";

import { useEffect } from "react";

import { useAuth, useOrganization } from "@clerk/nextjs";

import { useFirm } from "../use-firm";
import { getCurrentFirm } from "../server/actions";

/**
 * Global client component responsible for hydrating the useFirm store
 * for all signed-in users as early as possible.
 *
 * Place this once near the root (inside root layout, wrapped in <SignedIn>).
 *
 * It uses Clerk client hooks to detect the active organization and calls
 * getCurrentFirm() Server Action to fetch the authoritative firm + role
 * from the database (the source of truth for RBAC).
 */
export function GlobalFirmHydrator() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: orgLoaded, organization } = useOrganization();
  const { hydrate, isHydrated, setLoading } = useFirm();

  const isReady = authLoaded && orgLoaded;

  const currentClerkOrgId = organization?.id ?? null;

  useEffect(() => {
    if (!isReady || !isSignedIn) {
      return;
    }

    const storedFirm = useFirm.getState().currentFirm;
    const needsRefetch =
      !isHydrated ||
      (currentClerkOrgId && storedFirm?.clerkOrgId !== currentClerkOrgId);

    if (!needsRefetch) {
      return;
    }

    const loadCurrentFirm = async () => {
      setLoading(true);

      try {
        const firmData = await getCurrentFirm();
        hydrate(firmData);
      } catch (err) {
        console.error("[GlobalFirmHydrator] Failed to fetch current firm:", err);
        hydrate(null);
      } finally {
        setLoading(false);
      }
    };

    loadCurrentFirm();
  }, [isReady, isSignedIn, currentClerkOrgId, isHydrated, hydrate, setLoading]);

  return null;
}
