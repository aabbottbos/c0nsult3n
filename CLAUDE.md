# Consulten — Project Memory

Consulten is an AI-assisted marketplace for fixed-scope professional work
(engagements capped at ~10 hours, sold fixed-scope / fixed-fee). We are building
**MVP A**: a founder-led validation build. It is a **modular monolith** on **one
primary relational database**, NOT microservices.

Read `SPEC.md` for the foundation spec, module map, and current milestone.
Detailed domain knowledge (Scoping Matrix, field dictionary, full permission
matrix, state machines) lives in `.claude/skills/`. Load the relevant skill when
you need it — do not inline that knowledge here.

## Stack
- Web framework: Next.js 16 (App Router)
- Relational DB: Neon (serverless Postgres) — connection string in `.env` as `DATABASE_URL`
- ORM: Prisma 7 with `@prisma/adapter-neon` (`PrismaNeon` adapter); generates to `app/generated/prisma/`
- Auth: Clerk (`@clerk/nextjs` v7) — roles stored in `sessionClaims.metadata.role` as lowercase `admin` | `client` | `consultant`
- Transactional email: Resend (`resend` package) — wrapper at `lib/email.ts`, `RESEND_API_KEY` env var, FROM `Consulten <noreply@consulten.co>`
- File storage: Vercel Blob (`@vercel/blob`) — public access, `BLOB_READ_WRITE_TOKEN` env var, blob keys prefixed `{engagementId}/{filename}`
- AI provider: Anthropic (`@anthropic-ai/sdk`) — wrapper at `lib/ai.ts`, `ANTHROPIC_API_KEY` env var, model `claude-sonnet-4-6`
- Payments: TBD (MVP B)
- Error monitoring: Sentry (`@sentry/nextjs` v10) — DSN in `.env.local`

## Commands
- Install: `npm install`
- Run dev: `npm run dev`
- Test (all): `npm test` (= `vitest run`) — integration tests hit the real Neon dev DB
- Test (single file): `npx vitest run tests/<file>.test.ts`
- Typecheck: `npm run typecheck` (= `tsc --noEmit`)
- Lint: `npm run lint`
- DB migrate: `npx prisma migrate dev`
- DB seed: `npx prisma db seed` (runs `prisma/seed.ts` via tsx)
- DB generate: `npx prisma generate` (re-generates client to `app/generated/prisma/`)

## Architecture
- One application, one primary relational DB. Organize code by business-domain
  **module** (see `SPEC.md §5`). Keep boundaries clean: a module reaches another
  module through its service layer, never by reaching into its tables.
- Modules live in `modules/<name>/service.ts` (business logic) and `modules/<name>/types.ts`
  (state machine transition maps + exported types). The DB client (`lib/db.ts`) is a Prisma
  singleton imported only in service files and admin detail pages (for event log reads).
- Users never set a raw status. Users take **actions**; the system records the
  resulting state change. State machines are defined in the `state-machine` skill.
  Transition maps are in each module's `types.ts` as `<MODULE>_TRANSITIONS`.
- Admin pages (`app/(admin)/`) are Server Components. All mutations go through Server
  Actions in `actions.ts` files that call service functions then redirect. The admin
  layout (`app/(admin)/layout.tsx`) calls `requireRole('admin')` — individual pages
  need no additional auth check, but **every `actions.ts` must also call `requireRole('admin')`**
  (layout guards do not protect direct action invocations).
- The payment provider is the source of truth for payment events. The product
  may mirror payment status but must never independently decide a payment succeeded.

## Non-negotiable rules (these protect trust, money, and PII)
- **Human approval is REQUIRED before exposing to any user:** final scope,
  client-facing match rationale, trust-affecting AI risk flags, AI dispute
  summaries, and any AI output affecting payment or closeout. See the `ai-gates`
  skill. When in doubt, route to admin — do not expose.
- Clients never see internal scores, admin notes, or unapproved AI rationale.
- A consultant CANNOT be invited before being added to the shortlist.
- Consultants only see projects they have been invited to (from a shortlist) or
  assigned to.
- Suspended / deactivated / unpublished / restricted consultants cannot receive
  new invitations. Active consultant restrictions must be applied during matching.
- No payment-card data and no raw bank details in product records. Verification
  artifacts and other PII are admin-restricted and stored securely.
- Legal/terms acceptance records are immutable or audit-logged once captured.

## Workflow
- **Plan before coding anything non-trivial.** If a change touches auth,
  permissions, payments, the state machine, or PII, STOP and produce a written
  plan for human review before editing.
- If execution diverges from the approved plan, stop and ask — do not improvise.
- **Every change needs a check.** State-transition tests and role-based
  permission tests are the priority. Show the test output as evidence; never
  assert "done" without it.
- **MVP A scope is fixed.** If a request matches the MVP A exclusion list
  (`SPEC.md §9`), do NOT build it — flag it as MVP B and move on.
- Branch naming: `m<milestone>/<module>-<short-desc>` (e.g. `m1/matching-eligibility-filter`).
  Small PRs, one module concern each. Commit at each working slice.
- **GitHub push:** This repo lives at `Personal/Consulten/build/` inside a parent git repo.
  Push via subtree: `cd /Users/andrewabbott/Development && git subtree push --prefix=Personal/Consulten/build consulten main`
  The remote alias is `consulten` → `https://github.com/aabbottbos/c0nsult3n.git`.

## Gotchas
- **Vitest does not auto-load `.env`.** The test setup file (`tests/setup.ts`) imports
  `dotenv/config` explicitly — do not remove it or tests lose the `DATABASE_URL`.
- **Integration tests share one real Neon DB** and must run sequentially.
  `fileParallelism: false` in `vitest.config.ts` is required — do not change it.
  `testTimeout` is 60 000 ms; the spine test takes ~30 s against Neon.
- **Prisma generates to `app/generated/prisma/`**, not the default location.
  Import from `@/app/generated/prisma`, not `@prisma/client`. This alias is defined
  in `tsconfig.json` (for tsc), `next.config.ts` (for Next.js bundler), and
  `vitest.config.ts` (for Vitest). All three must stay in sync.
- **Prisma 7 no longer generates `index.ts`.** It generates `client.ts`, `browser.ts`,
  `enums.ts`. Imports from `@/app/generated/prisma` resolve to `client.ts` via alias.
  `app/generated/prisma/` is gitignored; `prisma generate` runs automatically in the
  build script (`npm run build`).
- **Prisma 7 adapter:** Use `PrismaNeon({ connectionString })` from `@prisma/adapter-neon`.
  Do not pass `neon()` (the query function) — pass the options object directly.
- **Next.js 15+ dynamic params are async.** Detail pages must type params as
  `Promise<{ id: string }>` and `await params` before use.
- **Decimal fields:** Prisma returns `fee` as a `Decimal` object, not a number.
  Call `.toString()` before rendering in JSX.
- **Role enum values are lowercase:** `admin`, `client`, `consultant` (not `ADMIN` etc.).
  All `requireRole()` calls must use the lowercase string.
- **`scope.assumptions` and `scope.exclusions` are nullable** in the schema.
  Render with `?? ''` or conditional display to avoid TypeScript errors.
- **Admin route group uses `/admin/` prefix.** Admin pages live at
  `app/(admin)/admin/engagements/`, `app/(admin)/admin/invitations/`,
  `app/(admin)/admin/projects/` to avoid URL conflicts with client/consultant routes.
  URLs are `/admin/engagements`, `/admin/invitations`, `/admin/projects`.
- **Client engagement page lives at a nested path** to avoid conflict with consultant
  engagements: `app/(client)/projects/[id]/engagement/[engagementId]/page.tsx`.
  URL: `/projects/:id/engagement/:engagementId`.
- **`tests/setup.ts` teardown order matters.** Delete in this order to avoid FK
  violations: `revisionRequest` → `deliverable` → `engagementCommunication` →
  `engagement` → `proposal` → `consultantInvitation` → `shortlistCandidate` →
  `shortlist` → `scope` → `project` → `consultantRestriction` → `consultantProfile` →
  `clientContact` → `clientOrganization` → `eventLog` → `legalAcceptanceRecord` → `user`.
- **Email functions are fire-and-forget.** `lib/email.ts` catches all errors internally
  and logs them — they never throw. Always call email functions after state transitions,
  never inside a transaction.
- **Vercel Blob keys are prefixed** with `{engagementId}/{filename}` to prevent
  collisions when multiple consultants upload files with the same name.

# Coding guidelines

## 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

* State your assumptions explicitly. If uncertain, ask.  
* If multiple interpretations exist, present them \- don't pick silently.  
* If a simpler approach exists, say so. Push back when warranted.  
* If something is unclear, stop. Name what's confusing. Ask.

## 2\. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

* No features beyond what was asked.  
* No abstractions for single-use code.  
* No "flexibility" or "configurability" that wasn't requested.  
* No error handling for impossible scenarios.  
* If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3\. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

* Don't "improve" adjacent code, comments, or formatting.  
* Don't refactor things that aren't broken.  
* Match existing style, even if you'd do it differently.  
* If you notice unrelated dead code, mention it \- don't delete it.

When your changes create orphans:

* Remove imports/variables/functions that YOUR changes made unused.  
* Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4\. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

* "Add validation" → "Write tests for invalid inputs, then make them pass"  
* "Fix the bug" → "Write a test that reproduces it, then make it pass"  
* "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

`1. [Step] → verify: [check]`  
`2. [Step] → verify: [check]`  
`3. [Step] → verify: [check]`

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.