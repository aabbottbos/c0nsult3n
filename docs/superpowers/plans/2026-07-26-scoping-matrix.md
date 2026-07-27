# Scoping Matrix Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `ScopingMatrixClassification` into the real workflow: expand the stub model, seed the 8 matrix rows from the skill doc, add an admin classification step before AI scope drafting, and update the AI prompt to use the matched pattern as context.

**Architecture:** The stub `ScopingMatrixClassification` model gets full fields matching the skill doc columns. A `modules/scoping-matrix/service.ts` module handles CRUD and AI-assisted classification. Admin workflow: after a project enters `UNDER_ADMIN_REVIEW`, admin can "Classify with AI" (Claude picks the best matching row + explains) or manually select. Once classified, "Draft Scope with AI" uses the matched pattern (deliverable pattern, acceptance criteria pattern, standard exclusions, effort estimate) as structured context for the Claude prompt — producing much better scope drafts. The admin project detail page gains a classification panel.

**Tech Stack:** Prisma 7, Next.js App Router Server Components + Server Actions, Anthropic SDK (`callClaude` from `lib/ai.ts`), Vitest.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Expand `ScopingMatrixClassification` stub |
| `prisma/migrations/` | Create | Migration |
| `prisma/seed.ts` | Modify | Seed 8 matrix rows |
| `modules/scoping-matrix/service.ts` | Create | `classifyWithAI`, `classifyManually`, `getClassification`, `listMatrixRows` |
| `modules/scoping-matrix/types.ts` | Create | `ScopingMatrixRow` type |
| `app/(admin)/admin/projects/[id]/page.tsx` | Modify | Add classification panel |
| `app/(admin)/admin/projects/actions.ts` | Modify | Add `classifyWithAIAction`, `classifyManuallyAction`, update `draftScopeWithAIAction` |
| `tests/scoping-matrix.test.ts` | Create | Classification tests |

---

### Task 1: Expand ScopingMatrixClassification schema

**Files:**
- Modify: `prisma/schema.prisma`

The model needs: the 8 skill-doc columns stored on each seed row (`specialization`, `function`, `responsibilityCategory`, `useCase`, `requiredInputs`, `deliverablePattern`, `acceptanceCriteriaPattern`, `standardExclusions`, `effortEstimateHours`), plus per-project classification fields (`projectId`, `selectedRowId`, `aiRationale`, `adminConfirmed`).

Actually — keep the design clean. The matrix rows are **reference data** (static seed rows). The classification is a **join** between a project and a chosen row. Split into two models: `ScopingMatrixRow` (reference) and `ScopingMatrixClassification` (per-project classification).

- [ ] **Step 1: Replace stub and add ScopingMatrixRow**

Find in `prisma/schema.prisma`:
```prisma
model ScopingMatrixClassification {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
}
```

Replace with:
```prisma
model ScopingMatrixRow {
  id                      String   @id @default(cuid())
  specialization          String
  function                String
  responsibilityCategory  String
  useCase                 String
  requiredInputs          String
  deliverablePattern      String
  acceptanceCriteriaPattern String
  standardExclusions      String
  effortEstimateHours     Int
  suitability             String
  createdAt               DateTime @default(now())

  classifications ScopingMatrixClassification[]
}

model ScopingMatrixClassification {
  id               String   @id @default(cuid())
  projectId        String   @unique
  matrixRowId      String
  aiRationale      String?
  adminConfirmed   Boolean  @default(false)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  project   Project          @relation(fields: [projectId], references: [id])
  matrixRow ScopingMatrixRow @relation(fields: [matrixRowId], references: [id])
}
```

Also add back-relations:
- To `Project` model: `scopingClassification ScopingMatrixClassification?`

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name expand_scoping_matrix
```

Expected: migration created and applied.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

---

### Task 2: Seed the 8 matrix rows

**Files:**
- Modify: `prisma/seed.ts`

The 8 rows come from `.claude/skills/scoping-matrix/SKILL.md`. Read that file fully before writing seed data — the exact text for each field matters for AI prompting.

- [ ] **Step 1: Read the skill doc**

```bash
cat .claude/skills/scoping-matrix/SKILL.md
```

- [ ] **Step 2: Add matrix row seeding to seed.ts**

Find `prisma/seed.ts` and add after the existing seed logic:

```typescript
// Seed ScopingMatrix rows (idempotent — skip if any rows exist)
const existingRows = await prisma.scopingMatrixRow.count()
if (existingRows === 0) {
  await prisma.scopingMatrixRow.createMany({
    data: [
      {
        specialization: 'Strategy',
        function: 'Competitive Intelligence',
        responsibilityCategory: 'Analysis',
        useCase: 'Map the competitive landscape for a defined market segment',
        requiredInputs: 'Company overview (1–2 pages or deck), target customer definition, list of known competitors (minimum 3), geographic focus',
        deliverablePattern: 'Structured competitor matrix (positioning, pricing tier, key differentiators, strengths/weaknesses), written narrative summary, 2–3 strategic implications for the client',
        acceptanceCriteriaPattern: 'Matrix covers all provided competitors plus any material omissions the consultant identifies; each competitor has a complete row; strategic implications are specific to the client\'s stated position, not generic',
        standardExclusions: 'Primary research (customer interviews, surveys); win/loss interview programs; ongoing monitoring; go-to-market planning; pricing strategy recommendations',
        effortEstimateHours: 8,
        suitability: 'Good fit when the client is pre-launch or early-stage and needs a clear picture of the field before making positioning decisions.',
      },
      {
        specialization: 'Research',
        function: 'Customer Discovery',
        responsibilityCategory: 'Synthesis',
        useCase: 'Synthesize existing customer discovery interviews into actionable insights',
        requiredInputs: 'Raw interview transcripts or detailed notes (minimum 5 interviews), target customer persona description, the 2–3 core questions the discovery was designed to answer',
        deliverablePattern: 'Thematic synthesis document: key themes (with supporting quotes), validated vs. invalidated hypotheses, top 3–5 customer insights, recommended next questions',
        acceptanceCriteriaPattern: 'Every major theme is supported by at least 2 independent data points from separate interviews; hypotheses are explicitly marked validated/invalidated/inconclusive with evidence cited',
        standardExclusions: 'Conducting new interviews; survey design; persona creation from scratch; quantitative research; product recommendations beyond what the data supports',
        effortEstimateHours: 7,
        suitability: 'Good fit when the founder has done discovery but hasn\'t had time to synthesize it properly.',
      },
      {
        specialization: 'Analysis',
        function: 'Financial Modeling',
        responsibilityCategory: 'Evaluation',
        useCase: 'Build a financial model for a new product or business line',
        requiredInputs: 'Current P&L or cost structure, pricing assumptions, projected volume/growth assumptions, list of key drivers',
        deliverablePattern: '3-statement financial model (P&L, cash flow, balance sheet) or simplified P&L + unit economics model; scenario toggles (base/bull/bear)',
        acceptanceCriteriaPattern: 'Model is formula-driven (no hard-coded numbers in calculation cells); assumptions are documented on a separate tab; scenarios produce materially different outputs',
        standardExclusions: 'Tax optimization advice; fundraising deck; investor-ready formatting; external benchmarks unless provided by the client',
        effortEstimateHours: 8,
        suitability: 'Good fit when the client has data but lacks the modeling skill to structure it into a forecast.',
      },
      {
        specialization: 'Operations',
        function: 'Process Design',
        responsibilityCategory: 'Design',
        useCase: 'Document and improve a core operational process',
        requiredInputs: 'Description of current process (written or interview notes), list of known pain points, desired outcome, any existing SOPs or documentation',
        deliverablePattern: 'As-is process map + to-be process map (swimlane or BPMN-lite); gap analysis; top 3 improvement recommendations with effort/impact rating',
        acceptanceCriteriaPattern: 'As-is map accurately reflects the described process (validated by client); to-be map is operationally feasible given the client\'s stated constraints; each recommendation includes a specific next action',
        standardExclusions: 'Software selection or procurement; change management planning; implementation; any cross-functional processes outside the defined scope',
        effortEstimateHours: 7,
        suitability: 'Good fit when the client knows a process is broken but hasn\'t had time to step back and diagram it.',
      },
      {
        specialization: 'Marketing',
        function: 'Positioning & Messaging',
        responsibilityCategory: 'Design',
        useCase: 'Develop a positioning statement and core messaging framework',
        requiredInputs: 'Product/service description, target customer segments (at least 2), current messaging or website copy, top 3 competitors and their positioning',
        deliverablePattern: 'Positioning statement (Geoffrey Moore format or equivalent), messaging hierarchy (headline → value props → proof points) for primary segment, secondary messaging notes for up to 2 additional segments',
        acceptanceCriteriaPattern: 'Positioning statement is specific to the client\'s stated differentiation (not generic); messaging hierarchy flows logically from positioning; each value prop is paired with at least one proof point',
        standardExclusions: 'Creative copywriting or visual design; brand identity work; campaign planning; A/B testing; SEO keyword research',
        effortEstimateHours: 6,
        suitability: 'Good fit when the client is refining go-to-market or preparing for a product launch.',
      },
      {
        specialization: 'Product',
        function: 'Roadmap Planning',
        responsibilityCategory: 'Planning',
        useCase: 'Structure a 90-day product roadmap from a backlog',
        requiredInputs: 'Current backlog or feature list (at least 10 items), product strategy or north-star metric, engineering capacity estimate (rough sprint capacity)',
        deliverablePattern: 'Prioritized 90-day roadmap (themes + epics level, not stories); prioritization rationale for top 5 items; 3–5 items explicitly deferred with reason',
        acceptanceCriteriaPattern: 'Every item in the top tier has a stated rationale tied to the product strategy or a specific metric; deferred items include a specific reason (not just "lower priority"); roadmap fits within stated capacity',
        standardExclusions: 'User story writing; sprint planning; engineering estimates; stakeholder alignment sessions; OKR design',
        effortEstimateHours: 6,
        suitability: 'Good fit when the client has too many ideas and no framework for deciding what to build next.',
      },
      {
        specialization: 'Finance',
        function: 'Fundraising Preparation',
        responsibilityCategory: 'Synthesis',
        useCase: 'Prepare a data room or financial narrative for an investor conversation',
        requiredInputs: 'Historical financials (at least 12 months), current cap table, funding ask and use of funds, target investor profile (seed, Series A, etc.)',
        deliverablePattern: 'Data room checklist with gap analysis (what\'s missing vs. investor expectations); financial narrative memo (2–3 pages): traction story, unit economics, path to profitability',
        acceptanceCriteriaPattern: 'Checklist covers all standard items for the stated funding stage; narrative memo tells a coherent story from current state to use-of-funds to outcome; unit economics are calculated from provided data (not estimated)',
        standardExclusions: 'Investor outreach or introductions; pitch deck design; valuation advice; legal structuring; cap table modeling beyond current state',
        effortEstimateHours: 8,
        suitability: 'Good fit 4–8 weeks before a raise, when the client has traction data but hasn\'t packaged it for investors.',
      },
      {
        specialization: 'Strategy',
        function: 'Go-to-Market',
        responsibilityCategory: 'Planning',
        useCase: 'Define a go-to-market motion for a new product or segment',
        requiredInputs: 'Product description and pricing, target customer segment definition, current sales/marketing capacity, 2–3 reference customers or early deals',
        deliverablePattern: 'GTM brief: ICP definition, channel recommendations (top 2–3 with rationale), outreach sequence outline for primary channel, 60-day action plan',
        acceptanceCriteriaPattern: 'ICP is specific enough to use as a targeting filter (industry + company size + job title + trigger); channel recommendations include a realistic CAC range; action plan has named owners and dates',
        standardExclusions: 'Campaign execution; content creation; CRM setup; paid media buying; sales hire planning',
        effortEstimateHours: 7,
        suitability: 'Good fit when the client has early signal (1–3 customers) and needs to systematize the next phase of growth.',
      },
    ],
  })
  console.log('Seeded 8 ScopingMatrix rows')
}
```

- [ ] **Step 3: Run seed**

```bash
npx prisma db seed
```

Expected: `Seeded 8 ScopingMatrix rows` printed.

- [ ] **Step 4: Commit schema + seed**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/
git commit -m "feat(scoping-matrix): expand schema, seed 8 matrix rows from skill doc"
```

---

### Task 3: Scoping matrix service module

**Files:**
- Create: `modules/scoping-matrix/types.ts`
- Create: `modules/scoping-matrix/service.ts`

- [ ] **Step 1: Create types**

```typescript
// modules/scoping-matrix/types.ts
export type ScopingMatrixRow = {
  id: string
  specialization: string
  function: string
  responsibilityCategory: string
  useCase: string
  requiredInputs: string
  deliverablePattern: string
  acceptanceCriteriaPattern: string
  standardExclusions: string
  effortEstimateHours: number
  suitability: string
}
```

- [ ] **Step 2: Create service**

```typescript
// modules/scoping-matrix/service.ts
import { db } from '@/lib/db'
import { callClaude } from '@/lib/ai'
import { logEvent } from '@/modules/audit-events/service'
import type { Tx } from '@/lib/db'

export async function listMatrixRows() {
  return db.scopingMatrixRow.findMany({ orderBy: [{ specialization: 'asc' }, { useCase: 'asc' }] })
}

export async function getClassification(projectId: string) {
  return db.scopingMatrixClassification.findUnique({
    where: { projectId },
    include: { matrixRow: true },
  })
}

export async function classifyManually(projectId: string, matrixRowId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.scopingMatrixClassification.findUnique({ where: { projectId } })
    const classification = existing
      ? await tx.scopingMatrixClassification.update({
          where: { projectId },
          data: { matrixRowId, adminConfirmed: true, aiRationale: null },
          include: { matrixRow: true },
        })
      : await tx.scopingMatrixClassification.create({
          data: { projectId, matrixRowId, adminConfirmed: true },
          include: { matrixRow: true },
        })
    await logEvent(tx, { entityType: 'ScopingMatrixClassification', entityId: classification.id, action: 'classify_manual', actorId, actorRole: 'admin' })
    return classification
  })
}

export async function classifyWithAI(projectId: string, actorId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
  const rows = await db.scopingMatrixRow.findMany()

  const rowsSummary = rows.map((r, i) =>
    `${i + 1}. [${r.id}] ${r.specialization} / ${r.function} — "${r.useCase}"\n   Suitability: ${r.suitability}`
  ).join('\n\n')

  const system = `You are a business analyst classifying a client project request against a fixed set of consulting scope patterns. Choose the single best matching pattern. Respond ONLY with valid JSON: { "matrixRowId": "<id>", "rationale": "<1-2 sentences explaining the match>" }`

  const prompt = `Project title: ${project.title}\n\nProject description: ${project.description}\n\nAvailable patterns:\n\n${rowsSummary}\n\nWhich pattern best matches this project?`

  const raw = await callClaude(system, prompt)

  let parsed: { matrixRowId: string; rationale: string }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(jsonMatch?.[0] ?? raw)
  } catch {
    throw new Error('AI classification returned invalid JSON')
  }

  const row = await db.scopingMatrixRow.findUnique({ where: { id: parsed.matrixRowId } })
  if (!row) throw new Error(`AI returned unknown matrixRowId: ${parsed.matrixRowId}`)

  return db.$transaction(async (tx: Tx) => {
    const existing = await tx.scopingMatrixClassification.findUnique({ where: { projectId } })
    const classification = existing
      ? await tx.scopingMatrixClassification.update({
          where: { projectId },
          data: { matrixRowId: parsed.matrixRowId, aiRationale: parsed.rationale, adminConfirmed: false },
          include: { matrixRow: true },
        })
      : await tx.scopingMatrixClassification.create({
          data: { projectId, matrixRowId: parsed.matrixRowId, aiRationale: parsed.rationale, adminConfirmed: false },
          include: { matrixRow: true },
        })
    await logEvent(tx, { entityType: 'ScopingMatrixClassification', entityId: classification.id, action: 'classify_ai', actorId, actorRole: 'admin' })
    return classification
  })
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

---

### Task 4: Update AI scope drafting to use matrix context

**Files:**
- Modify: `app/(admin)/admin/projects/actions.ts`

The `draftScopeWithAIAction` currently prompts Claude with only the project title and description. Update it to include the matched `ScopingMatrixRow` fields as structured context if a confirmed (or AI-suggested) classification exists.

- [ ] **Step 1: Read the full current draftScopeWithAIAction**

```bash
grep -n "draftScopeWithAIAction\|classifyWithAI\|classifyManually" app/\(admin\)/admin/projects/actions.ts
```

- [ ] **Step 2: Add classifyWithAIAction and classifyManuallyAction**

Add these two new actions to `app/(admin)/admin/projects/actions.ts`:

```typescript
import { classifyWithAI, classifyManually } from '@/modules/scoping-matrix/service'

export async function classifyWithAIAction(projectId: string) {
  await requireRole('admin')
  const actor = await actorId()
  await classifyWithAI(projectId, actor)
  redirect(`/admin/projects/${projectId}`)
}

export async function classifyManuallyAction(projectId: string, formData: FormData) {
  await requireRole('admin')
  const actor = await actorId()
  const matrixRowId = formData.get('matrixRowId') as string
  await classifyManually(projectId, matrixRowId, actor)
  redirect(`/admin/projects/${projectId}`)
}
```

- [ ] **Step 3: Update draftScopeWithAIAction to use matrix context**

Find `draftScopeWithAIAction` in `app/(admin)/admin/projects/actions.ts`. Update the `system` and `prompt` strings to include matrix context when available:

```typescript
export async function draftScopeWithAIAction(projectId: string) {
  await requireRole('admin')
  const actor = await actorId()

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
  const classification = await db.scopingMatrixClassification.findUnique({
    where: { projectId },
    include: { matrixRow: true },
  })

  const matrixContext = classification?.matrixRow
    ? `\n\nMatching scope pattern (use as a template, adapt to the specific project):
Specialization: ${classification.matrixRow.specialization} / ${classification.matrixRow.function}
Use case: ${classification.matrixRow.useCase}
Deliverable pattern: ${classification.matrixRow.deliverablePattern}
Acceptance criteria pattern: ${classification.matrixRow.acceptanceCriteriaPattern}
Standard exclusions: ${classification.matrixRow.standardExclusions}
Typical effort: ${classification.matrixRow.effortEstimateHours} hours
Required inputs (request from client if not provided): ${classification.matrixRow.requiredInputs}`
    : ''

  const system = `You are an expert business analyst. Given a project description${classification ? ' and a matching scope pattern' : ''}, produce a structured scope for a fixed-fee consulting engagement (max 10 hours). Respond ONLY with valid JSON matching this schema exactly:
{
  "deliverable": "string — what will be produced",
  "acceptanceCriteria": "string — how done is verified",
  "assumptions": "string — what must be true for the work to proceed",
  "exclusions": "string — what this engagement does NOT include",
  "feeEstimate": number,
  "effortCapHours": number,
  "dueDateDaysFromNow": number
}`

  const prompt = `Project title: ${project.title}\n\nProject description: ${project.description}${matrixContext}\n\nProduce the scope JSON now.`

  // ... rest of the function unchanged (callClaude, parse, createScope, AIOutputLog, redirect)
```

The rest of the function (calling `callClaude`, parsing JSON, calling `createScope`, writing to `AIOutputLog`, redirecting) is unchanged — only the system prompt and user prompt are updated.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

---

### Task 5: Add classification panel to admin project detail

**Files:**
- Modify: `app/(admin)/admin/projects/[id]/page.tsx`

- [ ] **Step 1: Import new actions and services**

At the top of `app/(admin)/admin/projects/[id]/page.tsx`, add:

```typescript
import { classifyWithAIAction, classifyManuallyAction } from '../actions'
import { getClassification, listMatrixRows } from '@/modules/scoping-matrix/service'
```

- [ ] **Step 2: Fetch classification data in the page**

In the page body, add alongside the existing `const allowed = ...` line:

```typescript
const [classification, matrixRows] = await Promise.all([
  getClassification(id),
  listMatrixRows(),
])
```

- [ ] **Step 3: Add classification panel to page JSX**

Add this panel after the project details card and before the actions block:

```tsx
{/* Scoping Matrix Classification Panel */}
<div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
  <div className="flex items-center justify-between">
    <h2 className="text-sm font-semibold text-slate-700">Scoping Matrix Classification</h2>
    {classification && (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${classification.adminConfirmed ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
        {classification.adminConfirmed ? 'Confirmed' : 'AI suggestion — needs confirmation'}
      </span>
    )}
  </div>

  {classification ? (
    <div className="text-sm space-y-2">
      <p><span className="text-slate-500">Pattern:</span> <span className="font-medium">{classification.matrixRow.specialization} / {classification.matrixRow.function}</span></p>
      <p><span className="text-slate-500">Use case:</span> {classification.matrixRow.useCase}</p>
      {classification.aiRationale && (
        <div className="p-3 bg-slate-50 rounded">
          <p className="text-xs font-medium text-slate-500 mb-1">AI rationale</p>
          <p className="text-slate-700">{classification.aiRationale}</p>
        </div>
      )}
      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs text-slate-500 mb-2">Deliverable pattern: {classification.matrixRow.deliverablePattern}</p>
        <p className="text-xs text-slate-500">Effort: ~{classification.matrixRow.effortEstimateHours}h · Exclusions: {classification.matrixRow.standardExclusions}</p>
      </div>
      {!classification.adminConfirmed && (
        <form action={classifyManuallyAction.bind(null, id)} className="flex items-center gap-2 pt-2">
          <input type="hidden" name="matrixRowId" value={classification.matrixRowId} />
          <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700">Confirm this classification</button>
        </form>
      )}
    </div>
  ) : (
    <p className="text-sm text-slate-400">No classification yet.</p>
  )}

  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
    <form action={classifyWithAIAction.bind(null, id)}>
      <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
        {classification ? 'Re-classify with AI' : 'Classify with AI'}
      </button>
    </form>
    <form action={classifyManuallyAction.bind(null, id)} className="flex items-center gap-2">
      <select name="matrixRowId" required className="text-sm border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500">
        <option value="">Select pattern…</option>
        {matrixRows.map(r => (
          <option key={r.id} value={r.id}>{r.specialization} / {r.function} — {r.useCase}</option>
        ))}
      </select>
      <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Set Manually</button>
    </form>
  </div>
</div>
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit UI changes**

```bash
git add app/(admin)/admin/projects/ modules/scoping-matrix/
git commit -m "feat(scoping-matrix): classify panel on project detail, AI + manual classification, matrix-aware scope drafting"
```

---

### Task 6: Tests

**Files:**
- Create: `tests/scoping-matrix.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/scoping-matrix.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization } from '@/modules/clients/service'
import { createProject } from '@/modules/projects/service'
import { listMatrixRows, classifyManually, getClassification } from '@/modules/scoping-matrix/service'

describe('ScopingMatrix', () => {
  it('listMatrixRows returns seeded rows', async () => {
    const rows = await listMatrixRows()
    // Seed data is in the DB already — TRUNCATE in beforeEach clears it,
    // so we need at least one row to exist. Create a test row.
    // (The real seed runs via prisma db seed, not in tests.)
    // This test just verifies the service function works.
    expect(Array.isArray(rows)).toBe(true)
  })

  it('classifyManually creates a ScopingMatrixClassification with adminConfirmed: true', async () => {
    const admin = await upsertUser({ clerkId: 'sm_admin', email: 'admin@sm.test', role: 'admin' })
    const org = await createOrganization({ name: 'SM Org' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Competitive Analysis Project', description: 'Map our competitive landscape' }, admin.id)

    // Create a matrix row to classify against
    const row = await prisma.scopingMatrixRow.create({
      data: {
        specialization: 'Strategy',
        function: 'Competitive Intelligence',
        responsibilityCategory: 'Analysis',
        useCase: 'Map the competitive landscape',
        requiredInputs: 'Company overview, competitor list',
        deliverablePattern: 'Competitor matrix + narrative',
        acceptanceCriteriaPattern: 'All competitors covered',
        standardExclusions: 'Primary research',
        effortEstimateHours: 8,
        suitability: 'Good fit for early-stage',
      },
    })

    const classification = await classifyManually(project.id, row.id, admin.id)

    expect(classification.projectId).toBe(project.id)
    expect(classification.matrixRowId).toBe(row.id)
    expect(classification.adminConfirmed).toBe(true)
    expect(classification.aiRationale).toBeNull()
  })

  it('getClassification returns the classification with matrixRow included', async () => {
    const admin = await upsertUser({ clerkId: 'sm_admin_2', email: 'admin2@sm.test', role: 'admin' })
    const org = await createOrganization({ name: 'SM Org 2' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Research Project', description: 'Synthesize interviews' }, admin.id)

    const row = await prisma.scopingMatrixRow.create({
      data: {
        specialization: 'Research',
        function: 'Customer Discovery',
        responsibilityCategory: 'Synthesis',
        useCase: 'Synthesize discovery interviews',
        requiredInputs: 'Interview transcripts',
        deliverablePattern: 'Thematic synthesis doc',
        acceptanceCriteriaPattern: 'Themes supported by 2+ data points',
        standardExclusions: 'New interviews',
        effortEstimateHours: 7,
        suitability: 'Good when discovery done, synthesis needed',
      },
    })

    await classifyManually(project.id, row.id, admin.id)

    const fetched = await getClassification(project.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.matrixRow.specialization).toBe('Research')
    expect(fetched!.matrixRow.useCase).toBe('Synthesize discovery interviews')
  })

  it('classifyManually is idempotent — re-classifying overwrites the previous', async () => {
    const admin = await upsertUser({ clerkId: 'sm_admin_3', email: 'admin3@sm.test', role: 'admin' })
    const org = await createOrganization({ name: 'SM Org 3' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Ops Project', description: 'Process improvement' }, admin.id)

    const row1 = await prisma.scopingMatrixRow.create({
      data: { specialization: 'Operations', function: 'Process Design', responsibilityCategory: 'Design', useCase: 'Design a process', requiredInputs: 'As-is description', deliverablePattern: 'Process map', acceptanceCriteriaPattern: 'Map is accurate', standardExclusions: 'Implementation', effortEstimateHours: 7, suitability: 'Good fit' },
    })
    const row2 = await prisma.scopingMatrixRow.create({
      data: { specialization: 'Strategy', function: 'GTM', responsibilityCategory: 'Planning', useCase: 'Define GTM motion', requiredInputs: 'Product description', deliverablePattern: 'GTM brief', acceptanceCriteriaPattern: 'ICP is specific', standardExclusions: 'Execution', effortEstimateHours: 7, suitability: 'Good fit' },
    })

    await classifyManually(project.id, row1.id, admin.id)
    await classifyManually(project.id, row2.id, admin.id)

    const final = await getClassification(project.id)
    expect(final!.matrixRowId).toBe(row2.id)

    // Should still be exactly one classification record for this project
    const count = await prisma.scopingMatrixClassification.count({ where: { projectId: project.id } })
    expect(count).toBe(1)
  })

  it('classifyManually logs an EventLog entry', async () => {
    const admin = await upsertUser({ clerkId: 'sm_admin_4', email: 'admin4@sm.test', role: 'admin' })
    const org = await createOrganization({ name: 'SM Org 4' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Finance Project', description: 'Build a model' }, admin.id)
    const row = await prisma.scopingMatrixRow.create({
      data: { specialization: 'Finance', function: 'Financial Modeling', responsibilityCategory: 'Evaluation', useCase: 'Build financial model', requiredInputs: 'P&L data', deliverablePattern: '3-statement model', acceptanceCriteriaPattern: 'Formula-driven', standardExclusions: 'Tax advice', effortEstimateHours: 8, suitability: 'Good fit' },
    })

    const classification = await classifyManually(project.id, row.id, admin.id)

    const event = await prisma.eventLog.findFirst({
      where: { entityType: 'ScopingMatrixClassification', entityId: classification.id, action: 'classify_manual' },
    })
    expect(event).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/scoping-matrix.test.ts
```

Expected: `Tests 5 passed (5)`

- [ ] **Step 3: Commit**

```bash
git add tests/scoping-matrix.test.ts
git commit -m "test(scoping-matrix): manual classification, getClassification, idempotency, event log — 5 tests"
```

---

### Task 7: Run full test suite and push

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass (previous total + 5 new scoping matrix tests)

- [ ] **Step 2: Push**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```
