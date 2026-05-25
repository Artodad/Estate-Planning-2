"use server";

import { auth, currentUser } from "@clerk/nextjs/server";

import { getPrisma } from "@/lib/prisma";

export async function getCurrentUserProfile() {
  const { userId } = await auth();

  if (!userId) {
    return { error: "Not authenticated" as const };
  }

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    "";

  try {
    const prisma = getPrisma();
    const user = await prisma.user.findUnique({
      where: { clerkId: userId },
      include: { firm: true },
    });

    return {
      clerkId: userId,
      email,
      prismaUser: user ?? null,
      message: user
        ? "User record found in database"
        : "No Prisma User record yet (normal in early Phase 0/1)",
    };
  } catch (error) {
    return {
      clerkId: userId,
      email,
      prismaUser: null,
      message:
        "Database not connected yet — add Neon DATABASE_URL and run prisma migrate dev",
      error: error instanceof Error ? error.message : "Unknown database error",
    };
  }
}
