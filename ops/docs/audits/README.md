# LEARN — Audits

Audit outputs for the LEARN app. Each report is reproducible from the revision it
names; re-run after any structural change.

| Date | Report | Skill used | Scope |
| --- | --- | --- | --- |
| 2026-09-21 | [Code Quality & Maintainability Audit](./2026-09-21-code-quality-audit.md) | `code-quality-audit` | Dead code, duplication, complexity, legacy, redundant IO, tech debt — 37 findings, ~2,900 lines removable |
| 2026-09-21 | [Security Audit (20-point)](./2026-09-21-security-audit.md) | `security-*-hardening` (×3) | 14 PASS / 4 PARTIAL / 2 FAIL — all 3 immediate items fixed in `582d149` |
| 2026-09-21 | [AI Council](./2026-09-21-ai-council.md) | `ai-council` | Scope & sequencing decision — 5 advisors + cross-critique + Chairman verdict |
| 2026-09-21 | [AI Council — Session 2](./2026-09-21-ai-council-next-investment.md) | `ai-council` | Where the next unit of effort goes — verdict: *narrow the order, not the ambition*. **Executed** — see [Route-handler test harness](#route-handler-test-harness--executed) |
| 2026-09-21 | [AI Council — Session 3 (takeover)](./2026-09-21-ai-council-takeover.md) | `ai-council` | How to finish: debloat, optimise, integrate. Verdict: *close the seams, add no new surface*. **#1 step executed** — six consumer-less routes closed |

**Revision audited:** `5f06f9e1` (`main`) — cleanup work is on branch `cleanup/stage-1`

## Start here

1. **Read the AI Council reports first.** Session 1 frames *why* the cleanup matters —
   the root cause is scope *order*, not scope size. Session 2 answers *what next*, and
   its #1 step has now been executed with a positive result.
2. **Then the code-quality audit's Cleanup Plan.** Stage 0 is closed (build,
   typecheck and tests are verified). Stages 1 and 3 are executed; Stage 2
   (consolidation), 4 (structural refactor) and 5 (schema) are not.
3. **Then the security audit's Prioritized Remediation Plan.** All three immediate
   items are fixed.

**Status at a glance:** Stage 1 ✅ · Stage 3 ⚠️ partial · Stage 2/4/5 ⬜ not started ·
route-handler coverage ✅ **unblocked** · voice transcription ✅ **shipped**.

The audit's biggest blocker — *"`app/api` and `lib/data.ts` have no tests, so
consolidation refactors ship green and break in production"* — has been **removed**.
Session 2's kill criterion was answered in the positive: the route handlers are
testable with **zero production changes**. Stage 2 and Stage 4 are now safe to start.

## Reproducing the static analysis

```bash
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format md
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format json
```

## Verified baseline

Current state on branch `cleanup/stage-1` (commit `b2da5f87`):

| Check | Result |
| --- | --- |
| `tsc --noEmit` | ✅ PASS (exit 0) |
| Test suite | ✅ **429/429 pass**, 51 files |
| Route-handler coverage | ✅ **28 tests over 6 handlers** (`quizzes`, `quizzes/attempts`, `auth/login`, `auth/logout`, `auth/signup-request`, `ai/transcribe`) — was 0 |
| `next build --webpack` | ✅ Compiled in 14.6min · TypeScript passed · **78/78** static pages generated · `BUILD_ID` written · `.next/server/app/api/ai/transcribe/route.js` present |
| `pnpm-lock.yaml` | ✅ Repaired — importer block matches `package.json` (44 entries) |

## Known caveats

1. **`next build` completes compile, typecheck and static generation, then aborts in the final "Collecting build traces" step.** Confirmed twice on a *clean* `.next` (`.next` moved aside first, so nothing stale was involved): it dies deleting `.next/export-detail.json` because the sandbox's delete guard has a 50-deletions-per-turn budget (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`). Nothing about the failure touches application code — `BUILD_ID`, the route bundles, and all 78 static pages are written. Only the post-trace packaging step is unverified. **`next build` also needs `ESBUILD_BINARY_PATH` set** to `node_modules/.pnpm/@esbuild+win32-x64@0.28.0/.../esbuild.exe`, or it fails immediately with `Host version "0.28.0" does not match binary version "0.25.4"`.
2. **`node_modules` is still not fully repaired and cannot be here.** A complete `pnpm install` must delete thousands of files; the same guard blocks it, and pnpm also calls the blacklisted `wmic.exe`. The interrupted run left ~1,766 empty package dirs and ~478 `.ignored_*` staging dirs under `node_modules/.pnpm`. Everything on the build path was repaired by hand — notably the `wrangler` peer dependency that `@opennextjs/cloudflare` imports at runtime from `next.config.mjs`. **Run `pnpm install` in a normal terminal first.**
3. **The green test suite still does not cover `lib/data.ts` or `workers/` directly.** Route-handler coverage now exists for 6 of 50 handlers, and those tests exercise `data.ts` transitively through the real code path — but `data.ts` has no tests of its own, and the realtime/WebRTC Durable Objects have none. Treat "tests pass" as *not* evidence of safety for those paths.
4. **`pnpm audit` could not be run**, so the security report's Item 20 reflects the absence of monitoring rather than a confirmed vulnerability.

## Housekeeping changes made by this audit

To keep the structural guard test green, these were updated:

- `.gitignore` — added `.workbuddy-ai/` (follows the existing `.agents/` convention for local tooling metadata)
- `.dockerignore` — added `.workbuddy-ai`
- `src/tests/project/project-structure.test.ts` — registered `audits` as an allowed docs topic

The guard test also earned its keep twice: it rejected the new directories this audit introduced (correctly), and later caught a stray 0-byte `_tmp_*` file the sandbox's interrupted install left in the repo root.

## Stage 1 cleanup — executed

On branch **`cleanup/stage-1`** (commit `7e951fb`), `main` untouched:

| | Before | After |
| --- | --- | --- |
| Lines removed | — | **−1,196** across 15 files |
| Dependencies | 63 | **44** (−19) |
| Tracked files | 314 | 308 |
| Unused exports | 24 | 16 |
| Orphan files | 4 | 1 |

Verified: `tsc --noEmit` exit 0, **358/358 tests pass**, 0 files missing from disk.

**Left for an explicit decision** (deleting them means deleting passing tests): `src/lib/learn-route-features.ts`, `src/lib/cloudflare-cleanup.ts`, `src/lib/workspace-cleanup.ts`, `src/lib/content-search.ts`.

## Stage 3 — performance & correctness — executed

On branch **`cleanup/stage-1`** (commit `9fd87a4c`):

| Change | Effect |
| --- | --- |
| `getCurrentUserFromToken` hashed the session token **twice** per call | One hash per request, across 123 `requireApiUser` call sites |
| `UPDATE user_sessions SET last_seen_at` on **every** request | Throttled to 5 minutes. The column is written everywhere and **read nowhere** |
| SQLite `datetime('now')` parsed as local time | Fixed — the staleness comparison was skewed by the UTC offset |
| `updateProfile` re-read the whole session to return a user it already had | Rebuilt in place (saves a hash + SELECT + possible UPDATE per profile save) |
| 3 N+1 insert loops (quiz questions, attempt answers, practice items) | 20-question quiz: **20 sequential round trips → 2**; attempt submission → 4. D1 runs a database's queries one at a time, so these serialised completely |
| Autosave failures were invisible; manual Save had no error path | `saveActive()` reports failures through the status toast and returns a boolean. Local draft is retained |
| `pnpm-lock.yaml` listed the 19 deps removed in Stage 1 | Regenerated — `--frozen-lockfile` no longer breaks CI |

New: `src/lib/sql-batch.ts` (+12 tests). Multi-row `INSERT`s are chunked to **D1's documented 100-bound-parameter ceiling**, verified against Cloudflare's docs — chunking is mandatory, not an optimisation.

Verified: `tsc --noEmit` exit 0, **370/370 tests pass**.

## Security remediation — the three immediate items — executed

On branch **`cleanup/stage-1`** (commit `582d149`):

| Item | Was | Now |
| --- | --- | --- |
| 5 — fallback encryption key | AES key derived from the literal `"learn-local-development-key"` when no master key was set — silently, in production | Throws in production with an actionable message; development keeps the fallback. Status surfaced in `/api/integrations/health` |
| 6 — CSRF on mutation routes | 4 mutation routes used a bare `getCurrentUser()`, skipping `hasTrustedOrigin()` | All use `requireApiUser()`; an invariant test enforces this for every future route |
| 18.3 — `Permissions-Policy` | `camera=()` / `microphone=()` **broke group calling and call recording** — `getUserMedia` is rejected before any permission prompt | `camera=(self), microphone=(self)` |
| 19 — HSTS | Absent | `max-age=63072000`, deliberately without `includeSubDomains`/`preload` (see the report) |

New: `src/tests/security/security-hardening.test.ts` (+13 tests). Two are invariant guards rather than descriptions of current behaviour: every mutation route must use `requireApiUser` or appear in a capped public allowlist, and the header assertions import `next.config.mjs` and check the real header objects.

Verified: `tsc --noEmit` exit 0, **383/383 tests pass**.

**Still outstanding:** rotate any provider secrets that were encrypted while the fallback may have been active (a provider-side action, not code); `'unsafe-eval'` in the production CSP (needs a browser check this environment cannot run); Items 10, 12, 20.

## Route-handler test harness — executed

On branch `cleanup/stage-1` (commit `b2da5f87`). This is AI Council Session 2's #1
step, and it had a pre-committed kill criterion: *if making `query()` stubbable
requires changing production code, stop and treat the data-layer shape as the real
blocker.*

**The kill criterion did not fire. Not one line of production code changed.**

### How it works

`src/tests/api/harness.ts` supplies `CLOUDFLARE_ACCOUNT_ID` /
`CLOUDFLARE_D1_DATABASE_ID` / `CLOUDFLARE_API_TOKEN` and intercepts
`globalThis.fetch` at the **D1 HTTP boundary**. That is the narrowest seam available:
the real `query()`, the real `normalizeD1Sql()`, the real statement routing and
response parsing all run unmodified. Only the network is fake.

The alternative — mocking `lib/data.ts` — was rejected. If a test needs a *module*
mocked, the seam is in the wrong place; a test that stubs `data.ts` proves nothing
about the wiring, which is where the bugs are.

| Piece | Purpose |
| --- | --- |
| `installDatabaseStub()` | Fake D1. Records every statement with its bound parameters. |
| `stub.on(/regex/, { rows })` | Canned response for matching SQL. |
| `stub.onHttp(/regex/, handler)` | Canned response for non-database outbound calls (AI providers). |
| `primeDatabase(stub)` | Runs the one-time starter seed, then clears the log, so assertions count only the handler's own statements. |
| `request(path, {...})` | Authenticated same-origin `NextRequest`, with `rawBody` for binary uploads. |

### What it bought

| Test file | Tests | What it pins |
| --- | --- | --- |
| `api/quizzes-route.test.ts` | 5 | Auth, CSRF, validation, statement batching, parameter binding |
| `api/quiz-loop.test.ts` | 3 | **The create → play → learn loop, end to end** |
| `api/auth-routes.test.ts` | 11 | Login/logout/access-request, and the auth hardening properties |
| `api/transcribe-route.test.ts` | 9 | Fail-closed config, content-type/size caps, provider error surfacing |

`auth-routes.test.ts` is written as security assertions rather than happy-path
descriptions. It answers four questions that were previously unverifiable:

- **Can an attacker distinguish "no such user" from "wrong password"?** No — the
  two 401 bodies are asserted byte-identical.
- **Is the raw session token ever persisted?** No — the stored value is asserted to
  be a 64-char SHA-256 hex digest that differs from the cookie value, and the same
  check applies to logout's `DELETE`.
- **Does the rate limiter actually stop a spraying loop?** Yes — the 9th attempt is
  a 429 with a `retry-after`. This test only means something because the bucket
  store is stateful; with a stateless fake the limiter's read-modify-write never
  increments and the test passes vacuously. See `installRateLimitStore`.
- **Is the cookie set with the attributes that make XSS theft hard?** Yes —
  `HttpOnly`, `SameSite=lax`, `Path=/`, and a ~14-day expiry.

Mutation checks confirm these are load-bearing, not descriptive: flipping `201`→`200`
in `quizzes/route.ts`, and raising the login limit from `8` to `100`, each turn exactly
one test red.

### Finding: the durable rate limiter was writing on every blocked request

Found while writing the auth tests. `checkDurableRateLimit` is a read-modify-write
(one `SELECT`, one `INSERT`) against `rate_limit_buckets`, and it incremented the
count on **every** request — including requests it had already decided to reject. An
attacker hammering `/api/auth/login` therefore forced a database write per request,
which is exactly when D1's per-database query serialisation hurts most.

Now the count is pinned once it reaches the limit: the answer cannot change until the
window resets, so there is nothing to record. Blocked requests do zero writes.

Measured cost of the limiter on a rejected login, pinned by a test so it stays
visible: **2 of the 3 D1 statements** are the limiter (the third is the credential
lookup). This is paid by every rate-limited route — login, signup, `ai/chat`,
`ai/transcribe`.

**Not fixed, deliberately:** the remaining cost could be halved by collapsing the
read-modify-write into one atomic `INSERT … ON CONFLICT … RETURNING`. That needs
`db.ts` to route `RETURNING` statements through `.all()` instead of `.run()`, because
`.run()` discards returned rows. The saving is ~10ms on requests that either already
take seconds (the AI calls) or are rare (login), and the change lands in a security
control. Recorded rather than done — the trade is not obviously worth it.

**The loop test is the important one.** AI Council Session 2's highest-confidence
finding was that nobody had ever demonstrated the app's core thesis closing — that
the thing you *make* and the thing you *play* are the same object. `quiz-loop.test.ts`
runs both real handlers against a **stateful** fake of the quiz tables, so the attempt
genuinely reads back the quiz the create step wrote. It asserts that playing a quiz
writes a `practice_sessions` row whose metadata carries the originating quiz id and
title — the artifact-becomes-activity link — alongside a scored attempt and batched
answer rows.

Sensitivity check: changing `201` to `200` in `src/app/api/quizzes/route.ts` turns the
test red. It is a real assertion, not a description of current behaviour.

Two bugs were found by the harness while it was being built, both in the harness
itself and both now pinned:
1. The D1 URL matcher (`api.cloudflare.com` + `/client/v4/accounts/`) also matches
   Workers AI (`/accounts/{id}/ai/run/{model}`), so every provider call was silently
   swallowed as a database query. Now keyed on `/d1/database/{id}/query$`.
2. `practice_sessions` binds 9 parameters, not 10 — `ended_at` is `now()`. The
   positional destructure was off by one; the mapping is now named.

## Voice transcription — executed

On branch `cleanup/stage-1`. Requested twice, previously **absent entirely** (zero
matches for `SpeechRecognition`, Whisper, `/audio/transcriptions`, or dictation).

| File | Role |
| --- | --- |
| `src/lib/ai/transcription.ts` | Provider resolution, base64 encoder, request builder, response parser |
| `src/app/api/ai/transcribe/route.ts` | `POST /api/ai/transcribe` — raw audio body, not JSON |
| `src/components/learn/voice-input.tsx` | `MediaRecorder` → upload → transcript; wired into the AI prompt composer |

**Provider:** Cloudflare Workers AI `@cf/openai/whisper-large-v3-turbo`, at
**$0.000513 per audio minute** — ordinary dictation stays inside the free daily
neuron allowance. The request shape was verified against the model's published input
schema on 2026-09-21 rather than guessed: `audio` accepts a base64 string, and the
transcript comes back at `result.text`.

**Two decisions worth recording:**
- **The Web Speech API was rejected** despite being free and giving live interim text.
  It does not exist in Firefox, it ships microphone audio to Google or Apple with no
  disclosure, and it is unavailable in installed PWAs on several platforms. Record-then-
  transcribe behaves identically everywhere and keeps audio on infrastructure this app
  already pays for.
- **`CLOUDFLARE_AI_GATEWAY_URL` is deliberately ignored** by the resolver. In
  `ai/providers.ts` it holds a *complete* endpoint already pointing at a chat model, so
  reusing it would post audio to a text model. `CLOUDFLARE_AI_TRANSCRIPTION_URL` is the
  explicit override instead. There is a test for exactly this.

**No chunking.** Cloudflare's own tutorial splits long files into 1 MB pieces, which is
right for hour-long recordings and wrong for dictation — chunk boundaries cut words in
half and the transcripts concatenate mid-sentence. An 8 MB cap is enforced instead, so
the model only ever sees audio short enough to transcribe in one pass.

**To enable it:** set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_GATEWAY_TOKEN` (or
`CLOUDFLARE_API_TOKEN`). Without them the route returns **503 with an actionable
message** rather than failing at the provider.

## Known feature gaps found while auditing

Recorded because these were requested capabilities, and an audit that only reports on what exists will not tell you what is missing.

| Requested | Reality |
| --- | --- |
| **Voice transcription throughout the app** | ✅ **Implemented** — `POST /api/ai/transcribe` + `VoiceInput`, currently wired into the AI prompt composer. Not yet wired into the Studio editor, notes, or chat. |
| Group calling, call recording | Implemented (`getUserMedia` + `MediaRecorder`) — and was **broken in production** by the `Permissions-Policy` header bug. |
| Vault / Studio editors, quiz + practice, multiplayer activities, realtime chat, calendar | Implemented; see the code-quality audit's negative findings for the verified-in-use list. |

## Session 3 — AutoCoder takeover — executed

Branch `cleanup/stage-1`, `main` untouched at `5f06f9e1`. Baseline entering the session: `45638de`.

| Commit | Change |
| --- | --- |
| `49f468a` | **fix:** close the write-IDOR on quiz upserts. `saveQuiz`'s `ON CONFLICT (id) DO UPDATE` and `archiveQuiz` took the row id from the request body with no ownership filter, so any signed-in user could rewrite another user's quiz — and the `DELETE FROM quiz_questions` that follows then wiped its questions. Migration `0013` adds `quizzes.created_by_user_id`; both paths now call the existing `assertOwnership` helper (seeded, owner-less quizzes stay shared-editable). +7 tests. |
| `c2b01ae` | **refactor:** wire or remove the six routes nothing consumed. Deleted `/api/audit`, `/api/automation/run`, `/api/micro-lessons`; wired `/api/integrations/health` (admin Providers panel), `/api/vault/blocks` (Vault block palette), `/api/moderation` (new Admin Moderation tab). New invariant test `project/route-wiring.test.ts` keeps the consumer-less count at 0. 50 → 47 routes. +3 tests. |
| `d010335` | **refactor:** debloat + optimise. Removed 18 unused exports (15 reported, 3 cascaded). `insertRows()` now forwards an optional `onConflict`; six serial seed loops collapsed to multi-row statements. +6 tests. |
| `feaacf0` | **refactor:** collapse the near-identical `docs`/`sheets`/`slides` route files onto one tested factory (`lib/api/resource-route.ts`; 41 → 9 lines each), with 25 route tests written *first* as the safety net, and the security invariant strengthened to assert the factory itself enforces `requireApiUser`. +27 tests. |

**Verified at `feaacf0`:** `tsc --noEmit` exit 0 · **472/472 tests** (54 files, up from 436 at session start) · route handlers 50 → 47 · consumer-less routes **0** · analyzer `unusedExports 15 → 0`, `orphanFiles 0`.

**Static-analysis false positives ruled out (negative findings):**

- The 10 "unused dependencies" are build/type tooling (`typescript`, `tsx`, `wrangler`, `postcss`, `@tailwindcss/postcss`, `@types/*`) plus `react-dom` and `@tiptap/pm` (runtime/peer) — not dead.
- The 3 "import cycles" are all `i18n/vocabulary.ts` ⇄ `i18n/packs/*.ts`: a type-only (`import type`) back-reference plus a dynamic `import()`. Erased at compile time — harmless.
- 279 `internalOnlyExports` remain (exported, used only within their own module). De-exporting is cosmetic churn with no behavioural payoff; deliberately not swept.

**Deferred decisions (surfaced, not silently deleted):**

1. **The content registry is write-only.** `content_items` / `content_versions` / `shared_access` / `content_attachments` are written by six save paths and read by nothing; `content_search` has zero writers and zero readers. Decision required: **wire one real read path (a Library/Discover view) or stop writing the write-only half.** Not done here — extending a zero-reader subsystem adds surface without a verified outcome.
2. **Parked modules** `learn-route-features.ts`, `cloudflare-cleanup.ts`, `workspace-cleanup.ts`, `content-search.ts`. The first and last are reached only by tests (intent unknown); the middle two are used by `ops/scripts/` cleanup tooling. Kept — their fate is an owner decision, and deleting them deletes passing tests.
3. **`/api/notes/[id]/versions`** stays consumer-less; it is the sole allowlisted entry in the route-wiring test (no UI restores a version yet).
4. **No real end-to-end run.** Every test stubs D1 at the `globalThis.fetch` boundary; `smoke:cloudflare` exists but was not run in this environment. "Tests pass" is not evidence the app runs.

**Not started:** Stage 2 consolidation (duplicate CRUD route triplets), Stage 4 structural refactor (`studio-view.tsx` at 4,041 lines — deliberately deferred behind a verification net), Stage 5 schema cleanup, and handler coverage beyond 7 of 47.
