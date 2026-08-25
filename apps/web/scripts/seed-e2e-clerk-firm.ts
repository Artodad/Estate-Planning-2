/**
 * CI-only: upsert a Firm + owner User for the Playwright Clerk e2e account.
 * Looks up clerk user id + active org via Clerk Backend API (no Neon, no extra secrets).
 *
 * Required env: DATABASE_URL (localhost), CLERK_SECRET_KEY, E2E_CLERK_USER_IDENTIFIER
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const CLERK_API = "https://api.clerk.com/v1";

type ClerkUser = {
  id: string;
  username?: string | null;
  email_addresses?: Array<{ email_address: string }>;
};

type ClerkOrgMembership = {
  role?: string;
  organization?: { id?: string; name?: string; slug?: string | null };
};

type ClerkSession = {
  last_active_organization_id?: string | null;
  last_active_at?: number | null;
  updated_at?: number | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function assertLocalDatabaseUrl(url: string): void {
  if (!url.includes("localhost") && !url.includes("127.0.0.1")) {
    throw new Error(
      "DATABASE_URL must point at the GitHub Actions Postgres service, not a remote/Neon database.",
    );
  }
}

async function clerkGet<T>(secret: string, path: string, query?: Record<string, string>): Promise<T> {
  const url = new URL(`${CLERK_API}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${path} failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

function unwrapList<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }
  if (payload && typeof payload === "object" && "data" in payload) {
    const data = (payload as { data: unknown }).data;
    if (Array.isArray(data)) {
      return data as T[];
    }
  }
  return [];
}

function emailsOf(user: ClerkUser): string[] {
  return (user.email_addresses ?? []).map((e) => e.email_address).filter(Boolean);
}

function userMatchesIdentifier(user: ClerkUser, identifier: string): boolean {
  const needle = identifier.toLowerCase();
  return (
    user.id === identifier ||
    user.username?.toLowerCase() === needle ||
    emailsOf(user).some((email) => email.toLowerCase() === needle)
  );
}

async function lookupClerkUser(secret: string, identifier: string): Promise<ClerkUser> {
  if (identifier.startsWith("user_")) {
    return clerkGet<ClerkUser>(secret, `/users/${identifier}`);
  }

  try {
    const byEmail = unwrapList<ClerkUser>(
      await clerkGet(secret, "/users", { email_address: identifier }),
    );
    const exactEmail = byEmail.find((u) => userMatchesIdentifier(u, identifier));
    if (exactEmail) {
      return exactEmail;
    }
  } catch {
    // Identifier may be a username; fall through to query search.
  }

  const byQuery = unwrapList<ClerkUser>(await clerkGet(secret, "/users", { query: identifier }));
  const exactQuery = byQuery.find((u) => userMatchesIdentifier(u, identifier));
  if (exactQuery) {
    return exactQuery;
  }

  throw new Error("Clerk e2e user not found for E2E_CLERK_USER_IDENTIFIER");
}

function pickActiveOrg(
  memberships: ClerkOrgMembership[],
  sessions: ClerkSession[],
): { orgId: string; name: string; slug: string | null } {
  const byId = new Map<string, { orgId: string; name: string; slug: string | null }>();
  for (const m of memberships) {
    const orgId = m.organization?.id;
    if (!orgId) continue;
    byId.set(orgId, {
      orgId,
      name: m.organization?.name || "E2E Firm",
      slug: m.organization?.slug ?? null,
    });
  }
  if (byId.size === 0) {
    throw new Error("Clerk e2e user has no organization membership");
  }

  const sessionOrg = [...sessions]
    .sort((a, b) => (b.last_active_at ?? b.updated_at ?? 0) - (a.last_active_at ?? a.updated_at ?? 0))
    .map((s) => s.last_active_organization_id)
    .find((id): id is string => Boolean(id && byId.has(id)));
  if (sessionOrg) {
    return byId.get(sessionOrg)!;
  }

  const admin = memberships.find((m) => m.role === "org:admin" && m.organization?.id);
  if (admin?.organization?.id) {
    return byId.get(admin.organization.id)!;
  }

  return [...byId.values()][0];
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  assertLocalDatabaseUrl(databaseUrl);
  const secret = requireEnv("CLERK_SECRET_KEY");
  const identifier = requireEnv("E2E_CLERK_USER_IDENTIFIER");

  const user = await lookupClerkUser(secret, identifier);
  const memberships = unwrapList<ClerkOrgMembership>(
    await clerkGet(secret, `/users/${user.id}/organization_memberships`),
  );
  const sessions = unwrapList<ClerkSession>(
    await clerkGet(secret, "/sessions", { user_id: user.id }),
  );
  const org = pickActiveOrg(memberships, sessions);

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  try {
    let firm = await prisma.firm.findUnique({ where: { clerkOrgId: org.orgId } });
    if (!firm) {
      firm = await prisma.firm.create({
        data: {
          clerkOrgId: org.orgId,
          name: org.name,
          slug: org.slug,
        },
      });
    }

    const email =
      emailsOf(user).find((e) => e.toLowerCase() === identifier.toLowerCase()) ??
      emailsOf(user)[0] ??
      (identifier.includes("@") ? identifier : "e2e@example.com");

    await prisma.user.upsert({
      where: { clerkId: user.id },
      update: { firmId: firm.id, role: "owner", email },
      create: { clerkId: user.id, email, role: "owner", firmId: firm.id },
    });

    console.log(`E2E seed: Firm ${firm.id} + owner User linked to Clerk org and user`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("E2E Clerk Firm seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
