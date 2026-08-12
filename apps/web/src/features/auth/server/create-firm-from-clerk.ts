"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "./audit";

const CreateFirmSchema = z.object({
  clerkOrgId: z.string().min(1),
  name: z.string().min(1).max(100),
  slug: z.string().max(100).optional().nullable(),
});

export type CreateFirmResult =
  | { success: true }
  | { error: string };

/**
 * Creates (or syncs) a Prisma Firm record from a Clerk Organization.
 *
 * This is the core operation that links Clerk's multi-tenancy system
 * to our internal data model.
 *
 * Call this when:
 * - A user creates a new organization in Clerk and wants to use it in the app
 * - A user joins an existing Clerk org that doesn't have a Firm record yet
 */
/**
 * Server Action to create/sync a Firm from a Clerk Organization.
 * Can be called directly or used as a form action.
 */
export async function createFirmFromClerkOrganization(
  input:
    | {
        clerkOrgId: string;
        name: string;
        slug?: string | null;
      }
    | FormData
): Promise<CreateFirmResult> {
  // Support both direct calls and form submissions
  const raw =
    input instanceof FormData
      ? {
          clerkOrgId: input.get("clerkOrgId"),
          name: input.get("name"),
          slug: input.get("slug"),
        }
      : input;

  const parsed = CreateFirmSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Invalid firm details provided." };
  }

  const params = parsed.data;

  const { userId, orgId } = await auth();

  if (!userId) {
    return { error: "You must be signed in to create a firm." };
  }

  // Security: The user must currently have this org active
  if (orgId !== params.clerkOrgId) {
    return { error: "You must have this organization active to set it up." };
  }

  try {
    // Resolve firm (idempotent)
    let firm = await prisma.firm.findUnique({
      where: { clerkOrgId: params.clerkOrgId },
    });

    if (!firm) {
      firm = await prisma.firm.create({
        data: {
          clerkOrgId: params.clerkOrgId,
          name: params.name,
          slug: params.slug ?? null,
        },
      });

      // Audit: firm creation (only on actual create; non-fatal)
      logAuditEvent({
        firmId: firm.id,
        actorClerkId: userId,
        action: "firm.created",
        targetType: "firm",
        targetId: firm.id,
        metadata: {
          name: params.name,
          clerkOrgId: params.clerkOrgId,
        },
      });
    }

    // Minimal User record for the current actor (satisfies schema: non-null firmId + clerkId unique).
    // This user is performing the "create firm profile" step → owner.
    // (Webhooks will also sync owner via membership.created, but this explicit path sets role authoritatively.)
    const clerkUser = await currentUser();
    const email =
      clerkUser?.primaryEmailAddress?.emailAddress ??
      clerkUser?.emailAddresses?.[0]?.emailAddress ??
      "unknown@example.com";

    await prisma.user.upsert({
      where: { clerkId: userId },
      update: {
        firmId: firm.id,
        role: "owner",
        email,
      },
      create: {
        clerkId: userId,
        email,
        role: "owner",
        firmId: firm.id,
      },
    });

    // Audit: owner assignment / role grant during firm profile creation (non-fatal, firm-scoped)
    logAuditEvent({
      firmId: firm.id,
      actorClerkId: userId,
      action: "user.role_assigned",
      targetType: "user",
      targetId: userId,
      metadata: {
        role: "owner",
        via: "firm_creation",
      },
    });

    revalidatePath("/dashboard");
    revalidatePath("/onboarding");

    return { success: true };
  } catch (error) {
    console.error("Failed to create Firm from Clerk org:", error);
    return { error: "We couldn’t create your firm profile right now. Please try again." };
  }
}
