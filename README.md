# Learning OS

Learning OS is a Cloudflare-native study workspace with Notion-style notes, quiz practice, AI tutor workflows, progress tracking, multilingual vocabulary, file capture, automation logs, and first-party login.

Production uses Cloudflare Workers, D1, and R2. Supabase is not required.

## Default Login

The first database setup seeds two accounts:

- Admin: `admin` / `Admin123456!`
- Learner: `learner` / `Learn123456!`

Change these before using real learner data.

## First Setup

Never commit real Cloudflare, AI, or tunnel secrets. If a token was pasted into chat or logs, rotate it before production use.

```powershell
corepack pnpm install
copy .dev.vars.example .dev.vars
run\setup-first-time.bat
```

When `wrangler d1 create learning-os-db` prints the database id, paste that id into `wrangler.jsonc` at `d1_databases[0].database_id`. Keep the binding name as `LEARNING_OS_DB`.

Set production secrets with Wrangler or the Cloudflare dashboard:

```powershell
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN
```

Set these local-only values in `.dev.vars`:

- `SESSION_SECRET`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`
- Optional provider keys such as `GROQ_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_AI_API_KEY`

## Cloudflare Resources

Wrangler bindings are the production source of truth:

- D1 database: `LEARNING_OS_DB`, database name `learning-os-db`
- R2 uploads bucket: `LEARNING_OS_FILES`, bucket name `learning-os-files`
- R2 Next cache bucket: `NEXT_INC_CACHE_R2_BUCKET`, bucket name `learning-os-next-cache`

D1 migrations live in `migrations/`. Apply them with:

```powershell
corepack pnpm db:migrate:local
corepack pnpm db:migrate:remote
```

## Run Locally

Run the app locally with OpenNext's Cloudflare binding integration:

```powershell
run\start-local.bat
```

This applies local D1 migrations and starts Next dev with D1/R2 bindings available through OpenNext's local Cloudflare integration. For a full Workers preview, use `corepack pnpm preview:cloudflare` from WSL or a Linux CI runner; native Windows can block OpenNext's symlink-heavy standalone bundling.

## Cloudflare Try-Run Tunnel

```powershell
$env:CLOUDFLARE_TUNNEL_TOKEN="..."
run\try-cloudflare.bat
```

This starts the Cloudflare preview and exposes it through a Cloudflare tunnel. Keep the tunnel token outside git.

## Deploy

```powershell
run\deploy-cloudflare.bat
```

The deploy script installs dependencies, runs tests and type checks, applies remote D1 migrations, then deploys to Cloudflare Workers. Run it from WSL/Linux if native Windows blocks OpenNext symlink creation.

## APIs

- `/api/auth/*` for login, logout, and session.
- `/api/notes/*` for note pages.
- `/api/quizzes/*` for quiz banks and attempts.
- `/api/ai/chat` for tutor messages.
- `/api/files` for R2-backed uploads and file listing.
- `/api/files/[id]/download` for authenticated R2 downloads.
- `/api/import` for turning pasted learning data into a designed note.
- `/api/automation` and `/api/automation/run` for prompt and job automation.
- `/api/integrations/health` for admin Cloudflare/D1/R2/AI checks.

## AI Providers

The default provider is Cloudflare AI Gateway:

- `AI_PROVIDER_DEFAULT=cloudflare`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_AI_GATEWAY_ID`
- `CLOUDFLARE_AI_GATEWAY_TOKEN`

Other providers remain available through runtime secrets: Groq, Mistral, Cerebras, Google AI, Cohere, and Vercel AI Gateway.

## Verification

```powershell
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

The test suite covers auth helpers, learning personalization, AI provider resolution, and the Cloudflare-first configuration path.
