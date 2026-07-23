# AI Gates

> Approval gate table and logging rules for all AI-generated outputs. Source: SPEC.md §6.4, prisma/schema.prisma (AIOutputLog).

---

## Foundation rule

Every AI call must be logged in `AIOutputLog`. Gated outputs must have `reviewed = true` before `exposed` is set to `true`. Never expose a gated output without admin review — doing so violates trust invariants.

---

## Approval gate table

| AI touchpoint | Human approval before user exposure? |
|---------------|--------------------------------------|
| Profile prep, intake clarification, wording help, non-decisional summaries, proposal drafting | **No** — directly user-facing; log but no review gate |
| Scoping Matrix mapping, scope draft (final scope) | **Yes** — must be admin-reviewed before client sees scope |
| Client-facing match rationale, trust-affecting risk flags | **Yes** — must be admin-reviewed before shortlist is `CLIENT_VISIBLE` |
| Deliverable QA notes | **Conditional** — per configured review flow (admin may enable auto-expose for low-risk flows) |
| Closeout/dispute summaries, anything affecting payment or closeout | **Yes** — must be admin-reviewed before exposure |

---

## AIOutputLog model

All fields from `prisma/schema.prisma`:

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| touchpoint | String | Which AI feature produced this (e.g. `"scope_draft"`, `"match_rationale"`) |
| promptVersion | String | Version tag of the prompt template used |
| model | String | AI model identifier (e.g. `"claude-sonnet-4-6"`) |
| inputSummary | String | Redacted summary of input — must NOT contain raw PII |
| output | String | Full AI-generated output text |
| exposed | Boolean | Has this output been shown to a non-admin user? Default `false` |
| reviewed | Boolean | Has an admin approved or rejected this output? Default `false` |
| decision | String? | Admin's approval/rejection note (required when `reviewed = true` for gated outputs) |
| timestamp | DateTime | When the AI call was made |

---

## Enforcement rules

1. **Log every AI call** — regardless of whether it is gated or not.
2. **Gated outputs:** `reviewed` must be `true` before `exposed` is set to `true`. The service layer must check this before returning output to any non-admin surface.
3. **`inputSummary` must be redacted** — do not log raw user PII or confidential project content verbatim. Log a summary sufficient for audit without reproducing sensitive data.
4. **`decision` field** — populate with the admin's rationale when approving or rejecting a gated output. Required for audit trail integrity.
5. **Immutability** — `AIOutputLog` rows are never deleted. Corrections are recorded as new rows.

---

## Gated output checklist (before exposing to a user)

- [ ] `AIOutputLog` row exists for this output
- [ ] `reviewed = true`
- [ ] `decision` is populated
- [ ] `exposed` is being set to `true` only now (not already `true` from a prior erroneous write)
- [ ] The user receiving the output is authorized to see it (check role + ownership)

---

## Current implementation status (M1)

**No AI features are implemented in M1.** All AI touchpoints are stubs or manual admin entry. `AIOutputLog` table exists in the schema and is ready for writes.

When AI features are added (planned M6+):
- The `ai` module (`modules/ai/`) will own all AI service calls.
- Each AI call in that module must write to `AIOutputLog` before returning.
- Gated touchpoints must check `reviewed` before the output is used in any client/consultant-visible query.
- The admin review queue (AdminTask or a dedicated admin page) will surface unreviewed gated outputs.
