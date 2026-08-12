import { currentUser } from "@clerk/nextjs/server";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getCurrentAuthContext } from "@/features/auth/server/get-current-auth";
import { logAuditEvent } from "@/features/auth/server/audit";

/**
 * Magic Link Landing Page for Client Invitations
 *
 * Public route (see middleware). Validates the token server-side.
 * - Unauthenticated visitors see a branded welcome + embedded Clerk <SignIn />
 *   configured to redirect back here after success.
 * - Once signed in with a matching email: the page claims the invitation (marks usedAt,
 *   explicitly creates/updates the Prisma User with role="client" + correct firmId).
 * - Leverages the DB-preferred role logic + explicit upsert (authoritative for "client" role).
 *   The exported recovery ensureUserRecord (now demoted, never auto-called from getCurrentAuthContext
 *   post A.4) and webhook handlers both respect "role only on create" (or authoritative update in claim)
 *   so late-arriving membership webhooks never overwrite the client role.
 * - Security: email match required post-auth; firmId from invitation; token single-use + expiry.
 *
 * This is a scaffold. Full intake questionnaire + client-specific dashboard will be
 * added in Phase 3. For now clients see a limited, professional welcome.
 *
 * No owner/staff actions here; this page is intentionally reachable by invitees.
 */

interface InvitePageProps {
  params: Promise<{ token: string }>;
}

export default async function InviteLandingPage({ params }: InvitePageProps) {
  const { token } = await params;

  // Fetch invitation + firm (public read is safe; no PII beyond email/firm name)
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: { firm: { select: { id: true, name: true, clerkOrgId: true } } },
  });

  const now = new Date();

  if (!invitation || invitation.usedAt || invitation.expiresAt < now) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6 pt-16">
        <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-2xl">⚠️</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Invitation link not available</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This link is either invalid, has expired (links are valid for 7 days), or has already been used.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Please contact the law firm that sent the invitation to request a new link.
          </p>
          <div className="mt-6">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Return to homepage
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const firmName = invitation.firm?.name ?? "the law firm";
  const invitedEmail = invitation.email;

  // Current auth state (works even on this public route)
  const authCtx = await getCurrentAuthContext();
  const isSignedIn = !!authCtx?.userId;

  let signedInEmail: string | null = authCtx?.email ?? null;

  // If we have a userId but no email in ctx (edge), fetch freshest
  if (isSignedIn && !signedInEmail) {
    try {
      const clerkUser = await currentUser();
      signedInEmail =
        clerkUser?.primaryEmailAddress?.emailAddress ??
        clerkUser?.emailAddresses?.[0]?.emailAddress ??
        null;
    } catch {
      // non-fatal
    }
  }

  const emailMatches =
    !!signedInEmail &&
    signedInEmail.toLowerCase().trim() === invitedEmail.toLowerCase().trim();

  let claimResult: { claimed: boolean; error?: string } = { claimed: false };

  // Auto-claim when signed in + email matches (idempotent, safe on refresh)
  if (isSignedIn && emailMatches) {
    try {
      // Re-validate token state right before claiming (race protection)
      const fresh = await prisma.invitation.findUnique({ where: { token } });
      if (fresh && !fresh.usedAt && fresh.expiresAt > now) {
        // 1. Mark single-use
        await prisma.invitation.update({
          where: { token },
          data: { usedAt: new Date() },
        });

        // 2. Explicitly set/ensure the User record with authoritative "client" role.
        //    This is the key integration point with Phase 1C DB-preferred RBAC.
        //    We do a direct upsert here (the claim path is the source of truth for client role).
        //    Webhook handlers (organizationMembership.*) use "role only on create" via
        //    mapClerkRoleToFirmRole, so they never clobber the "client" role set here.
        //    Subsequent getCurrentAuthContext calls will prefer this DB role.
        const clerkId = authCtx!.userId;
        await prisma.user.upsert({
          where: { clerkId },
          update: {
            // Preserve the client role we are granting; firmId from the invitation
            role: "client",
            firmId: invitation.firmId,
            email: invitedEmail,
          },
          create: {
            clerkId,
            email: invitedEmail,
            role: "client",
            firmId: invitation.firmId,
          },
        });

        // Audit: role assignment via invite claim (authoritative per Phase 1C; non-fatal)
        logAuditEvent({
          firmId: invitation.firmId,
          actorClerkId: clerkId,
          action: "user.role_assigned_via_invite",
          targetType: "user",
          targetId: clerkId,
          metadata: {
            role: "client",
            via: "invite_claim",
            email: invitedEmail,
          },
        });

        claimResult = { claimed: true };
      } else if (fresh?.usedAt) {
        claimResult = { claimed: true }; // already claimed earlier in this session
      }
    } catch (err) {
      console.error("[invite] Claim failed for token:", token, err);
      claimResult = {
        claimed: false,
        error: "We were unable to activate your client access. The firm has been notified via logs. Please try again or contact support.",
      };
    }
  }

  // After successful claim we could redirect, but the welcome UX on this page is better
  // (clients shouldn't hit the attorney-only dashboard shell yet).

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-b from-background to-muted/30 px-6 pt-20 pb-12">
      <div className="mx-auto max-w-2xl">
        {/* Header / Branded welcome */}
        <div className="text-center">
          <div className="mx-auto mb-4 inline-flex items-center rounded-full border bg-background px-3 py-1 text-xs font-medium tracking-widest text-muted-foreground">
            SECURE INTAKE
          </div>
          <h1 className="text-4xl font-semibold tracking-tighter">Welcome to {firmName}</h1>
          <p className="mt-4 text-lg text-muted-foreground">
            You have been invited to complete your confidential estate planning intake.
          </p>
        </div>

        <div className="mt-10 rounded-2xl border bg-card p-8 shadow-sm">
          {!isSignedIn && (
            <>
              <div className="mb-6">
                <p className="text-sm text-muted-foreground">
                  This invitation was sent to{" "}
                  <span className="font-medium text-foreground">{invitedEmail}</span>.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Sign in (or create an account) with that email address to activate your access.
                  The link you clicked will remain valid until used.
                </p>
              </div>

              {/* Embedded Clerk SignIn — redirects back to this exact page after success */}
              <div className="rounded-lg border bg-background p-2">
                <SignIn
                  routing="hash"
                  forceRedirectUrl={`/invite/${token}`}
                  fallbackRedirectUrl={`/invite/${token}`}
                  appearance={{
                    elements: {
                      rootBox: "w-full",
                      card: "shadow-none border-0 bg-transparent",
                    },
                  }}
                />
              </div>

              <p className="mt-4 text-center text-xs text-muted-foreground">
                After signing in with the invited email, you will be returned here automatically
                and your client access will be activated.
              </p>
            </>
          )}

          {isSignedIn && !emailMatches && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
              <h3 className="font-semibold text-amber-800 dark:text-amber-200">Email mismatch</h3>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                This invitation was sent to <strong>{invitedEmail}</strong>.
                You are currently signed in as <strong>{signedInEmail}</strong>.
              </p>
              <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
                Please sign out of your current account and sign back in using the email address
                above, then click the original invitation link again.
              </p>
              <div className="mt-4">
                <Link
                  href="/sign-in"
                  className="text-sm font-medium underline underline-offset-4 hover:no-underline"
                >
                  Go to sign-in page
                </Link>
              </div>
            </div>
          )}

          {isSignedIn && emailMatches && claimResult.error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
              <h3 className="font-semibold text-destructive">Activation issue</h3>
              <p className="mt-2 text-sm text-destructive/90">{claimResult.error}</p>
            </div>
          )}

          {isSignedIn && emailMatches && claimResult.claimed && !claimResult.error && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                <span className="text-emerald-600 dark:text-emerald-400">✓</span>
                <div>
                  <p className="font-medium text-emerald-800 dark:text-emerald-200">
                    Access activated successfully
                  </p>
                  <p className="text-sm text-emerald-700 dark:text-emerald-300">
                    Your role for <strong>{firmName}</strong> is now <strong>client</strong>.
                    This invitation has been marked as used.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-6">
                <h2 className="text-xl font-semibold tracking-tight">Next steps</h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  Thank you. Your attorney will guide the rest of the process. A full adaptive
                  intake questionnaire is coming in the next development phase.
                </p>
                <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>Your documents will be prepared with exact fidelity to the firm’s templates.</li>
                  <li>You will only see information and documents that belong to you.</li>
                  <li>Return to this link or your dashboard for updates.</li>
                </ul>

                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/dashboard"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow transition hover:opacity-90"
                  >
                    Go to your dashboard
                  </Link>
                  <Link
                    href="/"
                    className="inline-flex h-10 items-center justify-center rounded-md border px-6 text-sm font-medium hover:bg-accent"
                  >
                    Back to home
                  </Link>
                </div>

                <p className="mt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Attorney dashboard features are restricted to owners and staff.
                </p>
              </div>
            </div>
          )}

          {isSignedIn && emailMatches && !claimResult.claimed && !claimResult.error && (
            <div className="text-center text-sm text-muted-foreground">
              Validating your invitation and activating client access…
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          This is a secure, attorney-controlled portal. All information is protected.
        </p>
      </div>
    </div>
  );
}
