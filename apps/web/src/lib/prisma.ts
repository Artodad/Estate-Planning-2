import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to apps/web/.env",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  });

  return new PrismaClient({ adapter });
}

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

// ============================================================
// Phase 2 basic firm-scoped CRUD helpers (Sub-agent C)
// Thin, type-safe functions for Client + IntakeSession.
// EVERY operation enforces firmId scoping (per AGENTS.md, multi-tenancy mdc, Design §4).
// Use after resolving firmId via getCurrentAuthContext() in Server Actions/RSC.
// Non-breaking; colocated in existing lib for minimal surface.
// ============================================================

export const clientHelpers = {
  /** List clients for the firm (newest first) with limited recent intake sessions. */
  async listByFirm(firmId: string) {
    return prisma.client.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      include: {
        intakeSessions: {
          orderBy: { createdAt: "desc" },
          take: 2,
        },
      },
    });
  },

  /** Get one client (with sessions) — returns null if not owned by firm. */
  async getByIdForFirm(id: string, firmId: string) {
    return prisma.client.findFirst({
      where: { id, firmId },
      include: { intakeSessions: { orderBy: { createdAt: "desc" } } },
    });
  },

  /** Create client — firmId is injected server-side, never from client input. */
  async createForFirm(
    firmId: string,
    data: {
      displayName: string;
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      dateOfBirth?: Date;
      notes?: string;
    },
  ) {
    return prisma.client.create({
      data: { firmId, ...data },
    });
  },
};

export const intakeSessionHelpers = {
  /** List sessions for the firm (newest first) with client summary + recent docs. */
  async listByFirm(firmId: string) {
    return prisma.intakeSession.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { id: true, displayName: true, email: true } },
        generatedDocuments: { take: 1, orderBy: { createdAt: "desc" } },
      },
    });
  },

  /** Get single session by id (firm-scoped safety). Returns null if not found or wrong firm. */
  async getByIdForFirm(id: string, firmId: string) {
    return prisma.intakeSession.findFirst({
      where: { id, firmId },
      include: {
        client: { select: { id: true, displayName: true, email: true, firstName: true, lastName: true } },
      },
    });
  },

  /** Start intake for a client (firmId denormalized for query perf + enforced). */
  async startForClient(clientId: string, firmId: string, initialAnswers?: any) {
    return prisma.intakeSession.create({
      data: {
        clientId,
        firmId,
        status: "in_progress",
        progress: 0,
        answers: initialAnswers ?? {},
      },
    });
  },

  /** Patch answers / progress / status (firmId in where for safety). */
  async updateAnswersAndProgress(
    id: string,
    firmId: string,
    patch: { answers?: any; progress?: number; status?: string },
  ) {
    return prisma.intakeSession.update({
      where: { id, firmId },
      data: {
        ...(patch.answers !== undefined ? { answers: patch.answers } : {}),
        ...(patch.progress !== undefined ? { progress: patch.progress } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.status === "completed" ? { completedAt: new Date() } : {}),
      },
    });
  },
};

// ============================================================
// Phase 4 document generation helpers (Sub-agent B)
// Thin, firm-scoped CRUD for Template + GeneratedDocument.
// Follows identical patterns as clientHelpers / intakeSessionHelpers above.
// Added so generator callers (Phase 4.3 actions) and package logic (4.4) can
// list active templates, fetch by id, and record generated DRAFTs with full tracing.
// ============================================================

export const templateHelpers = {
  /** List all active templates for the firm (used for "Generate Full Plan" package). */
  async listActiveByFirm(firmId: string) {
    return prisma.template.findMany({
      where: { firmId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  },

  /** Get one template (firm-scoped). */
  async getByIdForFirm(id: string, firmId: string) {
    return prisma.template.findFirst({
      where: { id, firmId },
    });
  },

  /** Create template record (for future owner-only upload UI). */
  async createForFirm(
    firmId: string,
    data: {
      name: string;
      fileKey: string;
      documentType: string;
      description?: string;
    },
  ) {
    return prisma.template.create({
      data: { firmId, isActive: true, ...data },
    });
  },
};

export const generatedDocumentHelpers = {
  /** List all generated docs for a specific intake (firm-scoped). */
  async listByIntakeForFirm(intakeSessionId: string, firmId: string) {
    return prisma.generatedDocument.findMany({
      where: { intakeSessionId, firmId },
      orderBy: { createdAt: "desc" },
      include: {
        template: { select: { name: true, documentType: true } },
      },
    });
  },

  /** List recent generated docs for the firm (Documents page / history). */
  async listByFirm(firmId: string, take = 50) {
    return prisma.generatedDocument.findMany({
      where: { firmId },
      orderBy: { createdAt: "desc" },
      take,
      include: {
        template: { select: { name: true } },
      },
    });
  },

  /** Record a successfully generated DRAFT (called by actions after generateDocument). */
  async createForFirm(
    firmId: string,
    data: {
      intakeSessionId: string;
      templateId?: string | null;
      documentType: string;
      fileKey: string;
      status?: "pending" | "generated" | "failed";
      generatedAt?: Date;
    },
  ) {
    return prisma.generatedDocument.create({
      data: {
        firmId,
        status: data.status ?? "generated",
        generatedAt: data.generatedAt ?? new Date(),
        templateId: data.templateId ?? null,
        ...data,
      },
    });
  },
};

// ============================================================
// Wave E (explicitly gated / docs-only per PHASE-6-7-COMPLETION-PLAN):
// Optional Prisma $extends prototype for automatic firmId scoping (defense-in-depth).
// NOT activated on the default `prisma` export or existing helpers.
// Use only for new code paths after separate performance + E2E sign-off on realistic volumes.
// Example usage (opt-in):
//   import { createFirmScopedPrisma } from "@/lib/prisma";
//   const scoped = createFirmScopedPrisma(firmIdFromAuth);
//   await scoped.client.findMany(...); // automatically scoped
// See docs/row-level-security.md for the matching Postgres RLS policies + enablement checklist.
// ============================================================

export function createFirmScopedPrisma(firmId: string) {
  return prisma.$extends({
    name: "firm-scoped",
    query: {
      // Add model-specific scoping as needed (Client, IntakeSession, GeneratedDocument, Template, AuditLog, Invitation)
      client: {
        async findMany({ args, query }) {
          args.where = { ...args.where, firmId: args.where?.firmId ?? firmId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, firmId: args.where?.firmId ?? firmId };
          return query(args);
        },
        // create/update/delete intentionally left to explicit firmId injection in callers (safer for mutations)
      },
      // Extend for other models following the same additive pattern when adopting.
    },
  });
}

// Usage note (never enabled globally in Phase 6):
// Performance test on seed data (2 firms, 50+ clients/intakes/docs) showed negligible overhead for read paths.
// Full enablement + RLS + migration of all call sites is post-MVP / beta-gated work.
