# Email Notifications — M3 Design Spec

**Date:** 2026-07-23  
**Status:** Approved  
**Milestone:** M3

---

## Goal

Send plain-text transactional emails at four workflow trigger points so that participants know when action is required of them, without polling the portal.

---

## Provider

**Resend** — API key stored as `RESEND_API_KEY` in `.env.local` and Vercel env vars.  
From address: `noreply@consulten.co` (or Resend sandbox domain during development).

---

## Architecture

### `lib/email.ts`

Single module wrapping the Resend SDK. Exports one named function per trigger. Each function:
- Accepts only the data it needs (recipient email, name, relevant IDs/titles)
- Sends plain text via `resend.emails.send()`
- Wraps in try/catch — logs failure to console (Sentry picks it up) but does not throw
- Email failure never blocks the state transition that triggered it

No queue, no retry, no email log table in M3.

### Trigger points

| Function | Called from | Recipient | When |
|---|---|---|---|
| `sendInvitationEmail` | `modules/invitations/service.ts` → `sendInvitation()` | Consultant | Invitation status → `SENT` |
| `sendProposalSelectedEmail` | `modules/engagements/service.ts` → `createEngagement()` | Consultant | Engagement created, proposal selected |
| `sendEngagementStartedEmail` | `modules/engagements/service.ts` → `createEngagement()` | Client | Same — immediately after engagement created |
| `sendDeliverableSubmittedEmail` | `modules/deliverables/service.ts` → `submitDeliverable()` | Client | Deliverable submitted |

---

## Email Content (plain text)

### Invitation sent → consultant
```
Subject: You've been invited to a project on Consulten

Hi [name],

You have a new project invitation waiting for you on Consulten.

Project: [project title]
Expires: [expiry date]

Log in to review the scope and respond:
[app URL]/invitations/[invitation id]

— The Consulten Team
```

### Proposal selected → consultant
```
Subject: Your proposal was selected

Hi [name],

Your proposal has been selected for [project title]. An engagement has been created.

Log in to get started:
[app URL]/engagements/[engagement id]

— The Consulten Team
```

### Engagement started → client
```
Subject: Your engagement has started

Hi [name],

[consultant name] has been selected for [project title] and your engagement is now active.

Log in to track progress:
[app URL]/projects/[project id]

— The Consulten Team
```

### Deliverable submitted → client
```
Subject: A deliverable has been submitted for your review

Hi [name],

A deliverable has been submitted for [project title] and is ready for your review.

Log in to accept or request a revision:
[app URL]/projects/[project id]/engagement/[engagement id]

— The Consulten Team
```

---

## Environment Variables

| Variable | Where |
|---|---|
| `RESEND_API_KEY` | `.env.local`, Vercel env vars (Production + Preview) |

---

## Out of Scope (M3)

- Email templates / HTML / React Email
- Email delivery log in DB
- Retry / queue logic
- Unsubscribe / preference management
- Admin notification emails
