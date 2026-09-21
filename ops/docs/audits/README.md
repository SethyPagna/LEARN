# LEARN — Audits

Audit outputs for the LEARN app. Each report is reproducible from the revision it
names; re-run after any structural change.

| Date | Report | Skill used | Scope |
| --- | --- | --- | --- |
| 2026-09-21 | [Code Quality & Maintainability Audit](./2026-09-21-code-quality-audit.md) | `code-quality-audit` | Dead code, duplication, complexity, legacy, redundant IO, tech debt — 37 findings, ~2,900 lines removable |
| 2026-09-21 | [Security Audit (20-point)](./2026-09-21-security-audit.md) | `security-*-hardening` (×3) | 12 PASS / 6 PARTIAL / 2 FAIL |
| 2026-09-21 | [AI Council](./2026-09-21-ai-council.md) | `ai-council` | Scope & sequencing decision — 5 advisors + cross-critique + Chairman verdict |

**Revision audited:** `5f06f9e1` (`main`) — cleanup work is on branch `cleanup/stage-1`

## Start here

1. **Read the AI Council report first.** It frames *why* the cleanup matters — the
   root cause is scope *order*, not scope size.
2. **Then the code-quality audit's Cleanup Plan.** Stage 0 is closed (build,
   typecheck and tests are verified). Stages 1 and 3 are executed; Stage 2
   (consolidation), 4 (structural refactor) and 5 (schema) are not.
3. **Then the security audit's Prioritized Remediation Plan.** Three items are
   immediate.

**Status at a glance:** Stage 1 ✅ · Stage 3 ⚠️ partial · Stage 2/4/5 ⬜ not started.
The single biggest remaining blocker is **test coverage**, not tooling — Category 2
and Category 4 refactors should not begin until `app/api` and `lib/data.ts` have
tests.

## Reproducing the static analysis

```bash
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format md
node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format json
```

## Verified baseline

Current state on branch `cleanup/stage-1` (commit `9fd87a4c`):

| Check | Result |
| --- | --- |
| `tsc --noEmit` | ✅ PASS (exit 0) |
| Test suite | ✅ **370/370 pass**, 45 files, ~14s |
| `next build --webpack` | ✅ **Compiled successfully in 14.4min** · TypeScript passed · 77/77 static pages generated · `BUILD_ID` written |
| `pnpm-lock.yaml` | ✅ Repaired — importer block matches `package.json` (44 entries) |

## Known caveats

1. **`next build` completed compile, typecheck and static generation, then aborted in the final "Collecting build traces" step.** `next build` tried to delete a temp file and the sandbox's delete guard refused (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, a 50-deletions-per-turn budget). Nothing about the failure touches application code, and the artefacts Next writes on success are present. Only the post-trace packaging step is unverified.
2. **`node_modules` is still not fully repaired and cannot be here.** A complete `pnpm install` must delete thousands of files; the same guard blocks it, and pnpm also calls the blacklisted `wmic.exe`. The interrupted run left ~1,766 empty package dirs and ~478 `.ignored_*` staging dirs under `node_modules/.pnpm`. Everything on the build path was repaired by hand — notably the `wrangler` peer dependency that `@opennextjs/cloudflare` imports at runtime from `next.config.mjs`. **Run `pnpm install` in a normal terminal first.**
3. **The green test suite still does not cover the riskiest code.** No test file imports `app/api`, `lib/data.ts`, or `workers/`. All 50 route handlers, the DB layer, and the realtime/WebRTC Worker remain untested. Stage 3 added the first real data-layer coverage (`sql-batch.ts`, 12 tests), but `data.ts` itself is still untested. Treat "tests pass" as *not* evidence of safety for those paths.
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

