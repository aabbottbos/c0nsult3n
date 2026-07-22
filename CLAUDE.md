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
<!-- PROPOSED in SPEC.md §4. Confirm/lock at Gate 0, then fill in and delete this note. -->
- Web framework: `TBD`
- Relational DB: `TBD` (Postgres proposed)
- Auth: `TBD`
- Transactional email: `TBD`
- File storage: `TBD` (S3-compatible)
- AI provider: `TBD` (Anthropic API proposed)
- Payments: `TBD` (Stripe proposed)
- Error monitoring: `TBD` (Sentry proposed)

## Commands
<!-- Fill these in once the repo is scaffolded. Include only commands you can't guess. -->
- Install: `TBD`
- Run dev: `TBD`
- Test (all): `TBD` — prefer a single test file during a change: `TBD`
- Lint / typecheck: `TBD`
- DB migrate / seed: `TBD`

## Architecture
- One application, one primary relational DB. Organize code by business-domain
  **module** (see `SPEC.md §5`). Keep boundaries clean: a module reaches another
  module through its service layer, never by reaching into its tables.
- Users never set a raw status. Users take **actions**; the system records the
  resulting state change. State machines are defined in the `state-machine` skill.
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

## Gotchas
<!-- Add real, non-obvious ones as you hit them. Delete anything Claude already gets right. -->

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