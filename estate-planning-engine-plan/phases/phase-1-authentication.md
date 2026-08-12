# Phase 1: Authentication & Multi-Tenancy

**Duration**: 3–4 days  
**Goal**: Implement robust, production-grade multi-tenant authentication using Clerk Organizations so that every law firm has complete data isolation and role-based access control.

**Success Criteria**:
- Users can create or join a "Firm" (Clerk Organization)
- Role-based UI and API protection (`owner`, `staff`, `client`)
- Firm context available everywhere via Zustand hook
- Magic link + email invitation flows working
- Audit log of authentication events (basic)

---

## Detailed Sub-Tasks

### 1. Clerk Organization Setup & Configuration

**In Clerk Dashboard**:
- Go to your application → Organizations
- Enable "Allow users to create organizations"
- Set organization slug to be URL-friendly (e.g., firm name slug)
- Add custom roles if desired (start with built-in `org:admin` and map to `owner`)

**Grok Prompt**:
> Create a complete Clerk Organizations setup for a multi-tenant legal SaaS called "Estate Planning Engine".
> Include:
> - Updated `middleware.ts` that extracts organization context
> - `app/(dashboard)/layout.tsx` that enforces organization membership
> - A `useFirm` Zustand store that provides current firm ID, name, role, and switching capability
> - Role guard component `<RoleGuard allowed={['owner', 'staff']}>`
> - Example of how to use it in a server component and client component

### 2. Firm Onboarding Flow

Create a beautiful onboarding experience after first login:

1. If user has no organization → Show "Create Your Law Firm" form
2. Collect: Firm name, website (optional), logo upload (later)
3. On submit: Create Clerk Organization + create `Firm` record in Prisma
4. Redirect to dashboard with firm context set

**Grok Prompt**:
> Build a firm onboarding flow using shadcn/ui. Include form with validation (Zod), Clerk `createOrganization` call, and creation of the corresponding Prisma `Firm` record via Server Action.

### 3. Role-Based Access Control (RBAC)

Define clear roles:

| Role     | Permissions                                      | UI Access                     |
|----------|--------------------------------------------------|-------------------------------|
| `owner`  | Full control, billing, templates, all clients    | Everything                    |
| `staff`  | Create/edit clients, run intake, generate docs   | Most of dashboard             |
| `client` | Only their own intake sessions + view documents  | Limited client portal         |

**Implementation**:
- Store role in Clerk public metadata or in your Prisma `User` model (recommended for querying).
- Create a `getCurrentUserRole()` helper (can be Server Action or cached).

### 4. Client Invitation Flow

Attorneys/staff invite clients to complete intake:

1. Enter client email + basic info
2. Create Clerk user (or use magic link) + create `User` record with role `client`
3. Send invitation email via Resend with magic link
4. Client clicks link → lands in their personalized intake session

**Grok Prompt**:
> Implement a client invitation system. Include Server Action to create invitation, Resend email template, and the client-side intake landing page that validates the magic link and starts the session.

### 5. Session & Security Hardening

- Implement session timeout / refresh strategy with Clerk
- Add basic audit logging (who logged in, when they switched firms, etc.) — store in a simple `AuditLog` model
- Protect all `/api` routes and Server Actions with organization + role checks

### 6. Testing the Multi-Tenant Isolation

**Manual Test Checklist**:
- [ ] Create Firm A as owner
- [ ] Create Firm B as different user
- [ ] Verify Firm A cannot see Firm B's clients or documents (even if you try to hack the URL)
- [ ] Switch between firms (if supporting multiple memberships)
- [ ] Client from Firm A cannot access Firm B data

---

## Key Files to Create/Modify in This Phase

- `middleware.ts` (enhanced)
- `app/(dashboard)/layout.tsx`
- `features/auth/`
  - `useFirm.ts` (Zustand)
  - `RoleGuard.tsx`
  - `invite-client.ts` (Server Action)
- `app/(dashboard)/onboarding/page.tsx`
- `prisma/schema.prisma` (add `AuditLog` model)

---

## Expanded Grok Prompts for Phase 1

**Prompt A – Core Auth Architecture**:
> Design the complete authentication architecture for The Estate Planning Engine using Clerk Organizations. Show how firm context flows from middleware → layout → Zustand store → components. Include TypeScript types for `CurrentFirm` and `CurrentUser`.

**Prompt B – Invitation System**:
> Create the full client invitation flow: form, Server Action, Prisma transaction (create User + IntakeSession), Resend email, and the magic-link landing page. Make it secure and user-friendly for non-technical clients.

---

## Potential Pitfalls

- **Clerk Organization metadata vs Prisma** — Prefer storing authoritative role and firm relationship in Prisma for querying power. Use Clerk for auth only.
- **Client role limitations** — Clients should have very limited access. Start strict and open up only what is necessary.
- **Magic link UX** — Make the email beautiful and the landing page extremely simple (big "Start Intake" button).

---

## Completion Checklist

- [ ] Clerk Organizations fully integrated
- [ ] `useFirm()` hook works across the app
- [ ] Role guards protect sensitive UI
- [ ] Firm onboarding flow complete
- [ ] Client invitation + magic link working end-to-end
- [ ] Basic audit logging in place
- [ ] Multi-tenant isolation manually verified

**Next Phase**: [Phase 2 – Database Models & Core Types](./phase-2-database.md)