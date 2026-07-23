# File Uploads Design

**Goal:** Replace the deliverable URL text field with a real file picker — consultant uploads a file, it is stored in Vercel Blob, and the resulting public URL is saved to `Deliverable.fileUrl`.

**Date:** 2026-07-23

---

## Context

The `Deliverable` model already has a `fileUrl String?` column. The consultant engagement detail page currently shows a plain `<input type="url">` where the consultant pastes a link. This spec replaces that with an `<input type="file">`.

---

## Architecture

- **Storage:** Vercel Blob (`@vercel/blob`). Public access — URLs are unguessable and the app already restricts which pages show the link (consultant sees their own engagements, client sees theirs, admin sees all).
- **Auth:** `BLOB_READ_WRITE_TOKEN` env var, set in `.env.local` and Vercel project settings.
- **Upload path:** Server Action — the file is streamed through the Next.js server to Vercel Blob in a single multipart form submission. No client-side JS, no new API routes.
- **Body size limit:** `next.config.ts` sets `serverActions.bodySizeLimit: '10mb'`. Covers typical consulting deliverables (PDFs, slide decks, Word docs).
- **No schema changes:** `Deliverable.fileUrl` already exists.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@vercel/blob` dependency |
| `next.config.ts` | Modify | Add `serverActions.bodySizeLimit: '10mb'` |
| `app/(consultant)/engagements/[id]/page.tsx` | Modify | Replace URL input with file input |
| `app/(consultant)/engagements/actions.ts` | Modify | Call `put()` on the uploaded file, store resulting URL |
| `.env.local` | Modify | Add `BLOB_READ_WRITE_TOKEN` |
| `tests/file-upload.test.ts` | Create | Integration test: mock `put()`, verify `fileUrl` stored |

---

## Upload Flow

1. Consultant selects a file via `<input type="file" name="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip">`.
2. Form submits as `multipart/form-data` to `submitDeliverableAction`.
3. Action reads `formData.get('file')` as a `File` object.
4. If a file was provided (size > 0): calls `put(file.name, file, { access: 'public' })` from `@vercel/blob`, gets back `{ url }`.
5. `url` is stored as `Deliverable.fileUrl`. Engagement transitions to `DELIVERABLE_SUBMITTED` as before.
6. If no file provided: `fileUrl` is null — submission still proceeds (no file is valid).
7. On `put()` failure: error bubbles to Next.js error boundary — upload failures are not swallowed.

---

## Display

No changes needed to display pages. All three locations that show `fileUrl` already render it as a link:
- `app/(consultant)/engagements/[id]/page.tsx` — existing link rendering
- `app/(client)/projects/[id]/engagement/[engagementId]/page.tsx` — existing link rendering
- `app/(admin)/deliverables/[id]/page.tsx` — existing link rendering

---

## Testing

One new test file `tests/file-upload.test.ts`:
- Mocks `@vercel/blob` `put()` to return `{ url: 'https://blob.vercel-storage.com/test-file.pdf' }`
- Calls `submitDeliverableAction` with a fake `File` and a real engagement ID
- Asserts `Deliverable.fileUrl` equals the mocked URL
- Asserts engagement status transitions to `DELIVERABLE_SUBMITTED`

Existing state-machine and spine tests cover the engagement transition itself; this test only verifies the file URL wires through correctly.

---

## Environment Variables

| Variable | Where | Value |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | `.env.local` + Vercel project settings | Token from Vercel Blob store dashboard |

---

## Out of Scope (MVP B)

- Private/signed URLs
- File size validation beyond the body limit
- Virus scanning
- Multiple file attachments per deliverable
- File preview in the UI
