/**
 * CI-only: upsert a Firm + owner User for the Playwright Clerk e2e account.
 * Looks up clerk user id + active org via Clerk Backend API (no Neon, no extra secrets).
 *
 * Required env: DATABASE_URL (localhost), CLERK_SECRET_KEY, E2E_CLERK_USER_IDENTIFIER
 */
import { appendFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const CLERK_API = "https://api.clerk.com/v1";

type ClerkUser = {
  id: string;
  username?: string | null;
  primary_email_address_id?: string | null;
  primaryEmailAddressId?: string | null;
  email_addresses?: Array<{
    id?: string;
    email_address?: string;
    emailAddress?: string;
  }>;
  emailAddresses?: Array<{
    id?: string;
    email_address?: string;
    emailAddress?: string;
  }>;
};

type ClerkOrgMembership = {
  role?: string;
  organization?: { id?: string; name?: string; slug?: string | null };
};

type ClerkSession = {
  last_active_organization_id?: string | null;
  lastActiveOrganizationId?: string | null;
  last_active_at?: number | null;
  lastActiveAt?: number | null;
  updated_at?: number | null;
  updatedAt?: number | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
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

async function clerkGet(
  secret: string,
  path: string,
  search?: URLSearchParams,
): Promise<unknown> {
  const url = new URL(`${CLERK_API}${path}`);
  if (search) {
    url.search = search.toString();
  }
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "Clerk-API-Version": "2025-04-10",
    },
  });
  if (!res.ok) {
    throw new Error(`Clerk API ${path} failed: ${res.status}`);
  }
  return res.json();
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
  const rows = user.email_addresses ?? user.emailAddresses ?? [];
  return rows
    .map((e) => e.email_address ?? e.emailAddress)
    .filter((e): e is string => Boolean(e));
}

function userMatchesIdentifier(user: ClerkUser, identifier: string): boolean {
  const needle = identifier.toLowerCase();
  return (
    user.id === identifier ||
    user.username?.toLowerCase() === needle ||
    emailsOf(user).some((email) => email.toLowerCase() === needle)
  );
}

async function lookupUsers(
  secret: string,
  search: URLSearchParams,
): Promise<ClerkUser[]> {
  try {
    return unwrapList<ClerkUser>(await clerkGet(secret, "/users", search));
  } catch {
    return [];
  }
}

async function fetchFullUser(secret: string, userId: string): Promise<ClerkUser> {
  return (await clerkGet(secret, `/users/${userId}`)) as ClerkUser;
}

function primaryEmail(user: ClerkUser): string | undefined {
  const rows = user.email_addresses ?? user.emailAddresses ?? [];
  const primaryId = user.primary_email_address_id ?? user.primaryEmailAddressId;
  if (primaryId) {
    const row = rows.find((e) => e.id === primaryId);
    const email = row?.email_address ?? row?.emailAddress;
    if (email) return email;
  }
  return emailsOf(user)[0];
}

/** Password sign-in identifier Clerk's frontend will accept. */
function signInIdentifier(user: ClerkUser, fallback: string): { value: string; kind: string } {
  const email = primaryEmail(user);
  if (email) return { value: email, kind: "email" };
  if (user.username) return { value: user.username, kind: "username" };
  return { value: fallback, kind: "fallback" };
}

function exportSignInIdentifier(value: string): void {
  const githubEnv = process.env.GITHUB_ENV;
  if (!githubEnv) return;
  // Playwright specs read E2E_CLERK_USER_IDENTIFIER for clerk.signIn password strategy.
  appendFileSync(githubEnv, `E2E_CLERK_USER_IDENTIFIER=${value}\n`);
}

async function lookupClerkUser(secret: string, identifier: string): Promise<ClerkUser> {
  if (identifier.startsWith("user_")) {
    return fetchFullUser(secret, identifier);
  }

  const filtered: URLSearchParams[] = [
    new URLSearchParams({ email_address: identifier, limit: "10" }),
    new URLSearchParams({ "email_address[]": identifier, limit: "10" }),
    new URLSearchParams({ username: identifier, limit: "10" }),
    new URLSearchParams({ phone_number: identifier, limit: "10" }),
  ];

  const counts: number[] = [];
  for (const search of filtered) {
    const users = await lookupUsers(secret, search);
    counts.push(users.length);
    const match = users.find((u) => userMatchesIdentifier(u, identifier));
    if (match?.id) {
      return fetchFullUser(secret, match.id);
    }
    // List payloads often omit emails; a 1-hit filtered query is still that identifier.
    if (users.length === 1 && users[0]?.id) {
      return fetchFullUser(secret, users[0].id);
    }
  }

  const queried = await lookupUsers(secret, new URLSearchParams({ query: identifier, limit: "50" }));
  counts.push(queried.length);
  const exact = queried.find((u) => userMatchesIdentifier(u, identifier));
  if (exact?.id) {
    return fetchFullUser(secret, exact.id);
  }

  throw new Error(
    `Clerk e2e user not found for E2E_CLERK_USER_IDENTIFIER (looksLikeEmail=${identifier.includes("@")}; resultCounts=${counts.join(",")})`,
  );
}

function membershipOrgId(m: ClerkOrgMembership): string | undefined {
  return m.organization?.id;
}

function sessionOrgId(s: ClerkSession): string | null | undefined {
  return s.last_active_organization_id ?? s.lastActiveOrganizationId;
}

function sessionActivity(s: ClerkSession): number {
  return s.last_active_at ?? s.lastActiveAt ?? s.updated_at ?? s.updatedAt ?? 0;
}

function pickActiveOrg(
  memberships: ClerkOrgMembership[],
  sessions: ClerkSession[],
): { orgId: string; name: string; slug: string | null } {
  const byId = new Map<string, { orgId: string; name: string; slug: string | null }>();
  for (const m of memberships) {
    const orgId = membershipOrgId(m);
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
    .sort((a, b) => sessionActivity(b) - sessionActivity(a))
    .map((s) => sessionOrgId(s))
    .find((id): id is string => Boolean(id && byId.has(id)));
  if (sessionOrg) {
    return byId.get(sessionOrg)!;
  }

  const admin = memberships.find((m) => m.role === "org:admin" && membershipOrgId(m));
  const adminId = admin ? membershipOrgId(admin) : undefined;
  if (adminId) {
    return byId.get(adminId)!;
  }

  return [...byId.values()][0];
}

async function main(): Promise<void> {
  const databaseUrl = requireEnv("DATABASE_URL");
  assertLocalDatabaseUrl(databaseUrl);
  const secret = requireEnv("CLERK_SECRET_KEY");
  const identifier = requireEnv("E2E_CLERK_USER_IDENTIFIER");

  const user = await lookupClerkUser(secret, identifier);
  const signIn = signInIdentifier(user, identifier);
  exportSignInIdentifier(signIn.value);

  const memberships = unwrapList<ClerkOrgMembership>(
    await clerkGet(secret, `/users/${user.id}/organization_memberships`),
  );
  const sessions = unwrapList<ClerkSession>(
    await clerkGet(secret, "/sessions", new URLSearchParams({ user_id: user.id })),
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

    const email = primaryEmail(user) ?? (identifier.includes("@") ? identifier : "e2e@example.com");

    await prisma.user.upsert({
      where: { clerkId: user.id },
      update: { firmId: firm.id, role: "owner", email },
      create: { clerkId: user.id, email, role: "owner", firmId: firm.id },
    });

    console.log(
      `E2E seed: Firm ${firm.id} + owner User linked to Clerk org and user (signInIdentifierKind=${signIn.kind})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("E2E Clerk Firm seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
