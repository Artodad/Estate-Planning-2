import { redirect } from "next/navigation";

import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { requireRole } from "@/features/auth/server/rbac";
import { DashboardShell } from "@/features/dashboard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authContext = await getCurrentAuthContext();

  if (!authContext?.userId) {
    redirect("/sign-in");
  }

  const { currentFirm } = authContext;

  // Enforce onboarding if user has a Clerk org but no internal Firm yet
  if (currentFirm && !currentFirm.id) {
    redirect("/onboarding");
  }

  // === Phase 1C RBAC wiring (Sub-agent B + reviewer blocker fix) ===
  // Allow owner, staff, *and client* for the dashboard shell.
  // - Re-validates Clerk org + Prisma User.role on every request (via requireRole).
  // - Actual content is limited via <RoleGuard> + useRole() + hasRole() in the page
  //   and components (see dashboard/page.tsx client capabilities demo and header badge).
  // - This resolves the post-claim "Go to dashboard" link for clients from the magic link
  //   landing page while preserving strict server re-validation.
  // - Owner/staff flows unchanged.
  await requireRole(["owner", "staff", "client"], {
    redirectTo: "/dashboard?error=insufficient-permissions",
    errorMessage: "You do not have access to this dashboard.",
    onUnauthorized: "redirect",
  });

  return (
    <div className="min-h-[calc(100vh-4rem)] pt-16">
      {/* DashboardShell provides the role-aware sidebar, mobile drawer, internal title bar, and main content wrapper.
          It is fully composed around the global AuthHeader (never duplicated or modified). */}
      <DashboardShell>{children}</DashboardShell>
    </div>
  );
}
