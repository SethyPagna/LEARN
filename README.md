# LEARN

LEARN is a Cloudflare-first study workspace with notes, native docs, sheets, slides, quizzes, study games, AI tutor workflows, progress tracking, multilingual vocabulary, file capture, calendar planning, group chat, automation logs, and first-party login.

The deployable app name is `learn`. Each sibling app should use separate Cloudflare resources; this repo only creates or modifies `learn-*` resources.

## Default Login

The first database setup seeds two accounts:

- Admin: `admin` / `Admin123456!`
- Learner: `learner` / `Learn123456!`

Change these before using real learner data.

## Cloudflare Resources

Wrangler bindings and API-mode env vars use the same resource names:

- D1 database: binding `LEARN_DB`, database name `learn-db`
- R2 uploads bucket: binding `LEARN_FILES`, bucket name `learn-files`
- R2 Next cache bucket: binding `NEXT_INC_CACHE_R2_BUCKET`, bucket name `learn-next-cache`
- Cloudflare AI Gateway ID: `learn`

Never commit real Cloudflare, AI, Vercel, or tunnel secrets. If a token was pasted into chat or logs, rotate it before production use.

## First Setup

```powershell
corepack pnpm install --frozen-lockfile
copy ops\env\dev.vars.example .dev.vars
run\setup-first-time.bat
```

When `wrangler d1 create learn-db` prints the database id, paste that id into `ops\cloudflare\wrangler.jsonc` at `d1_databases[0].database_id` and set `CLOUDFLARE_D1_DATABASE_ID` in ignored local, GitHub, Vercel, or Docker env.

Set production secrets with Wrangler or the Cloudflare dashboard:

```powershell
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN
```

For Vercel and Docker, also set:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`

## Run Locally

Run the app locally with OpenNext's Cloudflare binding integration:

```powershell
run\start-local.bat
```

This applies local D1 migrations and starts Next dev with D1/R2 bindings available through OpenNext's Cloudflare integration.

## Deploy

Cloudflare Workers:

```powershell
run\deploy-cloudflare.bat
```

The Worker name is `learn`, so the default Workers URL is `https://learn.<account-workers-subdomain>.workers.dev`. Cloudflare's workers.dev subdomain is account-level; changing it from `learn-learning-app` to `learn`, `learning`, or `learn-learning` changes workers.dev URLs for other Workers in the same account too. Use a custom domain for a LEARN-only hostname change.

Vercel project `learn`:

```powershell
run\deploy-vercel.bat
```

Docker/domain self-deploy:

```powershell
docker compose -f ops\docker\docker-compose.yml up --build
```

Docker uses Cloudflare D1/R2 through API credentials. It does not run local database or object storage replacement services.

## Security Posture

LEARN uses hashed passwords, hashed session tokens, same-origin mutation checks, durable D1-backed rate-limit buckets when D1 is configured, strict security headers, executable upload blocking, size/type validation, authenticated R2 downloads, and audit logs. No application code can guarantee foolproof protection against malware or DDoS by itself; production should also enable Cloudflare WAF, bot protection or Turnstile where needed, account-level rate limiting, and token rotation for any exposed credentials.

## GitHub Secrets

The included workflows expect these repository or environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_D1_DATABASE_ID`
- `CLOUDFLARE_R2_ACCESS_KEY_ID`
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

## APIs

- `/api/auth/*` for login, logout, and session.
- `/api/notes/*` for note pages.
- `/api/notes/[id]/versions` for note history.
- `/api/quizzes/*` for quiz banks and attempts.
- `/api/ai/chat` for tutor messages.
- `/api/ai/providers` for admin-managed provider configs.
- `/api/files` for R2-backed uploads and file listing.
- `/api/files/[id]/download` for authenticated R2 downloads.
- `/api/profile`, `/api/preferences`, `/api/audit`, `/api/calendar`, `/api/docs`, `/api/sheets`, `/api/slides`, `/api/workspace/members`, `/api/invites`, `/api/groups`, `/api/chat`, and `/api/games` for the mature workspace surfaces.
- `/api/import` for turning pasted learning data into a designed note.
- `/api/automation` and `/api/automation/run` for prompt and job automation.
- `/api/integrations/health` for admin Cloudflare/D1/R2/AI checks.

## Verification

```powershell
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

On Windows, `run\bin\pnpm.cmd <script>` is the preferred local wrapper for repo scripts. It uses the pinned pnpm toolchain directly and avoids npm reading pnpm-only project config.

The test suite covers auth helpers, learning personalization, AI provider resolution and encrypted provider primitives, Cloudflare D1 API configuration, R2 object key isolation, upload validation, editor history, CSV sheet import/export, and localization fallback.

## Repository Layout

Most app code lives in `app`, `components`, `lib`, `workers`, `styles`, and `types`. Operations files live under `ops`, command wrappers under `run`, and planning or architecture notes under `docs`. See `docs/architecture/root-files.md` before moving root config files; several are intentionally kept at root because Next.js, pnpm, Vercel, Wrangler, Docker, or shadcn auto-discover them there.
