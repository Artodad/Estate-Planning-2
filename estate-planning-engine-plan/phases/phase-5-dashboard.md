# Phase 5: Attorney Dashboard & Workflow

**Duration**: 5–7 days  
**Goal**: Build a clean, powerful, data-dense dashboard that attorneys and staff actually enjoy using every day — the command center for all client work and document generation.

**Success Criteria**:
- Clear overview of all clients and their intake/document status
- One-click access to generate documents or full plan packages
- Template management integrated
- Activity / recent generations visible
- Fast, responsive, and professional feel

---

## Dashboard Information Architecture

**Main Sections** (use tabs or sidebar navigation):

1. **Overview / Home**
   - Stats: Active clients, intakes in progress, documents generated this month
   - Quick actions: "Invite New Client", "Upload Template", "Generate Reports"

2. **Clients**
   - Table or card grid of all clients
   - Columns: Name, Email, Status (Intake %, Documents Ready), Last Activity, Actions
   - Filters: All / Intake In Progress / Documents Pending / Completed
   - Search by name/email

3. **Intakes**
   - List of active + recent intake sessions
   - Ability to resume, view answers (read-only for staff), or delete

4. **Documents**
   - History of generated documents and packages
   - Download links, regeneration buttons

5. **Templates**
   - Manage firm's document templates (link to Phase 4 UI)

---

## Key Features to Implement

### Client Table (Core of the Dashboard)

Use shadcn/ui `Table` + TanStack Table (or simple state) for:
- Sorting
- Filtering
- Pagination (or infinite scroll if many clients)
- Row actions: "View Intake", "Generate Documents", "Send Reminder"

**Grok Prompt**:
> Build a professional client management table for an estate planning dashboard using shadcn/ui Table component. Include status badges, action menus, search, and filters. Make it fast and clean.

### One-Click Document Generation

From the client row or detail page:
- "Generate Full Plan" → triggers Phase 4 package generation + shows progress toast
- Individual document buttons for quick regeneration of single documents

Show clear status:
- "No Intake Completed"
- "Intake 87% Complete"
- "Documents Ready (Last generated: May 20)"

### Activity Feed / Recent Generations

Simple list or cards showing:
- "John Smith – Full Estate Plan generated"
- "Jane Doe – Revocable Trust regenerated"
- With timestamps and "Download" / "View" actions

### Client Detail Page

`/clients/[clientId]`
- Summary info
- Current intake status + "Resume Intake" or "View Answers"
- List of generated documents with download/regenerate
- Notes / internal comments (simple textarea + save)

---

## Technical Implementation Notes

- Use **TanStack Query** for all data fetching (clients list, stats, documents)
- Use **Server Actions** for mutations (generate documents, update status)
- Optimistic updates where it improves perceived speed (e.g., marking intake complete)
- Skeleton loaders for tables while data loads

**Grok Prompt**:
> Create the main attorney dashboard layout with sidebar navigation, stats cards, and a client table. Include TanStack Query integration for data fetching and Server Actions for key mutations like "Generate Full Plan".

---

## Polish & UX Touches

- Keyboard shortcuts (e.g., `/` to focus search)
- Empty states with helpful illustrations and CTAs
- Status badges with consistent color coding (green = ready, yellow = in progress, gray = not started)
- Responsive design (many attorneys use tablets or multiple monitors)

---

## Completion Checklist

- [ ] Dashboard home with stats and quick actions
- [ ] Fully functional Clients table with search/filter/actions
- [ ] Client detail page
- [ ] Integrated "Generate Documents" flow (calls Phase 4 engine)
- [ ] Activity / recent items feed
- [ ] Template management accessible from dashboard
- [ ] Good loading and empty states

**At the end of this phase, the product starts to feel like a real, usable tool for a working law firm.**

**Next Phase**: [Phase 6 – Security, Polish & Production Readiness](./phase-6-security-polish.md)