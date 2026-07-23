# Decision Log

Append-only record of all material architectural decisions made during MVP A build.

---

## 2026-07-22 Web Framework: Next.js 16 (App Router) + TypeScript

**Decision:** Single full-stack application written in TypeScript, using Next.js 16 with App Router for web framework, routing, and rendering.

**Rationale:** A single deployable in one language fits a modular monolith and a founder-led build. TypeScript full-stack (Next.js) was chosen over a batteries-included server framework (Rails/Django) because the admin surface is heavy in MVP A and Next.js/React provides fast iteration on complex UIs. Single codebase, one deployment unit.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Database: PostgreSQL (Neon, serverless)

**Decision:** Relational database is PostgreSQL, hosted on Neon as a serverless instance (connection string in `.env` as `DATABASE_URL`).

**Rationale:** PostgreSQL provides strong indexing for matching filters, robust support for JSON columns (used for structured scope fields), and is mature/well-understood. Serverless hosting (Neon) reduces operational burden for a founder-led MVP and scales automatically with usage. Single primary database per `SPEC.md §3` (modular monolith constraint).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 ORM: Prisma 7 with @prisma/adapter-neon

**Decision:** Object-relational mapping layer is Prisma v7 with the Neon adapter (`@prisma/adapter-neon`), using `PrismaNeon` adapter. Client generated to `app/generated/prisma/`.

**Rationale:** Prisma provides type-safe database access and schema migrations out of the box, reducing hand-rolled SQL risk. The Neon adapter allows Prisma to work with serverless Postgres. Strong schema documentation and query builder prevent injection bugs. Single DB client exported as a singleton from `lib/db.ts`, imported only in service layers and admin detail pages (event log reads).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Authentication: Clerk (@clerk/nextjs v7)

**Decision:** Authentication and role management delegated to Clerk (v7), a managed auth provider. Roles stored in `sessionClaims.metadata.role` as lowercase strings: `admin`, `client`, or `consultant`.

**Rationale:** Do not hand-roll auth; managed provider handles password reset, passwordless recovery, session management, and webhook security. Clerk integrates natively with Next.js middleware. Role-based access control (RBAC) enforced at route and action levels via `requireRole()` utility. Reduces PII handling and security surface in product code.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Error Monitoring: Sentry (@sentry/nextjs v10)

**Decision:** Error monitoring and observability via Sentry (v10). DSN configured in `.env.local` and wired into all environments.

**Rationale:** Wiring error monitoring from M0 (MVP A foundation) ensures issues in production and dev are visible and actionable. Sentry integrates cleanly with Next.js middleware and Server Actions. Reduces blind spots in a founder-led build.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Architecture: Modular Monolith on One Relational Database

**Decision:** Single Next.js application, single PostgreSQL database, organized by business-domain module (not microservices). Each module owns its tables and exposes a service layer at `modules/<name>/service.ts`; cross-module calls go through service layers only, never direct table access.

**Rationale:** Microservices add deployment, consistency, and debugging complexity. A modular monolith (one app, one DB, module boundaries enforced in code) provides clear separation of concerns without operational overhead. Simpler to deploy, test, and reason about state consistency. If justified later, specific modules (matching, ai, payments) can be extracted to services; not in MVP A. See `SPEC.md §5` for full module map.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Product: Engagements Capped at ~10 Hours, Fixed-Scope, Fixed-Fee

**Decision:** Every engagement is bounded to approximately 10 hours of work, fixed-scope with defined deliverables, and fixed-fee (or fee-capped). Each engagement ties to one admin-approved scope document specifying deliverables, acceptance criteria, assumptions, exclusions, required inputs, due date, fee, and effort cap.

**Rationale:** Bounded scope is the core product constraint in `SPEC.md §3`. It makes QA feasible (clear acceptance criteria), payment straightforward (price is known upfront), and disputes resolvable (scope limits arguments). Fixed scope/fee also makes matching easier and matching trust higher for clients (no scope creep). This constraint is non-negotiable in MVP A.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Matching: Admin-Curated, Not Fully Automated

**Decision:** Matching is performed by system/AI filters and scoring, but final shortlist approval is reserved for an admin before any client visibility. Only shortlisted consultants can be invited. Only admins can invite consultants.

**Rationale:** Matching trust is the highest-risk assumption in MVP A (`SPEC.md §2`). Clients are buying from a marketplace; if matching is perceived as rigged or misaligned, trust collapses and the business fails. Admin curation provides a final quality gate and allows for judgment calls (e.g., "this consultant is technically qualified but culturally misaligned"). Fully automated matching is deferred to MVP B or True Platform. See `SPEC.md §3` and `.claude/skills/state-machine` for matching flow.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 AI Outputs: Always Logged and Gated Before User Exposure

**Decision:** Every AI call is logged to `AIOutputLog` with touchpoint, prompt version, model, input summary, output, exposed status, review status, decision, and timestamp. All outputs affecting high-risk decisions (final scope, client-facing match rationale, trust-affecting risk flags, deliverable QA, closeout/dispute summaries, payment/closeout decisions) require admin approval before any user sees them.

**Rationale:** AI introduces systemic risk. Without logging, you cannot debug or audit outcomes. Without approval gates, AI errors directly harm users, trust, and money. `SPEC.md §6.4` defines the full approval-gate table. Non-gated touchpoints (profile prep, intake clarification, non-decisional summaries) can be user-facing directly. Gated touchpoints route to admin review first. This is enforced in service logic and tested per `.claude/skills/ai-gates`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Payments: Deferred to MVP B

**Decision:** Payment processing and payout logic are out of scope for MVP A. The schema includes `PaymentTransactionRecord` and payment status tracking, but Stripe integration, escrow, Connect/payout flow, and payment-triggered state transitions are MVP B.

**Rationale:** Payment is a trust-critical, high-liability surface. MVP A is validating matching and delivery QA, not payment flow. The payment provider (Stripe) is the source of truth for payment events; the product mirrors status but must never independently decide a payment succeeded. Deferring full Stripe integration (Connect, Direct/Standard payouts, escrow) reduces scope and risk in M1. Admin-mediated confirmation is acceptable for MVP A pilot. See `SPEC.md §9` (out of scope).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Email: Deferred to MVP B

**Decision:** Transactional email (invitations, proposal notifications, engagement updates, closeout confirmations) is out of scope for MVP A. The workflow state machine is in place, but email sending is not implemented.

**Rationale:** MVP A is founder-led with manual orchestration. Real users will not see the product yet. Email delivery, templates, and rendering can be added in MVP B once the product flow is validated. For M1, the admin UI allows manual testing of workflows without actual email sends. Deferred to `SPEC.md §9` (out of scope).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 File Uploads: Deferred to MVP B

**Decision:** File uploads for deliverables, client inputs, and verification artifacts are not implemented in MVP A. The schema includes `Deliverable.fileUrl` (nullable) but no upload flow or storage backend.

**Rationale:** File storage (S3-compatible or equivalent) requires infrastructure setup and security hardening for artifact access control. MVP A focuses on workflow and matching; deliverables can be tracked manually or via external links in M1. S3-compatible storage with access restrictions will be added in MVP B. Deferred to `SPEC.md §9` (out of scope).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Client and Consultant UI: Deferred to MVP B (MVP A is Founder-Only Admin UI)

**Decision:** MVP A is founder-led validation with an admin-only UI. No client-facing portal, no consultant-facing portal, no public-facing marketplace UI. Routes exist but redirect to `/`. Only authenticated admins can access the admin dashboard at `/admin/`.

**Rationale:** MVP A goal is to validate core assumptions (intake feasibility, matching trust, delivery, closeout QA) with the founder acting as all roles. Building full client/consultant UIs prematurely adds scope and complexity. Admin UI is thick and sufficient for founder-driven testing. Real client and consultant UIs are MVP B, after proof-of-concept. See `HANDOFF.md` ("M1 is the full spine: a founder can drive a project from creation through engagement closeout using the admin UI. No client or consultant UI exists yet.").

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 CI/CD: GitHub Actions (lint → typecheck → test → build)

**Decision:** Continuous integration runs on every push via GitHub Actions. Pipeline: `npm run lint` → `npm run typecheck` → `npm test` → `npm run build`. All steps must pass before merge.

**Rationale:** Catch errors early (linting, type safety, test failures, build errors) before code is deployed. Lint and typecheck are fast feedback loops. Integration tests run against the real Neon dev database (fileParallelism: false, testTimeout: 60s). Build verification ensures no runtime surprises. Optional: `claude -p` review step can be added post-M1 for AI-assisted code review.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Push Procedure: git subtree from Parent Repo

**Decision:** This repository lives at `Personal/Consulten/build/` inside a larger parent git repo at `/Users/andrewabbott/Development/`. Standard `git push` from the build directory will not work. All pushes to the remote (`https://github.com/aabbottbos/c0nsult3n.git`, aliased as `consulten`) must use: `cd /Users/andrewabbott/Development && git subtree push --prefix=Personal/Consulten/build consulten main`.

**Rationale:** The build directory is a subdirectory of a parent monorepo. Using `git subtree push` maps the build directory to the root of the target repository on GitHub, avoiding confusion and keeping the Consulten repo clean. This procedure is documented in `HANDOFF.md` for future reference.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 State Machines: Users Take Actions, System Records Transitions

**Decision:** Users never set a raw status field directly. Every state change is triggered by a user action; the system validates the transition and records the resulting state change. State machines are defined in `.claude/skills/state-machine` with transition maps in each module's `types.ts` as `<MODULE>_TRANSITIONS`.

**Rationale:** Action-driven state machines enforce invariants (you cannot jump from Draft to Approved without Admin Review) and create an audit trail. Every transition is logged to `eventLog`. Prevents inconsistent states and makes debugging and replays possible. Admin overrides (e.g., "force close") are logged separately as audit events. See `SPEC.md §6.2` for the full set of spine state machines (Project, Scope, Shortlist, Invitation, Engagement).

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Admin Pages: Server Components + Server Actions

**Decision:** Admin pages (`app/(admin)/`) are Next.js Server Components. All state mutations go through Server Actions (in `actions.ts` files) that call service functions, then redirect. The admin layout (`app/(admin)/layout.tsx`) calls `requireRole('admin')` to guard all admin routes. Every `actions.ts` file must also call `requireRole('admin')` to protect direct action invocations (layout guards do not protect action calls).

**Rationale:** Server Components + Server Actions reduce client-side code and bundle size. Server-side rendering ensures sensitive admin logic is never exposed to the browser. Dual role checks (layout + action) prevent privilege escalation even if a route guard is accidentally bypassed. All mutations are logged and audited. See `CLAUDE.md §Architecture`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Database Client Singleton and Service Layer Pattern

**Decision:** The Prisma database client is instantiated once and exported as a singleton from `lib/db.ts`. It is imported only in service layer files (`modules/<name>/service.ts`) and admin detail pages (for event log reads). No other code paths access `db` directly.

**Rationale:** Centralizing the DB client ensures one connection pool, prevents accidental leaks, and makes it easy to swap implementations (e.g., if migrating ORM). Service layers encapsulate business logic and state transitions; they are the single source of truth for what queries run and in what order. Admin detail pages can read the event log but never perform mutations outside service functions. See `CLAUDE.md §Architecture`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Testing: Integration Tests Against Real Neon Dev Database

**Decision:** Integration tests (`tests/*.test.ts`) run sequentially against the real Neon dev database. Vitest is configured with `fileParallelism: false` and `testTimeout: 60000ms` (spine integration test takes ~30s). The test setup file (`tests/setup.ts`) imports `dotenv/config` explicitly.

**Rationale:** Tests against the real database catch Prisma/schema mismatches and query errors that mocks would hide. Sequential execution ensures test data isolation (one test per transaction). Long timeout accommodates Neon latency. Explicit `dotenv/config` import in setup ensures tests pick up `DATABASE_URL` from `.env`. See `CLAUDE.md §Gotchas`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Prisma Generation Output: app/generated/prisma/

**Decision:** Prisma client is generated to `app/generated/prisma/`, not the default `node_modules/.prisma/client` location. All imports of the Prisma client use `@/app/generated/prisma`, not `@prisma/client`.

**Rationale:** Custom generation output keeps generated code visible and version-controllable. TypeScript import path alias (`@/app/generated/prisma`) is cleaner and makes it obvious where the client comes from. Regenerate via `npx prisma generate`. Do not remove the custom generator config from `prisma.schema` or tests lose the client. See `CLAUDE.md §Gotchas`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Clerk Roles: Lowercase String Enum (admin, client, consultant)

**Decision:** Clerk role metadata is stored and checked as lowercase strings: `admin`, `client`, `consultant` (not `ADMIN`, `CLIENT`, `CONSULTANT` or any other casing). The `requireRole()` utility reads from `sessionClaims.metadata.role` and compares lowercase.

**Rationale:** Consistency prevents case-sensitivity bugs. Lowercase is conventional for database enums and config. All `requireRole()` calls must use the lowercase string, and every auth check is tested to prevent privilege escalation. See `CLAUDE.md §Gotchas` and `lib/auth.ts`.

**Approved by:** founder

**Status:** In effect

---

## 2026-07-22 Non-Negotiable Rules: PII, Trust, and Money

**Decision:** The following rules are enforced in code and tested:

1. **Human approval required** before exposing to any user: final scope, client-facing match rationale, trust-affecting AI risk flags, AI dispute summaries, anything affecting payment or closeout. See `.claude/skills/ai-gates`.
2. **Clients never see** internal scores, admin notes, or unapproved AI rationale.
3. **A consultant cannot be invited** before being added to the shortlist.
4. **Consultants only see** projects they have been invited to or assigned to.
5. **Suspended / deactivated / unpublished / restricted consultants** cannot receive new invitations; active restrictions applied during matching.
6. **No payment-card data, no raw bank details** in product records. Verification artifacts and other PII are admin-restricted.
7. **Legal/terms acceptance records** are immutable or audit-logged once captured.

**Rationale:** These rules protect trust (clients must trust matching), money (no erroneous payments), and PII (no data breaches). Enforcing them in code and testing them prevents categories of bugs. See `CLAUDE.md §Non-negotiable rules`.

**Approved by:** founder

**Status:** In effect
