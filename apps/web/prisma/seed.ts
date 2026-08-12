import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

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

const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!globalForPrisma.prisma) {
      globalForPrisma.prisma = createPrismaClient();
    }
    const client = globalForPrisma.prisma;
    const value = Reflect.get(client, prop, client);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});

const SEED_ORG_PREFIX = "seed_";

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.log("Seed skipped in production");
    return;
  }

  console.log("🌱 Starting Phase 2 development seed (idempotent, realistic CA estate planning data)...");

  // Clean previous seed data (cascades where possible; delete children first for safety)
  console.log("🧹 Cleaning previous seed data...");
  await prisma.generatedDocument.deleteMany({
    where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } },
  });
  await prisma.intakeSession.deleteMany({
    where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } },
  });
  await prisma.client.deleteMany({
    where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } },
  });
  await prisma.template.deleteMany({
    where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } },
  });
  await prisma.user.deleteMany({
    where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } },
  });
  await prisma.firm.deleteMany({
    where: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } },
  });

  // ============================================================
  // FIRMS (2 realistic small CA estate planning firms)
  // ============================================================
  console.log("🏛️  Creating seed firms...");
  const austinFirm = await prisma.firm.create({
    data: {
      name: "Austin & Austin Law",
      slug: "seed-austin-law",
      clerkOrgId: "seed_org_austin",
    },
  });

  const klineFirm = await prisma.firm.create({
    data: {
      name: "Kline Thompson LLP",
      slug: "seed-kline-llp",
      clerkOrgId: "seed_org_kline",
    },
  });

  // Users per firm (owner + staff, fake clerkIds for dev)
  await prisma.user.createMany({
    data: [
      { clerkId: "seed_clerk_owner_a1", email: "maria.austin@seed-austin-law.example", role: "owner", firmId: austinFirm.id },
      { clerkId: "seed_clerk_staff_a2", email: "jordan.lee@seed-austin-law.example", role: "staff", firmId: austinFirm.id },
      { clerkId: "seed_clerk_owner_k1", email: "sarah.kline@seed-kline-llp.example", role: "owner", firmId: klineFirm.id },
      { clerkId: "seed_clerk_staff_k2", email: "david.chen@seed-kline-llp.example", role: "staff", firmId: klineFirm.id },
    ],
  });

  // ============================================================
  // TEMPLATES (core estate planning package per firm, 8 types)
  // ============================================================
  console.log("📄 Creating seed templates...");
  const documentTypes = [
    "revocable_trust",
    "pour_over_will",
    "durable_poa",
    "healthcare_directive",
    "hipaa",
    "certificate_of_trust",
    "personal_property_memo",
    "trust_funding",
  ] as const;

  const austinTemplates = await Promise.all(
    documentTypes.map((dt, i) =>
      prisma.template.create({
        data: {
          firmId: austinFirm.id,
          name: `${dt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (v1)`,
          description: `California ${dt.replace(/_/g, " ")} template for ${austinFirm.name}`,
          fileKey: `templates/seed/austin/${dt}_ca_v1.docx`,
          documentType: dt,
          isActive: true,
        },
      }),
    ),
  );

  const klineTemplates = await Promise.all(
    documentTypes.map((dt, i) =>
      prisma.template.create({
        data: {
          firmId: klineFirm.id,
          name: `${dt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} (v1)`,
          description: `California ${dt.replace(/_/g, " ")} template for ${klineFirm.name}`,
          fileKey: `templates/seed/kline/${dt}_ca_v1.docx`,
          documentType: dt,
          isActive: true,
        },
      }),
    ),
  );

  const allTemplates = [...austinTemplates, ...klineTemplates];

  // ============================================================
  // CLIENTS + INTAKE SESSIONS + GENERATED DOCS (hybrid answers exercised)
  // Using realistic CA names, community property, revocable trusts, etc.
  // ============================================================
  console.log("👥 Creating seed clients, intake sessions (with rich answers JSONB), and generated documents...");

  // Austin firm clients (3)
  const austinClientsData = [
    {
      displayName: "Elena M. Vargas Revocable Living Trust",
      firstName: "Elena",
      lastName: "Vargas",
      email: "elena.vargas@familytrust.example",
      phone: "(415) 555-0192",
      dateOfBirth: new Date("1975-04-12"),
      notes: "Primary residence in San Francisco; community property with spouse. Minor child provisions included. Ready for final review and funding instructions.",
    },
    {
      displayName: "Robert Chen & Lisa Patel (Joint Estate Plan)",
      firstName: "Robert",
      lastName: "Chen",
      email: "robert.chen+estate@techpartners.example",
      phone: "(650) 555-0148",
      dateOfBirth: new Date("1982-09-03"),
      notes: "High net worth couple; significant stock options + rental properties. Awaiting beneficiary designations and specific bequest details.",
    },
    {
      displayName: "Hector & Maria Ruiz Community Property Trust",
      firstName: "Hector",
      lastName: "Ruiz",
      email: "ruiz.family@californiahomes.example",
      phone: "(310) 555-0277",
      dateOfBirth: new Date("1968-11-22"),
      notes: "Long-time clients. 2023 plan update in progress. Two adult children; specific personal property memo requested.",
    },
  ];

  // Kline firm clients (3)
  const klineClientsData = [
    {
      displayName: "The Morrison Family Trust (David & Susan)",
      firstName: "David",
      lastName: "Morrison",
      email: "dmorrison@legacyholdings.example",
      phone: "(415) 555-0331",
      dateOfBirth: new Date("1965-02-14"),
      notes: "Pour-over will + RLT complete. Recent asset addition (vacation home) requires updated Schedule A and funding memo.",
    },
    {
      displayName: "Aisha K. Thompson (Single Estate Plan)",
      firstName: "Aisha",
      lastName: "Thompson",
      email: "aisha@thompsonadvisors.example",
      phone: "(510) 555-0189",
      dateOfBirth: new Date("1990-07-08"),
      notes: "New client via referral. Young professional with real estate + retirement accounts. Intake paused at healthcare directive section.",
    },
    {
      displayName: "William J. Foster Revocable Trust (Widower)",
      firstName: "William",
      lastName: "Foster",
      email: "william.foster@retiredexec.example",
      phone: "(831) 555-0066",
      dateOfBirth: new Date("1948-12-01"),
      notes: "Straightforward plan with large charitable bequest to university. Certificate of Trust requested for bank accounts.",
    },
  ];

  const createdClients: any[] = [];

  // Austin clients + intakes
  for (const c of austinClientsData) {
    const client = await prisma.client.create({ data: { firmId: austinFirm.id, ...c } });
    createdClients.push(client);

    // Intake 1: completed (rich hybrid answers with CA community property + children)
    const answers1 = {
      profile: {
        firstName: c.firstName,
        lastName: c.lastName,
        dateOfBirth: c.dateOfBirth?.toISOString().split("T")[0],
        maritalStatus: "married",
        spouse: { name: "Marco Vargas", dob: "1974-06-20", ssnLast4: "1234" },
      },
      family: {
        children: [
          { name: "Sofia Vargas", dob: "2015-03-12", isMinor: true, relationship: "daughter" },
          { name: "Mateo Vargas", dob: "2018-08-05", isMinor: true, relationship: "son" },
        ],
      },
      assets: {
        realEstate: [
          {
            address: "456 Maple Ave, San Francisco, CA 94102",
            county: "San Francisco",
            valueEst: 1850000,
            isCommunityProperty: true,
            ownership: "community",
          },
        ],
        bankAccounts: [
          { institution: "First Republic Bank", last4: "4421", balanceEst: 245000, isCommunityProperty: true },
        ],
        brokerage: [{ institution: "Vanguard", accountType: "taxable", valueEst: 620000 }],
      },
      healthcare: {
        primaryAgent: { name: "Marco Vargas", relationship: "spouse", phone: "(415) 555-0193" },
        alternateAgent: { name: "Isabella Vargas", relationship: "sister", phone: "(510) 555-7722" },
      },
      estatePlan: {
        trustType: "revocable_living_trust",
        pourOverWill: true,
        specificBequests: "Grandmother's china set to Sofia; 529 contributions for both children.",
        wishes: "Emphasize education and family traditions. No life support if permanent vegetative state.",
      },
    };

    const intake1 = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId: austinFirm.id,
        status: "completed",
        progress: 100,
        answers: answers1,
        startedAt: new Date("2026-05-10T09:00:00Z"),
        completedAt: new Date("2026-05-18T14:30:00Z"),
      },
    });

    // 6 generated docs for completed intake (use templates)
    const docTypesForPackage = ["revocable_trust", "pour_over_will", "durable_poa", "healthcare_directive", "certificate_of_trust", "trust_funding"];
    for (let i = 0; i < docTypesForPackage.length; i++) {
      const dt = docTypesForPackage[i];
      const tmpl = austinTemplates.find((t) => t.documentType === dt);
      await prisma.generatedDocument.create({
        data: {
          intakeSessionId: intake1.id,
          firmId: austinFirm.id,
          templateId: tmpl?.id,
          documentType: dt,
          fileKey: `generated/seed/2026-05/${austinFirm.slug}/${intake1.id}/${dt}_draft.docx`,
          status: "generated",
          generatedAt: new Date("2026-05-19T11:00:00Z"),
        },
      });
    }

    // Intake 2: in-progress (partial answers, lower progress)
    const answers2 = {
      profile: { firstName: c.firstName, lastName: c.lastName, maritalStatus: "married" },
      assets: {
        realEstate: [
          { address: "456 Maple Ave, San Francisco, CA 94102", isCommunityProperty: true },
        ],
      },
      // healthcare and wishes branches not yet completed
    };
    await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId: austinFirm.id,
        status: "in_progress",
        progress: 45,
        answers: answers2,
        startedAt: new Date("2026-05-24T10:15:00Z"),
      },
    });
  }

  // Kline clients + intakes (similar hybrid variety, one abandoned)
  for (const c of klineClientsData) {
    const client = await prisma.client.create({ data: { firmId: klineFirm.id, ...c } });
    createdClients.push(client);

    // Completed intake with different structure (widower, charitable, no minor children)
    const answersK = {
      profile: {
        firstName: c.firstName,
        lastName: c.lastName,
        dateOfBirth: c.dateOfBirth?.toISOString().split("T")[0],
        maritalStatus: "widowed",
      },
      family: {
        children: [], // adult children noted in narrative only
      },
      assets: {
        realEstate: [
          { address: "12 Sea Cliff Ave, Carmel, CA 93923", county: "Monterey", valueEst: 1425000, isCommunityProperty: false },
        ],
        bankAccounts: [{ institution: "Monterey Credit Union", last4: "9912", balanceEst: 89000, isCommunityProperty: false }],
      },
      estatePlan: {
        trustType: "revocable_living_trust",
        charitableBequests: [{ org: "Stanford University", amountEst: 250000, purpose: "scholarship fund" }],
        wishes: "Simple service; no heroic measures. Certificate of Trust for liquidity accounts.",
      },
    };

    const intakeK = await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId: klineFirm.id,
        status: "completed",
        progress: 100,
        answers: answersK,
        startedAt: new Date("2026-05-05T08:30:00Z"),
        completedAt: new Date("2026-05-12T16:45:00Z"),
      },
    });

    // 5 docs
    const kDocTypes = ["revocable_trust", "pour_over_will", "certificate_of_trust", "personal_property_memo", "trust_funding"];
    for (const dt of kDocTypes) {
      const tmpl = klineTemplates.find((t) => t.documentType === dt);
      await prisma.generatedDocument.create({
        data: {
          intakeSessionId: intakeK.id,
          firmId: klineFirm.id,
          templateId: tmpl?.id,
          documentType: dt,
          fileKey: `generated/seed/2026-05/${klineFirm.slug}/${intakeK.id}/${dt}_draft.docx`,
          status: "generated",
          generatedAt: new Date("2026-05-13T09:20:00Z"),
        },
      });
    }

    // Another intake: abandoned for demo
    await prisma.intakeSession.create({
      data: {
        clientId: client.id,
        firmId: klineFirm.id,
        status: "abandoned",
        progress: 22,
        answers: { profile: { firstName: c.firstName }, assets: {} },
        startedAt: new Date("2026-05-15T14:00:00Z"),
      },
    });
  }

  const finalFirmCount = await prisma.firm.count({ where: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } });
  const finalClientCount = await prisma.client.count({ where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } } });
  const finalIntakeCount = await prisma.intakeSession.count({ where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } } });
  const finalDocCount = await prisma.generatedDocument.count({ where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } } });
  const finalTemplateCount = await prisma.template.count({ where: { firm: { clerkOrgId: { startsWith: SEED_ORG_PREFIX } } } });

  console.log("✅ Seed complete!");
  console.log(`   Firms: ${finalFirmCount}`);
  console.log(`   Clients: ${finalClientCount}`);
  console.log(`   IntakeSessions (mix of completed/in_progress/abandoned + rich answers JSONB): ${finalIntakeCount}`);
  console.log(`   GeneratedDocuments: ${finalDocCount}`);
  console.log(`   Templates: ${finalTemplateCount}`);
  console.log("   (Hybrid model exercised: answers contain nested profile/family/assets/healthcare/estatePlan with CA community property flags.)");
  console.log("   Run `cd apps/web && npx prisma studio` to explore. Data is fully firm-scoped.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect?.();
  });
