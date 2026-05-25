# Phase 6: Security, Polish & Production Readiness

**Duration**: 5–7 days  
**Goal**: Harden the application for real client data, add professional polish, and prepare for beta testing with actual law firms.

**Success Criteria**:
- Strong data isolation and access controls verified
- Audit logging on all sensitive actions
- Professional error handling and user feedback
- Email notifications working
- PDF export option available
- Application feels polished and trustworthy

---

## Security Hardening

### 1. Row Level Security (RLS) & Access Control

Even though Clerk + middleware protects most routes, add defense in depth:

- Prisma middleware or query extensions that automatically filter by `firmId` from the current session
- Postgres RLS policies on all tables (especially `Client`, `IntakeSession`, `GeneratedDocument`, `Template`)
- Server Actions always re-validate the user's firm membership and role before any mutation

**Grok Prompt**:
> Add Prisma query extensions or middleware that automatically scopes all queries to the current user's firm. Also provide example Postgres RLS policies for the core tables.

### 2. Audit Logging

Expand the `AuditLog` model from Phase 2:

Log every:
- Document generation
- Template upload/edit
- Client creation or data change
- User invitation
- Login events (via Clerk webhooks if desired)

Store: `action`, `entity`, `entityId`, `userId`, `firmId`, `metadata` (JSON), timestamp

Create a simple admin view (for owners) to browse recent activity.

### 3. Data Encryption & Privacy

- All PII stored in Postgres is encrypted at rest by Neon
- Consider field-level encryption for highly sensitive fields (SSN, full DOB) if required by future compliance needs
- Never log full answers or document content in plain text logs

### 4. Rate Limiting & Abuse Protection

- Add rate limiting on invitation endpoints and document generation (Inngest or middleware)
- Basic DDoS protection via Vercel

---

## Professional Polish

### Email Notifications (Resend)

Implement key transactional emails:

- Client invitation email (beautiful template)
- "Your intake is complete – attorney will contact you" confirmation
- "New documents ready for review" notification to attorney
- Passwordless magic links (already via Clerk)

**Grok Prompt**:
> Create Resend email templates and Server Actions for client invitation and document-ready notifications. Include both plain text and HTML versions with good branding.

### PDF Export Option

Many attorneys still want a PDF version alongside the editable .docx.

Options:
- Use `docx` library + `pdf-lib` or a headless LibreOffice conversion via API (more complex)
- Or recommend attorneys print/save as PDF from Word (simpler for MVP)

Add a "Generate PDF" button that converts the generated .docx.

### Error Handling & User Feedback

- Consistent toast notifications (success / error / loading)
- Clear, non-technical error messages for clients ("Something went wrong. Please try again or contact your attorney.")
- Sentry integration for production error tracking
- Graceful degradation if AI conversational mode fails (fall back to wizard)

### Loading States & Performance

- Skeleton screens on dashboard tables
- Progress indicators during document generation (can take several seconds)
- Optimistic UI updates where safe

---

## Production Readiness Checklist

- [ ] All sensitive routes and actions properly protected + RLS in place
- [ ] Audit logging on document generation, template changes, and client data modifications
- [ ] Resend emails implemented and tested
- [ ] Error boundaries and toast system in place
- [ ] Sentry configured
- [ ] Basic rate limiting on key endpoints
- [ ] Environment variables properly managed in Vercel
- [ ] `.env.example` complete and up to date
- [ ] Basic monitoring / health check endpoint (optional but nice)

---

## Final Polish Items

- Consistent typography and spacing across the entire app
- Professional empty states and illustrations (use Lucide icons or simple SVGs)
- Footer with legal disclaimers / "Not legal advice" language where appropriate
- Accessibility audit (keyboard navigation, ARIA labels on forms)

**By the end of this phase, the application should feel like a trustworthy, professional tool that an estate planning attorney would feel comfortable using with real client data.**

**Next Phase**: [Phase 7 – Testing, Beta & Launch Preparation](./phase-7-testing-beta.md)