"use server";

/* eslint-disable turbo/no-undeclared-env-vars -- NEXT_PUBLIC_APP_URL / APP_URL are runtime configuration (documented in .env.example); safe for this Server Action */

import crypto from "crypto";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { checkOwnerOrStaff } from "./rbac";
import { sendClientInvitationEmail } from "./email";
import { clerkClient } from "@clerk/nextjs/server";
import { logAuditEvent } from "./audit";
import { checkRateLimit, RATE_LIMITS } from "./rate-limit";

/**
 * Server Action: inviteClient
 *
 * Allows owners and staff (enforced via RBAC) to invite a new client by email.
 * Creates a single-use, time-limited magic link token stored in Invitation.
 * Sends a professional branded email via Resend (with graceful dev fallback).
 *
 * Security:
 * - Always re-validates via checkOwnerOrStaff + getCurrentAuthContext (Clerk org + DB role).
 * - Token is cryptographically random (256-bit), bound to firm + email + expiry + single-use.
 * - Simple per-firm rate limiting (20 invites / hour).
 * - All writes scoped to the caller's active firmId.
 * - Role hardcoded to "client" for this flow (future-proof per schema).
 *
 * Returns devLink when Resend key missing or delivery issue (for sandbox testing).
 * Feature-sliced under features/auth/server.
 */

const InviteClientSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Please enter a valid email address."),
  firstName: z
    .string()
    .trim()
    .max(100, "First name must be 100 characters or less")
    .optional()
    .or(z.literal("")),
  lastName: z
    .string()
    .trim()
    .max(100, "Last name must be 100 characters or less")
    .optional()
    .or(z.literal("")),
});

export type InviteClientInput = z.infer<typeof InviteClientSchema>;

export type InviteClientResult =
  | { success: true; message: string; devLink?: string }
  | { error: string };

function parseInput(input: InviteClientInput | FormData): InviteClientInput {
  if (input instanceof FormData) {
    return {
      email: String(input.get("email") ?? ""),
      firstName: input.get("firstName") ? String(input.get("firstName")) : undefined,
      lastName: input.get("lastName") ? String(input.get("lastName")) : undefined,
    };
  }
  return input;
}

export async function inviteClient(
  input: InviteClientInput | FormData
): Promise<InviteClientResult> {
  // 1. Parse + Zod validate (supports both direct TS call and native form actions)
  const raw = parseInput(input);
  const parsed = InviteClientSchema.safeParse(raw);

  if (!parsed.success) {
    const firstError = parsed.error.issues[0];
    return { error: firstError?.message ?? "Invalid invitation details." };
  }

  const { email, firstName, lastName } = parsed.data;

  // 2. RBAC enforcement (non-redirecting check for graceful Server Action UX)
  const check = await checkOwnerOrStaff();
  if (!check.ok) {
    return { error: check.error };
  }

  const ctx = check.context;
  const currentFirm = ctx.currentFirm;
  if (!currentFirm?.id) {
    return { error: "Active firm context is required. Please complete firm setup first." };
  }

  const firmId = currentFirm.id;
  const firmName = currentFirm.name;

  // 3. Reusable per-firm rate limiting (Wave C extraction)
  const { allowed } = await checkRateLimit(firmId, RATE_LIMITS.INVITE.action, RATE_LIMITS.INVITE.limit, RATE_LIMITS.INVITE.windowMs);
  if (!allowed) {
    return {
      error:
        "Too many client invitations have been sent from this firm in the last hour. Please try again later.",
    };
  }

  // 4. Generate secure, unguessable token (128-bit entropy is plenty; 256-bit used)
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // 5. Persist the Invitation (firm-scoped, single-use via usedAt)
  let createdInvitationId: string | undefined;
  try {
    const createdInvitation = await prisma.invitation.create({
      data: {
        firmId,
        email: email.toLowerCase().trim(),
        role: "client",
        token,
        expiresAt,
      },
    });
    createdInvitationId = createdInvitation.id;
  } catch (error) {
    console.error("[inviteClient] Failed to create Invitation record:", error);
    return { error: "Could not create invitation record. Please try again." };
  }

  // Audit log (non-fatal, per design; firm-scoped, minimal safe metadata only)
  if (createdInvitationId) {
    logAuditEvent({
      firmId,
      actorClerkId: ctx.userId,
      action: "invitation.created",
      targetType: "invitation",
      targetId: createdInvitationId,
      metadata: {
        email: email.toLowerCase().trim(),
        role: "client",
      },
    });
  }

  // 6. (Reviewer blocker fix) Provision Clerk Organization membership for the client.
  // This ensures the invited user will have the correct `orgId` in their Clerk session
  // after sign-in via the magic link, so getCurrentAuthContext can resolve their firm + role.
  // Wrapped non-fatally: the DB Invitation + email is the primary artifact; Clerk membership
  // can be retried or handled manually if the Clerk API is unavailable.
  try {
    const client = await clerkClient();
    const orgId = currentFirm.clerkOrgId;

    // Find or create the Clerk user by email (best effort)
    let clerkUserId: string | null = null;
    const existingUsers = await client.users.getUserList({
      emailAddress: [email.toLowerCase().trim()],
      limit: 1,
    });
    if (existingUsers.data.length > 0) {
      clerkUserId = existingUsers.data[0].id;
    } else {
      const newUser = await client.users.createUser({
        emailAddress: [email.toLowerCase().trim()],
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        // Passwordless / magic-link flow preferred; user will set password or use email link on first sign-in
      });
      clerkUserId = newUser.id;
    }

    if (clerkUserId && orgId) {
      // Add as member (default Clerk role; map to "client" in our system via DB role)
      await client.organizations.createOrganizationMembership({
        organizationId: orgId,
        userId: clerkUserId,
        role: "org:member", // Our RBAC treats non-admin as staff/client based on DB role
      });
    }
  } catch (clerkErr) {
    // Non-fatal for the invitation record itself (email + token still work)
    console.warn("[inviteClient] Clerk org membership provisioning failed (non-fatal):", {
      email,
      firmId,
      error: clerkErr instanceof Error ? clerkErr.message : String(clerkErr),
    });
  }

  // 7. Construct absolute magic link (email-safe)
  // In production set NEXT_PUBLIC_APP_URL or APP_URL. Falls back to localhost for dev.
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3001";
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/invite/${token}`;

  // 8. Send the email (or dev fallback inside the sender)
  const emailResult = await sendClientInvitationEmail({
    to: email,
    firmName,
    inviteUrl,
    firstName: firstName || null,
    lastName: lastName || null,
  });

  const message = `Invitation sent to ${email}. The secure link is valid for 7 days.`;

  return {
    success: true,
    message,
    devLink: emailResult.devLink,
  };
}
