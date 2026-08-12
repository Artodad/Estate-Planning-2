# Phase 2: Database Models & Core Types

**Duration**: 2–3 days  
**Goal**: Design and implement a robust, type-safe Prisma schema that supports multi-tenancy, flexible questionnaire answers, document history, and future extensibility while maintaining excellent query performance.

**Success Criteria**:
- Complete Prisma schema with all core models
- First migration applied to Neon
- Zod schemas generated or mirrored from Prisma where possible
- Seeding script for development data
- Clear understanding of how answers will be stored (JSONB + normalized relations)

---

## Core Data Model Philosophy

**Two approaches for questionnaire answers** (we use a hybrid):

1. **JSONB column** (`answers` on `IntakeSession`) — Flexible, fast for the dynamic questionnaire. Great for most use cases.
2. **Normalized tables** (`Child`, `Asset`, `Beneficiary`, `DecisionMaker`) — For relationships that need to be queried across sessions or used in complex document mapping.

This hybrid gives both flexibility and query power.

---

## Recommended Prisma Schema (Start Here)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Firm {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  logoUrl     String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users       User[]
  clients     Client[]
  templates   Template[]
  intakeSessions IntakeSession[]
  documents   GeneratedDocument[]
}

model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  email     String   @unique
  firstName String?
  lastName  String?
  role      String   // owner | staff | client
  firmId    String
  firm      Firm     @relation(fields: [firmId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Client {
  id          String   @id @default(cuid())
  firmId      String
  firm        Firm     @relation(fields: [firmId], references: [id])
  firstName   String
  lastName    String
  email       String
  phone       String?
  dateOfBirth DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  intakeSessions IntakeSession[]
}

model IntakeSession {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  firmId      String
  firm        Firm     @relation(fields: [firmId], references: [id])
  status      String   @default("in_progress") // in_progress | completed | abandoned
  progress    Int      @default(0)             // 0-100
  answers     Json?                            // Flexible JSONB storage
  startedAt   DateTime @default(now())
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  generatedDocuments GeneratedDocument[]
}

model Template {
  id          String   @id @default(cuid())
  firmId      String
  firm        Firm     @relation(fields: [firmId], references: [id])
  name        String
  description String?
  fileKey     String   // Storage key for the .docx template
  documentType String  // revocable_trust | pour_over_will | poa | etc.
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model GeneratedDocument {
  id             String   @id @default(cuid())
  intakeSessionId String
  intakeSession  IntakeSession @relation(fields: [intakeSessionId], references: [id])
  firmId         String
  firm           Firm     @relation(fields: [firmId], references: [id])
  templateId     String?
  template       Template? @relation(fields: [templateId], references: [id])
  documentType   String
  fileKey        String   // Storage key for generated .docx or .pdf
  status         String   @default("pending") // pending | generated | failed
  generatedAt    DateTime?
  createdAt      DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  firmId    String
  userId    String?
  action    String
  entity    String?
  entityId  String?
  metadata  Json?
  createdAt DateTime @default(now())
}
```

---

## Key Design Decisions

### Why `answers` as `Json?` on `IntakeSession`?
- The questionnaire is highly dynamic (different branches, repeating sections).
- JSONB in Postgres is excellent for this in 2026.
- We still normalize key entities (`Child`, `Asset`, etc.) in later phases if querying across sessions becomes important.

### Why separate `Template` and `GeneratedDocument`?
- Templates belong to the firm and can be reused.
- Generated documents are tied to a specific intake session and represent a point-in-time snapshot.

### Indexing Strategy
Add these indexes for performance:

```prisma
model IntakeSession {
  ...
  @@index([firmId, status])
  @@index([clientId])
}

model GeneratedDocument {
  ...
  @@index([firmId, createdAt])
}
```

---

## Implementation Steps

### Step 1: Paste the schema into `prisma/schema.prisma`

Use the schema above as your starting point.

### Step 2: Run Migration

```bash
npx prisma generate
npx prisma migrate dev --name add-core-models
```

### Step 3: Create Development Seed Script

Create `prisma/seed.ts`:

```ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create a sample firm
  const firm = await prisma.firm.create({
    data: {
      name: "Austin & Austin Law",
      slug: "austin-austin-law",
    },
  })

  console.log(`Created firm: ${firm.name}`)
}

main()
  .then(() => prisma.$disconnect())
  .catch(console.error)
```

Add to `package.json`:

```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

Run with:

```bash
npx prisma db seed
```

### Step 4: Generate Zod Schemas (Optional but Powerful)

You can use `prisma-zod-generator` or manually create matching Zod schemas in `packages/core/src/schemas/`.

For speed, start by manually creating key Zod schemas that mirror the Prisma models for form validation.

### Step 5: Grok Prompt for Schema Review

> Review the following Prisma schema for a multi-tenant estate planning SaaS. Suggest improvements for performance, data integrity, future extensibility (especially around questionnaire answers and document versioning), and any missing relationships.

---

## Completion Checklist

- [ ] Full Prisma schema implemented and migrated
- [ ] Development seed script working
- [ ] Basic CRUD operations tested via Prisma Studio or a test Server Action
- [ ] Zod schemas started for key models (at minimum `Client` and `IntakeSession`)
- [ ] Indexes added for common query patterns
- [ ] Documentation of the hybrid JSONB + normalized approach in comments

**Next Phase**: [Phase 3 – Intelligent Intake & Questionnaire Engine](./phase-3-questionnaire.md)