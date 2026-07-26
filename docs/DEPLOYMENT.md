# Consulten — Deployment Guide

GitHub repo: `https://github.com/aabbottbos/c0nsult3n`

---

## Prerequisites

You need accounts and credentials for:

| Service | Purpose | Where to get it |
|---------|---------|----------------|
| Neon | Postgres database | neon.tech |
| Clerk | Auth + webhooks | clerk.com |
| Anthropic | AI (Claude) | console.anthropic.com |
| Resend | Transactional email | resend.com |
| Vercel Blob | File storage | vercel.com/storage/blob |
| Sentry (optional) | Error monitoring | sentry.io |

---

## Local Development

### 1. Clone and install

```bash
git clone https://github.com/aabbottbos/c0nsult3n.git consulten
cd consulten
npm install
```

### 2. Configure environment

Copy the example and fill in real values:

```bash
cp .env.example .env.local
```

`.env.local` needs all of these:

```bash
# Neon — use the pooled connection string (add ?sslmode=require if not present)
DATABASE_URL=postgresql://neondb_owner:...@ep-...pooler.neon.tech/neondb?sslmode=require

# Clerk — from your Clerk dashboard > API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...     # set after step 5 below

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Resend — your sending domain must be verified in Resend
RESEND_API_KEY=re_...

# Vercel Blob — from your Vercel project > Storage > Blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...

# Sentry (optional)
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

Also create `.env` (Vitest reads this for `DATABASE_URL`):

```bash
DATABASE_URL=postgresql://...same pooled string...
```

### 3. Run database migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. (Optional) Seed the database

Creates sample data useful for manual testing:

```bash
npx prisma db seed
```

### 5. Configure Clerk

**Session token customization** (required — without this, role checks return 404):

1. Clerk Dashboard → Configure → Sessions → Edit
2. Add to the "Customize session token" section:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
3. Save.

**Webhook** (required for client/consultant sign-up to work):

1. Install [ngrok](https://ngrok.com) for a public tunnel to localhost.
2. Run: `ngrok http 3000`
3. Clerk Dashboard → Webhooks → Add endpoint
   - URL: `https://<your-ngrok-id>.ngrok.io/api/webhooks/clerk`
   - Events: `user.created`
4. Copy the **Signing Secret** → paste as `CLERK_WEBHOOK_SECRET` in `.env.local`

### 6. Run the dev server

```bash
npm run dev
```

App is at `http://localhost:3000`.

### 7. Create your first admin user

Admin accounts cannot self-register — they must be promoted manually:

1. Sign up at `/sign-up` (pick any role — you'll override it)
2. Clerk Dashboard → Users → select the user → Metadata
3. Set **Public Metadata**: `{"role": "admin"}`
4. Sign out and sign back in → redirected to `/dashboard`

---

## Vercel Deployment

### 1. Connect the repo

Vercel Dashboard → Add New Project → Import `aabbottbos/c0nsult3n`.

**Note:** If you hit a Git integration email-mismatch error (known issue — Vercel team email vs GitHub account), use the Vercel CLI instead:

```bash
npm i -g vercel
vercel login
vercel --prod
```

### 2. Set environment variables

In Vercel Dashboard → Project → Settings → Environment Variables, add all of the same variables from `.env.local` above. Set them for **Production**, **Preview**, and **Development** as appropriate.

Additional Vercel-specific vars:

```bash
# Required for Vercel Blob (same token)
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
```

### 3. Configure build settings

Vercel auto-detects Next.js. The build command in `package.json` already runs `prisma generate` before `next build` — no changes needed.

Verify in Vercel → Project → Settings → General:
- **Build Command**: `npm run build` (or leave as default)
- **Output Directory**: `.next` (auto-detected)
- **Node.js Version**: 22.x (or latest LTS)

### 4. Run migrations on the production database

Migrations do NOT run automatically on deploy. After each deploy that includes schema changes:

```bash
# Point at the production DATABASE_URL
DATABASE_URL="postgresql://..." npx prisma migrate deploy
```

Or add a post-deploy hook in your CI to run this automatically.

### 5. Configure Clerk webhook for production

1. Clerk Dashboard → Webhooks → Add endpoint
   - URL: `https://your-vercel-domain.vercel.app/api/webhooks/clerk`
   - Events: `user.created`
2. Copy Signing Secret → set `CLERK_WEBHOOK_SECRET` in Vercel env vars
3. Redeploy (env var change requires a new deployment to take effect)

### 6. Verify the deployment

- `/` → redirects to `/sign-in` (unauthenticated)
- `/sign-up` → role selector appears after Clerk credentials step
- Create a client account → webhook fires → `/projects` loads without error
- Create a consultant account → `/invitations` loads without error
- Promote an admin user (see step 7 in Local Dev above) → `/dashboard` loads

---

## Resend Domain Verification

Email sends will fail (403) until your sending domain is verified:

1. Resend Dashboard → Domains → Add domain (`consulten.co` or your domain)
2. Add the DNS records Resend provides (MX, TXT, DKIM)
3. Wait for verification (usually < 5 minutes)

The FROM address is hardcoded as `Consulten <noreply@consulten.co>` in `lib/email.ts`. Change this if using a different domain.

---

## Running Tests

Tests hit the **real Neon dev DB** — not a mock or local Postgres. Make sure `.env` has `DATABASE_URL` pointing at your Neon dev branch.

```bash
npm test                              # all 40 tests
npx vitest run tests/disputes.test.ts # single file
```

Tests use `TRUNCATE CASCADE` before and after each test — they are destructive on whatever DB `DATABASE_URL` points at. Never point this at a production database.

---

## Push Procedure (GitHub)

This `build/` directory is a subdirectory of a parent git repo. Standard `git push` from inside `build/` won't work. Always push via subtree from the parent:

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```

The `consulten` remote points to `https://github.com/aabbottbos/c0nsult3n.git`.

---

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Role checks return 404 | Session token not customized in Clerk | Add `"metadata": "{{user.public_metadata}}"` to session token config |
| Sign-up creates no DB records | Clerk webhook not configured or not reachable | Set up ngrok + webhook endpoint; check `CLERK_WEBHOOK_SECRET` |
| Email sends fail with 403 | Resend domain not verified | Add DNS records in Resend dashboard |
| `prisma generate` fails at build | `app/generated/prisma/` missing (gitignored) | Normal — build script runs `prisma generate` before `next build` |
| Tests fail with connection errors | Neon WebSocket pool exhausted from concurrent runs | Wait ~30s and re-run; never run multiple `npm test` processes in parallel |
| Vercel deploy fails (email mismatch) | Vercel team email ≠ GitHub account email | Use `vercel --prod` CLI deploy instead of Git integration |
