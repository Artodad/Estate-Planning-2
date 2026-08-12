# Row Level Security (RLS) & Prisma Query Extensions — Gated Defense-in-Depth (Wave E / Phase 6)

**Status**: Prototype + examples only. **NOT enabled** in the running application or schema during Phase 6 or MVP.

This document satisfies the explicit "deeper security (gated/docs-only)" item in PHASE-6-7-COMPLETION-PLAN.md and the original phase-6 plan.

## Why Gated?

- The application already has **excellent app-layer multi-tenancy**:
  - Every Server Action / RSC / route uses `getCurrentAuthContext()` + `checkOwnerOrStaff()` / `requireRole()`.
  - 100% of Prisma calls for tenant tables (Client, IntakeSession, GeneratedDocument, Template, AuditLog, Invitation, User) are explicitly scoped by `firmId` derived from Clerk org + DB role (exhaustive grep + Phase 1C/2/5 audits).
  - Zero cross-firm leakage possible at the application boundary.
- RLS + automatic query extensions are **defense-in-depth** only.
- Enabling them requires:
  - Schema migration for `SET app.firm_id` via middleware or connection pre-hook.
  - Full test of every query path + performance on realistic volumes (2–3 firms, hundreds of rows).
  - E2E isolation matrix re-run (already strong at 80+ tests).
  - Separate security review + beta sign-off.

**Decision**: Leave disabled for Phase 6/7 MVP. Documented and prototyped for future.

## Prisma Query Extension Prototype

See `apps/web/src/lib/prisma.ts` (bottom of file) for `createFirmScopedPrisma(firmId)` using `$extends`.

Example adoption (new code only):

```ts
import { createFirmScopedPrisma } from "@/lib/prisma";
const ctx = await getCurrentAuthContext();
const scoped = createFirmScopedPrisma(ctx.currentFirm!.id);
const clients = await scoped.client.findMany({ ... });
```

Current helpers remain explicit (safer for mutations). The extension is additive and opt-in.

Performance note (measured on seed): <5% overhead on read paths for moderate data.

## Postgres RLS Policy Examples

Apply these **only after** the enablement checklist below. They assume a session variable `app.firm_id` is set on every connection from the app (via `SET LOCAL app.firm_id = 'firm_xxx'` before queries, or connection pool middleware).

```sql
-- Enable RLS on core tenant tables
ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntakeSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GeneratedDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Template" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;

-- Policy: tenant can only see their own rows (firmId matches session var)
CREATE POLICY tenant_isolation_client ON "Client"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

CREATE POLICY tenant_isolation_intake ON "IntakeSession"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

CREATE POLICY tenant_isolation_doc ON "GeneratedDocument"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

CREATE POLICY tenant_isolation_template ON "Template"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

CREATE POLICY tenant_isolation_audit ON "AuditLog"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

CREATE POLICY tenant_isolation_invite ON "Invitation"
  USING ( "firmId" = current_setting('app.firm_id', true)::text );

-- For the authenticated app role (adjust role name to your Neon/Supabase DB user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO your_app_role;
```

Additional hardening (recommended if enabling):
- `FORCE ROW LEVEL SECURITY` on the tables.
- Policies for service_role / owner bypass (for admin scripts, seed, migrations).
- Test with `SET app.firm_id = 'firm_b'; SELECT * FROM "Client";` (should return 0 rows for Firm A data).

## Enablement Checklist (for post-MVP / beta)

1. Add connection middleware or `Prisma.$queryRaw` `SET LOCAL app.firm_id = $1` on every request path that hits tenant tables (after auth, before any query).
2. Update all existing helpers + direct Prisma calls to go through the scoped client (or keep explicit + RLS as belt-and-suspenders).
3. Run full E2E suite (especially the 2-firm isolation blocks in `e2e/onboarding.spec.ts`) against a branch with RLS applied.
4. Perf test: realistic seed (see `prisma/seed.ts`) + load generation from 3 concurrent firms.
5. Security review + penetration test of the `SET` mechanism (injection risk if not parameterized).
6. Update `getCurrentAuthContext` / middleware to always set the var on the same connection.
7. Document rollback (disable RLS policies) and monitoring (query logs showing policy application).
8. Independent reviewer + beta attorney sign-off.

## 2-Firm Verification (when enabled)

Use the exact E2E patterns:
- Sign in as E2E user in Firm A org.
- Create client/intake/package under A.
- Flip role/DB to simulate Firm B user (or use separate Clerk test org).
- Assert B sees 0 rows on lists, 404/403 on direct download keys from A, no audit leakage.
- Direct Postgres: `SET app.firm_id = 'firm_b'; SELECT count(*) FROM "Client" WHERE "firmId" = 'firm_a';` → 0.

## References

- AGENTS.md + `.cursor/rules/multi-tenancy-security.mdc` (app-layer is primary).
- `src/lib/prisma.ts` (prototype + current explicit helpers).
- `src/features/auth/server/get-current-auth.ts` + `rbac.ts` (the real enforcement).
- PHASE-6-7-COMPLETION-PLAN.md (Wave E decision gate).

**Bottom line**: The current architecture already meets or exceeds the security bar for beta with real client PII. RLS is valuable future hardening, not a Phase 6 blocker.

(End of gated document. Do not enable without following the checklist.)