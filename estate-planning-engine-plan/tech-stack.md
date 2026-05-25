# Tech Stack – The Estate Planning Engine

**Goal**: Choose battle-tested, type-safe, scalable technologies that enable rapid development with Grok + Cursor while delivering production-grade reliability, security, and document fidelity.

## Core Principles for Stack Selection
- **Attorney Fidelity First**: Every document must preserve the exact voice, formatting, and structure of the attorney's original templates.
- **Type Safety Everywhere**: Minimize runtime errors in a domain where correctness is critical.
- **Developer Velocity**: Excellent AI tooling support (Grok, Cursor, Vercel AI SDK).
- **Multi-Tenant SaaS Ready**: Secure data isolation between law firms.
- **Serverless-Friendly**: Low operational overhead for solo or small-team development.
- **Legal-Tech Proven Patterns**: Leverage libraries used in real legal automation (docxtemplater is gold standard for .docx fidelity).

## Final Recommended Stack (May 2026)

### Frontend & Fullstack
- **Next.js 15 (App Router + React Server Components + Server Actions)**
  - Why: Best-in-class React framework. Excellent streaming, caching, and edge capabilities. Perfect integration with Vercel.
  - Version: Latest stable (15.x as of May 2026)
  - Key Features Used: Server Actions for mutations, React Server Components for dashboard performance, Route Handlers for API surface.

- **TypeScript (Strict Mode)**
  - `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

- **Tailwind CSS 4 + shadcn/ui + Radix UI**
  - shadcn/ui for beautiful, accessible, customizable components (forms, tables, dialogs, progress).
  - Radix for unstyled primitives when needed.

- **React Hook Form + Zod**
  - Complex, deeply nested forms (assets, beneficiaries, children) with excellent validation and performance.

### State Management & Logic
- **XState (v5)**
  - For the adaptive questionnaire state machine. Provides visualizable, testable, deterministic branching logic. Critical for reliability in legal intake.

- **Zustand**
  - Lightweight global state (Firm context, current intake session, UI preferences).

- **TanStack Query (React Query)**
  - Server state, caching, optimistic updates for dashboard and document lists.

### Authentication & Authorization
- **Clerk.com (with Organizations)**
  - Why: Best developer experience for multi-tenant SaaS in 2026. Built-in Organizations, roles (`owner`, `staff`, `client`), magic links, SSO, and excellent Next.js integration.
  - Features: Role-based access, organization switching, user impersonation for support.

### Backend & Data
- **Prisma ORM + Neon Postgres (Serverless)**
  - Prisma: Best TypeScript ORM with excellent type generation and migration workflow.
  - Neon: Serverless Postgres with branching databases (perfect for preview environments and testing).

- **Row Level Security (RLS)** via Prisma + Postgres policies for firm-level data isolation.

### Document Generation (The Crown Jewel)
- **docxtemplater + pizzip**
  - **Why this is non-negotiable**: It is the most reliable library for taking an attorney's existing .docx template and injecting data while preserving 100% of formatting, styles, headers, footers, numbering, tables, and conditional sections.
  - Supports loops (`{#children}...{/children}`), conditionals, custom modules.
  - Used by serious legal tech companies for exactly this reason.

- **Alternative Considered**: python-docx-template (via Python microservice) — only if docxtemplater becomes insufficient for very complex nested logic.

### AI / Intelligent Layer
- **Vercel AI SDK + Grok API (xAI)**
  - For the conversational intake mode.
  - Constrained to output only validated JSON matching Zod schemas.
  - System prompt includes the full questionnaire structure and strict rules against hallucinating legal language.

### Storage & Assets
- **Supabase Storage** (or AWS S3)
  - Private buckets for attorney templates (.docx) and generated document packages.
  - Signed URLs for secure temporary access.

### Background Jobs & Emails
- **Inngest**
  - Reliable background jobs for document generation (can be long-running), email sending, and cleanup.
- **Resend**
  - Transactional emails (client invitations, document ready notifications, passwordless magic links via Clerk).

### Observability & Analytics
- **Sentry** — Error tracking + performance
- **PostHog** — Product analytics (self-hostable option available)
- **Vercel Analytics** + Speed Insights

### Deployment & DevOps
- **Vercel** (Primary)
  - Zero-config for Next.js. Preview deployments on every PR. Edge functions.
- **GitHub Actions** — CI/CD, linting, type checking, E2E tests
- **Turborepo** — Monorepo management (even if single app initially; easy to add packages later)

### Testing
- **Jest** + **Testing Library** (unit + component)
- **Playwright** (E2E critical flows: intake completion → document generation)
- **Prisma Studio** + **Neon branching** for data testing

### Optional but Recommended Later
- **Stripe** — Usage-based billing or per-firm subscriptions
- **DocuSign / HelloSign** — E-signature integration (Phase 2)
- **Clio / PracticePanther API** — Law firm CRM sync (Phase 3)

## Version Pinning Strategy
- Pin major versions in `package.json`.
- Use Renovate or Dependabot for automated updates with PRs.
- Test major framework upgrades in a separate branch with Neon branch + Vercel preview.

## Why This Stack Wins for This Specific Product
1. **Document Fidelity** — docxtemplater is unmatched for legal .docx work.
2. **Safety + Velocity** — TypeScript + Prisma + Zod + XState = very low chance of silent errors in critical paths.
3. **AI-Native Development** — Excellent support in Cursor and Grok for Next.js, Prisma, and Vercel AI SDK.
4. **Attorney-Centric** — Clerk Organizations map perfectly to "Law Firm" as the tenant.
5. **Low Ops** — Serverless Postgres + Vercel = minimal infrastructure to maintain while scaling to many firms.

---

**Next**: Read `project-structure.md` to see how this stack maps to folders and files.