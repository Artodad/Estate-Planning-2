# Phase 0: Foundations & Monorepo Setup

**Duration**: 2–3 days  
**Goal**: Create a clean, scalable, production-ready monorepo with all core dependencies and scaffolding so that subsequent phases can move extremely fast.

**Success Criteria**:
- `npm run dev` works with Clerk login
- Prisma connected to Neon and can run migrations
- shadcn/ui components installable and working
- First Grok-generated code integrated cleanly
- `.env.example` fully documented

---

## Step-by-Step Execution

### Step 1: Create the Turborepo + Next.js Project

```bash
# From your projects folder
npx create-turbo@latest estate-planning-engine --example with-tailwind
cd estate-planning-engine

# Initialize shadcn/ui in the web app
cd apps/web
pnpm dlx shadcn@latest init
```

> **Note**: The `create-turbo` template uses **pnpm**, not npm. Check the root `package.json` for `"packageManager": "pnpm@..."`. Use `pnpm` for all installs in this monorepo.

**When shadcn asks**:
- Style: Default
- Base color: Slate or Zinc (neutral, professional for legal)
- CSS variables: Yes
- Tailwind: Yes (already there)

### Step 2: Install Core Dependencies

Run these commands from `apps/web` (or from the repo root with `--filter web`):

```bash
cd apps/web

pnpm add @clerk/nextjs @prisma/client docxtemplater pizzip xstate @xstate/react zustand @tanstack/react-query ai zod react-hook-form @hookform/resolvers date-fns
pnpm add -D prisma
```

From the repo root instead:

```bash
pnpm add @clerk/nextjs @prisma/client docxtemplater pizzip xstate @xstate/react zustand @tanstack/react-query ai zod react-hook-form @hookform/resolvers date-fns --filter web
pnpm add -D prisma --filter web
```

**Why these packages** (see `tech-stack.md` for full rationale):
- Clerk: Auth + multi-tenancy
- Prisma + Neon: Database (`prisma` CLI is dev-only; `@prisma/client` is runtime)
- docxtemplater + pizzip: Document generation
- XState: Questionnaire logic
- Zustand + TanStack Query: State
- `ai` (Vercel AI SDK): Conversational mode — **not** `@vercel/ai-sdk` (that package does not exist)
- Zod + React Hook Form: Forms

> `lucide-react` is already installed by the Turborepo template — skip it unless you need to upgrade.

### Step 3: Initialize Prisma

```bash
npx prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and `.env`.

### Step 4: Set Up Environment Variables

Create `.env.example` in `apps/web` (and copy to `.env` locally):

```env
# === Clerk Authentication ===
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# === Database (Neon) ===
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# === AI (Grok / xAI) ===
GROK_API_KEY=xai-...

# === Storage (Supabase or S3) ===
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# === Emails ===
RESEND_API_KEY=re_...

# === Optional: Inngest ===
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

**Important**: Never commit real secrets. Use Vercel environment variables for production.

### Step 5: First Grok Prompt – Project Scaffolding

Copy and run this prompt in Grok:

> You are building "The Estate Planning Engine", a multi-tenant SaaS for estate planning attorneys.
>
> Create the complete initial project scaffolding for a Turborepo + Next.js 15 App Router project with:
> - Clerk Organizations middleware and layout setup
> - Basic root layout with Clerk provider
> - A simple protected dashboard route group
> - A public landing page
> - Prisma client singleton in `lib/prisma.ts`
> - Example Server Action
> - Tailwind + shadcn/ui already initialized
>
> Provide the exact files to create or modify and the code for each.

**Expected Output**:
- `middleware.ts`
- `app/layout.tsx` updates
- `app/(dashboard)/layout.tsx`
- `lib/prisma.ts`
- Basic `app/(dashboard)/page.tsx`

### Step 6: Integrate Clerk Organizations

After Grok gives you the code:

1. Paste into the correct files using Cursor.
2. Run `npm run dev`.
3. Create a Clerk account (if you don't have one) → Create new application → Enable Organizations.
4. Add your `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
5. Test creating an organization (this will represent a "Law Firm").

### Step 7: First Database Migration

Update `prisma/schema.prisma` with a minimal starting schema (you will expand heavily in Phase 2):

```prisma
model Firm {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     User[]
}

model User {
  id        String   @id @default(cuid())
  clerkId   String   @unique
  email     String
  role      String   // owner | staff | client
  firmId    String
  firm      Firm     @relation(fields: [firmId], references: [id])
  createdAt DateTime @default(now())
}
```

Then:

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### Step 8: Add Basic UI Polish

Install a few high-value shadcn components:

```bash
pnpm dlx shadcn@latest add button card input label form table dialog progress
```

### Step 9: Create Phase 0 Checklist

Mark these as done when complete:

- [ ] Turborepo + Next.js 15 created
- [ ] shadcn/ui initialized
- [ ] All core npm packages installed
- [ ] Prisma initialized and first migration run
- [ ] Clerk Organizations working (can create firm)
- [ ] `.env.example` documented
- [ ] First Grok scaffolding prompt used and integrated
- [ ] `npm run dev` shows working app with login
- [ ] Git repo initialized and first commit made

---

## Potential Issues & Fixes

**`npm ERR! Cannot read properties of null (reading 'name')` on Step 2**  
→ Two common causes:
1. **Wrong package manager** — this repo is a pnpm monorepo. Do not use `npm install`; use `pnpm add` as shown above.
2. **Wrong AI SDK package name** — `@vercel/ai-sdk` returns 404 from npm. Install `ai` instead.

If you already ran `npm install` and things feel broken, delete any `package-lock.json` npm may have created, then from the repo root run `pnpm install`.

**Clerk middleware not protecting routes**  
→ Double-check that your `middleware.ts` matcher includes the dashboard routes.

**Prisma client not generating types**  
→ Run `npx prisma generate` again and restart your TS server in Cursor/VS Code.

**Neon connection issues**  
→ Make sure your Neon project allows connections from your IP (or use connection pooling string).

---

## What Success Looks Like at End of Phase 0

You have a clean, modern foundation where:
- Authentication is handled by Clerk with firm context ready.
- Database is connected and typed.
- You can start building features immediately in Phase 1 without fighting tooling.

**Next Phase**: [Phase 1 – Authentication & Multi-Tenancy](./phase-1-authentication.md)