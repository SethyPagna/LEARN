# LEARN

LEARN is a Cloudflare-first study workspace with notes, native docs, sheets, slides, quizzes, study games, AI tutor workflows, progress tracking, multilingual vocabulary, file capture, calendar planning, group chat, automation logs, and first-party login.

The deployable app name is `learn`. Each sibling app should use separate Cloudflare resources; this repo only creates or modifies `learn-*` resources.

## Quick Start (Windows)

Double-click a file in the project folder. Needs [Node.js](https://nodejs.org) 20.9 or newer (the LTS version is best).

| File | What it does |
| --- | --- |
| `run.bat` | Starts LEARN on this PC and opens it in the browser. Ctrl+C stops it. |
| `test.bat` | Type check and every test. `test.bat full` adds a production build; `test.bat tour` screenshots every page of a running LEARN. |
| `deploy.bat` | Publishes to Cloudflare or Vercel: every check first, then one question before anything goes live. |
| `tools.bat` | Health check, clean caches, reinstall packages, reset local data, Cloudflare preview, tunnel. |

Local data (accounts, notes, designs, chats, uploads) lives in `.wrangler\state`. Cleaning caches and deploying never touch it; only **Reset local data** in `tools.bat` deletes it, after you type `RESET`.

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

`run.bat` does the local setup on its first start. Local setup and development
do not require Cloudflare login. To prepare without starting:

```powershell
ops\run\setup-first-time.bat
```

Setup installs the pinned dependencies, creates `ops\cloudflare\.dev.vars` only
when missing, and applies local D1 migrations. Existing local data and credentials
are preserved. For first-time remote provisioning, use `ops\run\setup-d1.bat`
and `ops\run\setup-r2.bat` after Cloudflare authentication. Set the resulting
database id in both Wrangler configs and your deployment environment.

Set production secrets with Wrangler or the Cloudflare dashboard:

```powershell
ops\run\bin\pnpm.cmd exec wrangler secret put SESSION_SECRET
ops\run\bin\pnpm.cmd exec wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN
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
run.bat
```

This refreshes packages, applies local D1 migrations and starts Next dev plus the realtime hub with D1/R2 bindings available through OpenNext's Cloudflare integration, then opens the browser once the first page answers. If LEARN is already running it opens that copy; a port another app holds is skipped for the next free one. `run.bat --no-browser` skips the browser; `set PORT=3001` first picks another port.

The root launchers hand over to `ops\run`, where every step also has its own file:

| Windows launcher | Action |
| --- | --- |
| `ops\run\start-local.bat` | Same as `run.bat` |
| `ops\run\test.bat` | Same as `test.bat` |
| `ops\run\check.bat` | Typecheck and run tests |
| `ops\run\build.bat` | Build production Next.js output |
| `ops\run\preview-cloudflare.bat` | Build and preview the Worker locally |
| `ops\run\doctor.bat` | Check types, tests, local D1 migration status and Cloudflare sign-in |
| `ops\run\tools.bat` | Same as `tools.bat` |
| `ops\run\run-task.bat` | The task engine behind all of them |

A double-clicked window stays open at the end so results can be read; typed into
a terminal, launchers end at once. For automation, set `LEARN_NO_PAUSE=1`;
launchers preserve the command's exit code. Remote deployments ask before going
live and require Cloudflare sign-in or configured credentials.

For local AI, run Ollama with an installed chat model and set `OLLAMA_BASE_URL`
to `http://127.0.0.1:11434` and `OLLAMA_MODEL` to its name in
`ops/cloudflare/.dev.vars`. Restart LEARN and select **Ollama (local server)** in
AI. The endpoint is restricted to the LEARN server's loopback address; a hosted
Worker cannot reach Ollama on your personal computer. Unconfigured or failed
providers show an error instead of a saveable AI answer.

Calls use one peer connection, including invitations sent to a group. For
networks requiring a relay, configure `LEARN_TURN_URLS` (comma-separated TURN
URLs) and `LEARN_TURN_SECRET` with a coturn-compatible shared secret. Authenticated
clients receive temporary credentials; the shared secret stays on the server.
Direct local call checks do not establish reliability on every external network.

## Deploy

`deploy.bat` asks for the target; `deploy.bat cloudflare` or `deploy.bat vercel`
skips the question, and `--yes` after the target skips the confirmations for
automation.

Cloudflare Workers (signs in through the browser when needed, or uses `CLOUDFLARE_API_TOKEN`):

```powershell
deploy.bat cloudflare
```

The Worker name is `learn`, so the default Workers URL is `https://learn.<account-workers-subdomain>.workers.dev`. Cloudflare's workers.dev subdomain is account-level; changing it from `learn-learning-app` to `learn`, `learning`, or `learn-learning` changes workers.dev URLs for other Workers in the same account too. Use a custom domain for a LEARN-only hostname change.

Vercel project `learn` (needs `VERCEL_TOKEN`):

```powershell
deploy.bat vercel
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
test.bat
test.bat full
test.bat tour
```

`test.bat tour` (or `ops\run\bin\pnpm.cmd test:tour`) needs LEARN running on this PC (`run.bat`) and Chrome or Edge installed. It signs in with the starter admin account, opens every page and saved project at desktop and phone size, and saves screenshots plus layout numbers to `output\visual-tour` (git-ignored). `TOUR_ONLY=canvas,notes` limits it to a few pages.

The same checks as package scripts:

```powershell
ops\run\bin\pnpm.cmd lint
ops\run\bin\pnpm.cmd test
ops\run\bin\pnpm.cmd build
```

On Windows, `ops\run\bin\pnpm.cmd <script>` is the preferred local wrapper for repo scripts. It uses the pinned pnpm toolchain directly and avoids npm reading pnpm-only project config.

The test suite covers auth helpers, learning personalization, AI provider resolution and encrypted provider primitives, Cloudflare D1 API configuration, R2 object key isolation, upload validation, editor history, CSV sheet import/export, and localization fallback.

## Repository Layout

Most app code lives under `src/app`, `src/components`, `src/lib`, `src/workers`, and `src/tests`. Operations files live under `ops`, command wrappers under `ops/run`, migrations under `ops/migrations`, and planning or architecture notes under `ops/docs`. See `ops/docs/architecture/root-files.md` before moving root config files; several are intentionally kept at root because Next.js, pnpm, Vercel, Wrangler, Docker, or shadcn auto-discover them there.
