# Learning OS

Learning OS is a standalone study workspace with notes, knowledge pages, quizzes, AI tutor workflows, progress tracking, first-party login, and Postgres-backed memory.

Business OS is used only as an operational reference: Docker-first local runtime, explicit secret handling, and one-step run files. No Business OS production secrets or data are copied into this project.

## Default Login

The database seeds two local accounts on first run:

- Admin: `admin` / `Admin123456!`
- Learner: `learner` / `Learn123456!`

Change these before using real data.

## Local Development

```powershell
corepack pnpm install
copy .env.example .env.local
corepack pnpm dev
```

Set `DATABASE_URL` in `.env.local` before signing in. For the complete stack, use Docker.

## One-Step Docker Run

Double-click or run:

```powershell
run\start-local.bat
```

This starts:

- Next.js app on `http://localhost:3000`
- Postgres on `localhost:55433`
- Redis on `localhost:6379`
- MinIO on `localhost:9100` and console on `localhost:9101`

Postgres is the source of truth for users, sessions, notes, quiz attempts, AI chats, provider configs, goals, and audit logs.

## Cloudflare Try-Run

Set a Cloudflare tunnel token in your shell or ignored runtime env:

```powershell
$env:CLOUDFLARE_TUNNEL_TOKEN="..."
run\try-cloudflare.bat
```

The script starts the Docker stack and then runs a `cloudflare/cloudflared` tunnel container. Keep the token out of git and rotate it if it is ever exposed.

Cloudflare Workers/OpenNext config is included in `wrangler.jsonc` for future edge experiments, but the full database-backed app should be run through Docker/Vercel unless Cloudflare Hyperdrive or another Postgres-compatible edge path is configured.

## Vercel Deployment

Add production environment variables in Vercel:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_BASE_URL`
- Optional AI keys: `GROQ_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `GOOGLE_AI_API_KEY`, `COHERE_API_KEY`, `VERCEL_AI_GATEWAY`

Then run:

```powershell
run\deploy-vercel.bat
```

The script installs dependencies, runs type checks, builds, and deploys production with Vercel CLI.

## AI Providers

The AI tutor resolves providers from runtime secrets only. If no key is configured, the tutor returns setup guidance instead of breaking the app.

Supported provider references:

- Groq: `GROQ_API_KEY`
- Mistral: `MISTRAL_API_KEY`
- Cerebras: `CEREBRAS_API_KEY`
- Google AI: `GOOGLE_AI_API_KEY`
- Cohere: `COHERE_API_KEY`
- Vercel AI Gateway: `VERCEL_AI_GATEWAY`

Use `AI_PROVIDER_DEFAULT` to prefer one provider.

## Automation, Prompt Design, And Localization

Learning OS includes a reusable AI prompt library for:

- importing raw question/answer/data dumps into structured learning content
- redesigning pasted material into clean Notion-style notes
- generating adaptive quizzes with explanations
- explaining mistakes after attempts
- creating personal study plans
- translating UI vocabulary

The automation catalog exposes daily briefs, note-to-quiz generation, mistake review, content design passes, and localization sync through `/api/automation`.

The multilingual vocabulary covers English, Khmer, simplified/traditional Chinese, Vietnamese, Thai, French, Spanish, German, Japanese, Korean, Portuguese, Italian, Arabic, Hindi, Indonesian, Malay, and Turkish. Add new labels to `lib/i18n/vocabulary.ts` once and reuse them across the UI.

## Supabase Optional Integration

Supabase can be configured as an optional integration through environment variables only. Do not commit real Supabase service-role or legacy anon keys.

If any Supabase secret has been pasted into chat, rotate it before using it in production.

## Verification

```powershell
corepack pnpm test
corepack pnpm lint
corepack pnpm build
```

The unit tests cover password/session helpers, personalization calculations, and AI provider resolution.
