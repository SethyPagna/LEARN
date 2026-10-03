# Code Quality & Maintainability Audit — LEARN

**Revision audited:** `5f06f9e1` (`main`) — *"feat: real photo/file attachments, conversation export, and call recording"*
**Date:** 2026-09-21
**Auditor:** code-quality-audit skill (senior-engineer maintainability review)
**Scope:** 235 files under `src/` (233 TypeScript/TSX), ~43,900 LOC, 63 declared dependencies, 50 API route handlers, 44 test files

## Baseline Status

| Check | Result | Note |
| --- | --- | --- |
| Working tree | ✅ Recovered | All 305 tracked files had been **deleted from disk**; restored via `git restore` + fast-forward from `472eb66f` → `5f06f9e1` (9 commits, +1746/−430). Clean and intact since; 310 tracked files, 0 missing. |
| `node_modules` | ⚠️ **Partially repaired — see caveat** | Original was a stale partial install (21 packages; contained undeclared `daisyui`, `mammoth`, `pdfjs-dist`, `jszip`; missing `next`/`react`). Rebuilt with `--node-linker=hoisted --ignore-scripts` (the sandbox blocks symlinks, `wmic.exe`, and package renames). The build path works; the full repair needs a real terminal. |
| **Typecheck** | ✅ **PASS** | `tsc --noEmit` → exit 0, zero errors (re-verified after Stage 1 and Stage 3) |
| **Tests** | ✅ **PASS** | **370/370 pass, 0 fail** (45 test files, ~14s). Was 358 before Stage 3 added 12 tests for `sql-batch.ts`. |
| **Build** | ✅ **PASS (compile + typecheck + static gen)** | `next build --webpack`: `✓ Compiled successfully in 14.4min` · `Finished TypeScript in 16.2s` · `✓ Generating static pages (77/77)` · `BUILD_ID`, `routes-manifest.json` and `prerender-manifest.json` all written. See the caveat below. |
| **Lockfile** | ✅ **REPAIRED** | `pnpm-lock.yaml` still listed the 19 dependencies removed in Stage 1, so `pnpm install --frozen-lockfile` would have **failed in CI**. Regenerated; the importer block now matches `package.json` exactly (44 entries, −619 lines). |

> **Build caveat — read this before trusting the tick.** The build reached 100% of compile, typecheck and static generation, then aborted in the final *"Collecting build traces"* step: `next build` tried to `unlink('.next/export-detail.json')` and the sandbox's `node-safe-delete` shim refused with `SAFE_DELETE_BULK_CONFIRM_REQUIRED` (it budgets 50 deletions per turn; a build needs far more). **This is an environment limit, not a defect in the app** — nothing about the failure touches application code. The artefacts Next writes on success are present, including `BUILD_ID`. What is therefore *unverified* is only the post-trace packaging step.
>
> **`node_modules` is still not fully repaired, and cannot be here.** A complete `pnpm install` needs to delete several thousand files during the hoisted-layout conversion; the same 50-deletion-per-turn guard blocks it, and pnpm also calls the blacklisted `wmic.exe`. The interrupted run left ~1,766 empty package directories and ~478 `.ignored_*` staging directories under `node_modules/.pnpm`. Everything on the build path was repaired by hand (notably the `wrangler` peer dependency that `@opennextjs/cloudflare` imports at runtime from `next.config.mjs`), which is what let the build run at all. **Run `pnpm install` in a normal terminal before doing anything else with this checkout** — it will complete the repair and re-sync the lockfile.

> **On the test result.** The suite first reported 356/358 because two *structural guard* tests (`project-structure.test.ts`) correctly rejected the two new directories this audit introduced (`.workbuddy-ai/` and `ops/docs/audits/`). Those were legitimate: `.workbuddy-ai/` is local tooling metadata and now follows the project's own `.agents/` convention in `.gitignore` + `.dockerignore`; `audits` was registered as an allowed docs topic. After that, **358/358 green**. The guard test doing exactly its job is a good sign for the codebase.
>
> It caught a *second* real problem during Stage 3: the sandbox's interrupted install left a stray 0-byte `_tmp_*` file in the repo root, and the guard rejected it. That is the guard doing its job again — worth keeping in mind as a tripwire for sandbox debris rather than an obstacle.

> **What this means for the plan.** Typecheck, tests and the build are all verified, so the risk ratings below rest on a working safety net — with one caveat: the 45 test files concentrate on pure logic (`lib/*-features.ts`), so the **route handlers, data layer, and realtime paths are still thinly covered**. Stage 3 added the first real coverage of the data layer's SQL generation, but `data.ts` itself remains untested. That is why Category 2 and Category 4 remain Careful/Risky. **Stage 0 is now closed** (install caveat aside); Stage 1 and Stage 3 are executed, Stage 2/4/5 are not.

## Executive Summary

- **37 confirmed findings** across the 8 categories; **~2,900 lines** removable or consolidatable.
- **17 unused dependencies** — 16 of the 17 `@radix-ui/*` packages plus `class-variance-authority` are never imported. The project is scaffolded for shadcn/ui (`components.json` aliases `@/components/ui` and `@/hooks`) but **neither directory exists and no shadcn component was ever added**.
- **One 385-line dead schema** (`D1_SCHEMA_SQL`) describes a Postgres database the app does not use, and omits 20+ tables that migrations actually create — actively misleading.
- **8 files (~1,050 lines) are provably unreachable**, including a whole dead feature branch (`LearnRoute`) gated behind an empty array.
- **Three near-identical CRUD route triplets** and a family of 4 copy-pasted draft modules are the largest consolidation wins (~440 lines).
- **One file holds 4,212 lines** and a single component spans 1,346 lines with 36 `useState`/20 `useEffect` and zero `useCallback`.

### Top 10 by payoff

| # | Finding | Category | Impact | Risk |
| --- | --- | --- | --- | --- |
| 1 | 17 unused dependencies (16 Radix + `cva`) | Dead code | −17 deps from install/lockfile | Safe |
| 2 | `D1_SCHEMA_SQL` dead + drifted schema (385 lines) | Dead / legacy | −385 lines, removes a false model | Safe |
| 3 | Dead `LearnRoute` feature branch + gate | Legacy | −180 lines | Safe |
| 4 | 8 unreachable files (`flashcard`, `quiz-complete`, `quiz-progress`, `topic-filter`, `cloudflare-cleanup`, `workspace-cleanup`, `content-search`, `intro-workflow`) | Dead / abandoned | −1,050 lines | Careful |
| 5 | CRUD route triplets (`learning-spaces`/`study-rooms`/`study-battles`) | Duplication | −230 lines | Careful |
| 6 | `getCurrentUserFromToken` double-hashes + writes on every read | Redundant IO | 1 hash + 1 write per API request | Careful |
| 7 | 8 N+1 insert loops in `data.ts` | Redundant IO | rows × RTT per write | Careful |
| 8 | `studio-view.tsx` god-module (4,212 lines) | Complexity | −1,300 lines after split | Risky |
| 9 | `data.ts` (2,565 lines, ~100 exports, 86× `ensureDatabase()`) | Complexity | Domain split | Risky |
| 10 | 4 draft modules with duplicated scaffold (`isRecord` ×7, `escapeHtml` ×5) | Duplication | −90 lines, 1 source of truth | Careful |

---

## Scorecard

| # | Category | Findings | Lines removable | Highest risk |
| --- | --- | --- | --- | --- |
| 1 | Dead code | 8 | ~520 | Safe |
| 2 | Duplicate logic | 12 | ~1,050 | Careful |
| 3 | Unused UI components | 4 | ~416 | Safe |
| 4 | Overly complex implementations | 6 | ~1,300 (restructured) | Risky |
| 5 | Legacy code | 4 | ~770 | Safe–Careful |
| 6 | Redundant queries / API calls | 9 | ~180 | Careful |
| 7 | Abandoned / disconnected files | 3 | ~287 | Safe |
| 8 | Technical debt | 6 | — | — |

---

## Category 1 — Dead Code

### 1.1 Unused dependencies (17) — *highest-value finding*

| Field | Detail |
| --- | --- |
| **Location** | `package.json:27-93` |
| **Evidence** | Import-graph scan across all of `src/` + config + CSS. The **only** Radix import anywhere is `@radix-ui/react-context-menu` (`src/components/learn/views/studio-view.tsx:8`). No file imports `cva`/`class-variance-authority`. |
| **Unused** | `@radix-ui/react-{accordion, collapsible, dialog, dropdown-menu, hover-card, label, popover, progress, scroll-area, select, separator, slider, slot, switch, tabs, tooltip}`, `class-variance-authority` |
| **Why unnecessary** | Leftovers from a shadcn/ui scaffold that was never used. `components.json` declares aliases `@/components/ui` and `@/hooks` — **neither directory exists**, and no shadcn component file was ever added. The dependencies were installed with the scaffold and never removed. |
| **Impact** | −17 dependencies; smaller lockfile, faster installs, smaller supply-chain/attack surface |
| **Risk** | **Safe.** Verified zero static imports. (Radix is never used dynamically.) |
| **Action** | Remove all 17 from `package.json`; run `pnpm install` to refresh the lockfile. Also delete or repoint `components.json`, which describes a component system that does not exist. |

### 1.2 `D1_SCHEMA_SQL` — 385-line dead schema describing the wrong database

| Field | Detail |
| --- | --- |
| **Location** | `src/lib/schema.ts:8-393` |
| **Evidence** | `grep -rn "D1_SCHEMA_SQL" src/ ops/` returns **only its own declaration** (line 8). Zero references. |
| **Why unnecessary** | It is Postgres-flavoured (`::jsonb`, `::int`) while the app runs **D1/SQLite** via `ops/migrations/*.sql`. It defines ~40 tables; the migrations create **57**. It omits `editor_documents`, `sheet_documents`, `slide_decks`, `note_versions`, `workspace_members`, `chat_threads`, `rate_limit_buckets`, `moderation_items`, `learning_spaces`, `study_rooms`, `study_battles`, and more. `src/lib/db.ts` even ships `normalizeD1Sql()` to rewrite `$n`→`?` and strip `::jsonb` at runtime — a shim that exists only to keep this dead dialect alive. |
| **Impact** | −385 lines; removes a *misleading* artifact — the single most dangerous kind of dead code, because a new engineer will read it as the schema of record |
| **Risk** | **Safe** to delete the constant. **Careful** for the `::jsonb` casts in `seedUser`/`logAudit` (`schema.ts:412+`, `:550`) which still execute through the shim — clean those separately. |
| **Action** | Delete `D1_SCHEMA_SQL`. Declare `ops/migrations/` the single source of truth. Replace remaining Postgres casts with SQLite equivalents. |

### 1.3 Unused exports and dead helpers

| Field | Detail |
| --- | --- |
| **Location** | 24 exports with zero external references; 281 internal-only exports |
| **Notable** | `ReviewsView` (`ecosystem-views.tsx:360`) — a **fully implemented view** nothing imports. `getDatabaseDialect` + `exec` (`db.ts:100`, `:188`) — dead DB helpers. `UPLOAD_HELP_TEXT` (`file-security.ts:2`) — dead constant (the sibling `MAX_UPLOAD_BYTES` *is* used). `getEnabledAutomationJobs` (`automation.ts:93`). `LearnRoutePlan` (`learn-route-features.ts`) — see §5.1. 11 unused types in `components/learn/types.ts`. |
| **Why unnecessary** | Unreferenced; `ReviewsView` was superseded by the reviews flow in `secondary-views.tsx` |
| **Impact** | ~120 lines + a confusing exported surface |
| **Risk** | **Safe** for the helpers. `ReviewsView` needs a quick confirm that no route renders it by string. |
| **Action** | Delete dead helpers/constants; delete `ReviewsView` after confirming no dynamic route table references it. Treat the 281 internal-only exports as a *lower-priority* batch — de-exporting them tightens the module boundary but changes nothing at runtime. |

---

## Category 2 — Duplicate Logic

### 2.1 Three near-identical CRUD routes — *largest duplication win*

| Field | Detail |
| --- | --- |
| **Location** | `src/app/api/learning-spaces/route.ts` (53), `study-rooms/route.ts` (52), `study-battles/route.ts` (52) |
| **Evidence** | `diff` after normalising the entity noun shows **only the entity name and the fallback message string differ**. Same GET/POST/PUT/DELETE shape, same `withApiErrorBoundary` wrapper, same `input.id ? "update" : "create"` audit call, same re-`SELECT` + `parseJsonArray` response shape. |
| **Also duplicated in the data layer** | `data.ts:2214-2264` / `:2266-2315` / `:2317-2368` — the same `owner OR admin` visibility clause, the same `INSERT … ON CONFLICT DO UPDATE … updated_at = now()`, the same audit call, three times. |
| **Impact** | ~230 lines → ~80 via two factories: `createOwnerScopedCrudRoute()` in `lib/api.ts` and `createOwnerScopedRepository()` in `data.ts` |
| **Risk** | **Careful** — behaviour must be preserved exactly; these paths have thin test coverage |
| **Action** | Introduce both factories; re-point all three routes. Add a table-driven test covering all three entities before refactoring. |

### 2.2 Duplicated localStorage/draft scaffolding (~90 lines)

| Field | Detail |
| --- | --- |
| **Location** | `chat-drafts.ts`, `social-drafts.ts`, `practice-drafts.ts`, `studio-drafts.ts` (+ `studio-preferences.ts`, `workspace-preferences.ts`) |
| **Evidence** | `isRecord` defined **7×** (`tutor-drafts:135`, `chat-drafts:66`, `practice-drafts:186`, `social-drafts:111`, `studio-drafts:172`, `studio-preferences:140`, `workspace-preferences:150`) — byte-identical. `parseJson` 4×, `readString` 3×, `normalizeChoice` 3×. The `read → parse → normalize → serialize → write → dispatchEvent → summarize` scaffold is near-identical between `practice-drafts:75-151` and `studio-drafts:30-134`. |
| **Impact** | ~90 lines; 7 copies of one predicate collapse to 1 |
| **Risk** | **Careful** — persistence semantics are easy to break subtly |
| **Action** | Create `src/lib/storage-record.ts` exporting `isRecord`, `parseJson`, `readString`, `normalizeChoice` and a generic `createLocalStore<T>({ key, event, normalize, summarize })`. |

### 2.3 Route try/catch boilerplate — 40 occurrences (~120 lines)

| Field | Detail |
| --- | --- |
| **Location** | 40 inner `try { … } catch (error) { return fail(error.message, 500) }` blocks across ~13 route files |
| **Why unnecessary** | Every route is *already* wrapped in `withApiErrorBoundary` (`lib/api.ts:70`), which performs the identical catch. The inner block only supplies a fallback string. |
| **Impact** | ~120 lines removed |
| **Risk** | **Safe** — extend `withApiErrorBoundary(handler, status, fallback)` to accept a fallback message and drop every inner try/catch |
| **Action** | Add the `fallback` parameter; delete the 40 inner blocks. |

### 2.4 Remaining duplication (consolidation targets)

| Duplicate | Copies (evidence) | Lines | Consolidate into |
| --- | --- | --- | --- |
| Empty-state + filter-summary builders | `file-library-features.ts:194-243` ≡ `social-features.ts:1757-1805` | ~50 | `lib/collection-view.ts` |
| View menu components | `SocialMenu` (`ecosystem-views.tsx:1589`) ≡ `ChatMenu` (`productivity-views.tsx:1584`) | ~80 | `views/menu.tsx` |
| Form primitives | `SelectField` ×3 (`secondary-views:1381`, `provider-admin-panel:395`, `ecosystem-views:1546`); `Field` ×2; `NumberField` ×2 | ~50 | `views/form-fields.tsx` |
| Tone→class helpers | `profileSummaryChipClasses` ≡ `providerSummaryChipClasses` ≡ `adminSummaryChipClasses` (byte-identical); 4 more of the pattern | ~35 | `views/tone.ts` |
| `escapeHtml` | **5×** (`ai-view:1026`, `studio-view:349`, `insert-back:185`, `import-gateway:329`, `studio-design:442`); plus 3 tag-strippers | ~20 | `lib/html-text.ts` |
| Page-slice helper | `build*Page` ×5 in `social-features.ts` | ~25 | `paginate<T>()` in `collection-view.ts` |
| Weak-topic severity mapping | `dashboard-features.ts:382` ≡ `progress-features.ts:264` (same 50/75 thresholds) | ~25 | one severity function |
| `uniqueNonEmpty` / `clampPercentage` | `dashboard-features:527,540` ≡ `progress-features:247,259` | ~20 | `lib/collection-utils.ts` |
| `formatDuration` | 3× (`productivity-views:307`, `quiz-view:703`, `combined-workspace-views:1405`) | ~10 | `lib/format.ts` |
| Metric/chip card components | `Metric`, `MiniMetric`, `CompactMetric`, `GameStatusChip`, `SocialSummaryChip` | ~25 | one `<Metric>` |
| `isPlainRecord` vs `isRecord` | 2 names, same predicate, 8 definitions | ~15 | one helper |
| `PracticeGameModeButton` ≡ `PracticePlayStyleButton` | `combined-workspace-views.tsx:1355` / `:1380` | ~20 | one parameterised button |

---

## Category 3 — Unused UI Components

| Component | Location | Lines | Verdict |
| --- | --- | --- | --- |
| `Flashcard` | `components/flashcard.tsx` | 195 | **Definitely unused** — zero importers (whole file orphaned) |
| `QuizComplete` | `components/quiz-complete.tsx` | 108 | **Definitely unused** — zero importers |
| `QuizProgress` | `components/quiz-progress.tsx` | 68 | **Definitely unused** — zero importers |
| `TopicFilter` | `components/topic-filter.tsx` | 45 | **Definitely unused** — zero importers |

**Impact:** −416 lines, 4 files.
**Risk:** **Safe.** Verified by import-graph analysis *and* explicit specifier grep, including tests.
**Action:** Delete all four. All other `components/learn/ui.tsx` primitives (`Panel`, `EmptyState`, `StatusMessage`, `StatusPill`, `ControlButton`) **are** used — leave them.

---

## Category 4 — Overly Complex Implementations

| File | Lines | Hooks | Longest unit | Proposed split |
| --- | --- | --- | --- | --- |
| `views/studio-view.tsx` | **4,212** | 36 `useState`, 20 `useEffect`, 15 `useMemo`, **0 `useCallback`** | `StudioView` **1,346 lines** (431–1777); `StudioCanvas` 511; `StudioProjectBrowser` 331 | `studio/StudioView.tsx` (shell + reducer), `studio/useStudioDraftAutosave.ts`, `studio/StudioCanvas.tsx`, `studio/StudioProjectBrowser.tsx`, `studio/RichTextEditor.tsx`, `studio/inspector/*` |
| `lib/data.ts` | **2,565** | — | ~100 exported functions, `ensureDatabase()` called **86×** | Split by domain: `data/{notes,studio,social,ai,admin,auth}.ts`; move `ensureDatabase()` into the query helper |
| `lib/social-features.ts` | **1,900** | — | ~114 exports (51 builders + 63 types); `buildSocialUnifiedSearchCommand` 100 lines | `social/{chat-commands,lanes,calls,search,actions}.ts` |
| `views/productivity-views.tsx` | 1,685 | 38 `useState`, 18 `useEffect`, 20 `useRef` | `ChatView` **1,267 lines** (317–1584), 73 hooks | Extract `useChatThreads`, `useChatComposer`, `useWebRTCCall`; `ChatThreadList`/`ChatMessageList`/`CallOverlay`; `callReducer` |
| `views/ecosystem-views.tsx` | 1,899 | 45 `useMemo` | `SocialLearningView` 797 lines | Split by surface; prune trivial memoisation |
| `views/workspaces/combined-workspace-views.tsx` | 1,430 | — | `SocialCommandCenter` 495 lines | Split; delete dead `LearnRoute` (§5.1) |

**Risk:** **Risky.** These are the files where recent feature work landed (chat, DMs, WebRTC). Any structural change needs a green suite first.

---

## Category 5 — Legacy Code

### 5.1 Dead `LearnRoute` feature branch (~180 lines) — *provably unreachable*

| Field | Detail |
| --- | --- |
| **Location** | `lib/navigation.ts:46` → `learn-shell.tsx:203` → `combined-workspace-views.tsx:100` (`LearnWorkspaceView`) → `:942` (`LearnRoute`) → `lib/learn-route-features.ts` (85 lines) |
| **Evidence** | `learnWorkspaceViews` is `[] as const`. `learn-shell.tsx:203` gates rendering on `.includes(view)`, so `LearnWorkspaceView` can never render. `LearnRoute` is called only from `LearnWorkspaceView`. `learn-route-features.ts` is imported only by `combined-workspace-views.tsx`. |
| **Why unnecessary** | An entire superseded workspace generation, still compiled and shipped |
| **Impact** | −180 lines across 4 files |
| **Risk** | **Safe** — unreachability is proven by an empty constant, not inference |
| **Action** | Delete `LearnRoute`, `LearnWorkspaceView`, `lib/learn-route-features.ts`, and the `learn-shell.tsx:203` branch + import. |

### 5.2 Superseded intro flow (~575 lines)

`components/intro-workflow.tsx` (524 lines) is the previous generation, reachable only from `/intro-classic`, which is linked solely by a hardcoded anchor in `intro-workflow-emil.tsx:213`. The live `/` route uses `intro-workflow-emil.tsx`. **Action:** retire `intro-classic` + `intro-workflow.tsx`. **Risk:** Careful — confirm no external links point at `/intro-classic`.

### 5.3 Orphaned marketing page (~405 lines)

`components/launch-showcase.tsx` (395) is used only by `app/showcase/page.tsx` (10), which **no navigation references**. **Action:** delete both, or intentionally re-link if the page is wanted. **Risk:** Safe (confirm no inbound links).

### 5.4 Dual content models (schema drift)

`ops/migrations/` carries **two competing content models**: legacy per-type tables (`editor_documents`, `sheet_documents`, `slide_decks`, `note_versions` — migration 0002) and the unified registry (`content_items`, `content_search`, `content_versions` — migration 0006). Studio writes the former; search reads the latter. Overlaps also exist between `learning_spaces` / `study_rooms` / `study_battles` / `workspace_groups` and between `review_items` / `practice_session_items`. **Risk:** dual-write divergence. **Action:** pick `content_items` as canonical with a `kind` discriminator; collapse the three social containers into one `learning_spaces` with a `type` column. This is a migration project, not a cleanup.

---

## Category 6 — Redundant Queries / API Calls

| # | Pattern | Location | Cost | Fix |
| --- | --- | --- | --- | --- |
| 6.1 | ✅ **FIXED** (Stage 3) — was: **Double token hash + write-on-read** | `data.ts:194` and `:198` both called `hashSessionToken(value)`; `:198` issued `UPDATE user_sessions SET last_seen_at` | Every authenticated request cost **2 SHA-256 + 1 SELECT + 1 UPDATE**. `requireApiUser` calls this on **every** API route. | Done: hash once, and only write when `last_seen_at` is >5 min stale. **Also discovered `last_seen_at` is never read anywhere** — the write can be deleted outright if no "active sessions" view is planned. |
| 6.2 | ⚠️ **3 of 11 done** (Stage 3) — **N+1 insert loops** | `practice_session_items` (`:1303`), `quiz_questions` (`:1368`), `quiz_attempt_answers` (`:1481`) converted. Remaining: `knowledge_nodes` (`:1760`), `knowledge_edges` (`:1760`), `review_items` (`:1800`, `:1964`), `micro_lessons` (`:1870`), `feed_rank_cache` (`:2120`), `achievements` (`:2245`) | Serial `await` in a `for` → latency = rows × RTT, and D1 runs a database's queries **one at a time**, so these serialise completely | Done via `src/lib/sql-batch.ts` + the `insertRows()` helper. The remaining sites are mechanical: same helper, same pattern. Note D1 caps a query at **100 bound parameters**, so chunking is mandatory, not an optimisation. |
| 6.3 | Unbounded scans | `data.ts:257` (`learning_goals`), `:261` (all `quiz_attempt_answers`) | Grows linearly with usage; re-scanned on every dashboard load | Add `LIMIT` / aggregate in SQL |
| 6.4 | Unbounded list queries | `data.ts:337` notes, `:1290` quizzes, `:1473` provider configs, `:1421` admin users, `:2158` achievements | Whole-table reads, unlike siblings which `LIMIT 80–120` | Paginate consistently |
| 6.5 | Dashboard double-fetch | `learn-shell.tsx:61-70` fetches `/api/dashboard` **and** `/api/notes` | Same `notes` table read twice per page load | Drop `notes` from the dashboard payload, or reuse it |
| 6.6 | Sequential independent queries | `data.ts:1993` + `:2012` | Serial awaits on independent queries | `Promise.all` |
| 6.7 | O(n·m) rescan | `data.ts:2033` — `rows.find()` inside a `map` | Quadratic in feed size | Build a `Map` once |
| 6.8 | ✅ **FIXED** (Stage 3) | `data.ts:480` re-called `getCurrentUserFromToken` although the caller already passed `user` (`api/profile/route.ts:15`) | Extra SELECT + UPDATE + 2 hashes per profile save | Done: the updated user is rebuilt from the values just written |
| 6.9 | Client N+1 + no cache | `GamesView` issues up to 8 `/api/quizzes/{id}` calls (`productivity-views.tsx:94-104`); `quiz-view.tsx:76` refetches on every selection; `useResource` (`ecosystem-views.tsx:1844`) has no cache/dedupe, so `/api/vault/graph` re-runs on view switch | Redundant round-trips | Shared cache/dedupe layer |

**Impact:** 6.1 alone removed 1 hash + 1 write from **every** authenticated request — the highest-leverage performance fix in the report, and the first thing Stage 3 executed.

---

## Category 7 — Abandoned / Disconnected Files

| File | Lines | Importers | Verdict |
| --- | --- | --- | --- |
| `lib/cloudflare-cleanup.ts` | 96 | only `tests/cloudflare/cloudflare-cleanup.test.ts` | **Unused by app and ops scripts** |
| `lib/workspace-cleanup.ts` | 68 | only `tests/project/workspace-cleanup.test.ts` | **Unused** |
| `lib/content-search.ts` | 123 | only `tests/collaboration/content-search.test.ts` | **Unused** — no endpoint consumes `rankContentSearchRows` |

**Impact:** −287 lines + 3 test files.
**Risk:** **Safe**, but these three have tests, so they were *intended* to be wired up. Confirm intent before deleting: either wire them in or remove both module and test. Do not leave the "tested but unreachable" state — it is the most misleading shape of dead code.
**Action:** Decide per module. If unused → delete module + test. If wanted → wire it in.

---

## Category 8 — Technical Debt Reduction

| Item | Why it costs future change | Proposal |
| --- | --- | --- |
| `ensureDatabase()` called 86× in `data.ts` | Every new query must remember the call; couples all features to schema bootstrap | Move into the `query()` helper |
| God-object state (`StudioView` 36 `useState`; `ChatView` 38) | Illegal state combinations are representable; effects exist only to sync derived state | `useReducer` state machines with explicit events |
| Autosave failures are silent | `studio-view.tsx` `saveActive()` had no `catch` at all, so the manual Save button produced an unhandled promise rejection; the notes autosave wrapped it in `.catch(() => undefined)` and swallowed everything. Because `setLastSaved()` is only reached on success, a failed save left a stale "last saved" timestamp on screen that read as success | **Fixed in Stage 3** — `saveActive()` returns a boolean and reports the failure through the existing status toast; the local draft is deliberately retained. *Correction:* an earlier draft of this audit claimed "8 interleaved effects with `.catch(() => undefined)`". There is exactly **one** such catch. The surrounding autosave machinery (fingerprint dedupe, 650 ms debounce, `pagehide`/`visibilitychange` flush, dirty badges) is genuinely well built and was left alone |
| **358 tests pass, but coverage stops at pure logic** | Verified: **no test file imports `app/api`, `lib/data`, or `workers/`.** All 50 route handlers, the entire DB layer, and the realtime/WebRTC Worker are untested — which is exactly why §2.1 and Category 4 are "Careful/Risky". A green suite that cannot fail on the code you just changed is a false signal | Add route + data-layer tests **before** refactoring; prioritise the auth/session path and the three CRUD entities |
| `lib/data.ts` is a single 2,565-line barrel | Cannot tree-shake; any edit risks unrelated features; tests must import the whole surface | Domain split |
| `components.json` describes a component system that does not exist | Misleads anyone scaffolding UI | Delete or repoint to the real component locations |

---

## Negative Findings (verified as load-bearing — do not delete)

These looked like dead code and are **not**. Recorded so nobody re-litigates them.

| Artifact | Why it looked dead | Why it is actually used |
| --- | --- | --- |
| `src/workers/app.ts` | Nothing under `src/` imports it | Cloudflare Worker entry point — `"main": "../../src/workers/app.ts"` in `ops/cloudflare/wrangler*.jsonc` |
| `lib/i18n/packs/{asian,latin,rtl}.ts` | No static import | Loaded via `import()` in `lib/i18n/vocabulary.ts:128-130` |
| `lib/quiz-data.ts` (379 lines) | No UI imports it | Seed fixtures — used by `schema.ts:2,501` |
| `lib/navigation-features.ts`, `lib/design-system.ts`, `lib/feed-cache.ts`, `lib/learn-route-features.ts`'s siblings | Parallel naming suggests redundancy | All wired in (`app-nav.tsx:38`, 6 view files, `data.ts:6`) — except `learn-route-features.ts`, which *is* dead via §5.1 |
| `navigation.ts` vs `navigation-features.ts`; `studio-navigation.ts` vs `learn-workspace-navigation.ts` | Suspiciously parallel names | Genuinely different domains — **not** duplicates |
| `@tiptap/pm` | Not imported directly | Required peer of the Tiptap packages |
| `postcss`, `tailwindcss`, `tw-animate-css`, `typescript`, `tsx`, `wrangler`, `@types/*` | Not imported from `src/` | Used by config files, CSS `@import`, and the build toolchain |
| `pptxgenjs` | Only appears as a `typeof import()` type | Used for Studio PPT export |
| All `components/learn/ui.tsx` primitives | — | Every one has call sites |
| All 10 `views/*` files | — | Every one is routed via `learn-shell.tsx` |

---

## Cleanup Plan

### Stage 0 — Restore a verifiable baseline *(prerequisite — nothing else may start)*
- **Change:** Fix `node_modules` (fresh `pnpm install --frozen-lockfile` in an environment that permits symlinks, or `--node-linker=hoisted` outside the sandbox). Run `pnpm lint && pnpm test && pnpm build` and **record the output**.
- **Proof:** Green typecheck, tests, build at `5f06f9e1`.
- **Why first:** Every risk rating below assumes a working test suite. Without it, "Safe" is a guess.

### Stage 1 — Zero-risk mechanical removal ✅ **EXECUTED**

**Branch:** `cleanup/stage-1` · **Commits:** `c402d6c` (audits) → `7e951fb` (cleanup) · `main` untouched at `5f06f9e1`

- **Change:** 16 unused `@radix-ui/*` packages; `class-variance-authority`, `clsx`, `tailwind-merge`; `components.json`; `D1_SCHEMA_SQL`; the 4 orphan components; `ReviewsView` + `reviewRatingClassName`; the dead `LearnRoute` branch (§5.1); `src/lib/utils.ts`; and the dead helpers (`getDatabaseDialect`, `exec`, `splitSqlStatements`, `UPLOAD_HELP_TEXT`, `getEnabledAutomationJobs`).
- **Actual impact:** **−1,196 lines across 15 files, −19 dependencies (63 → 44)**, 6 files deleted. Tracker went from 314 → 308 files.
- **Verified:** `tsc --noEmit` exit 0 · **358/358 tests pass** · 0 files missing from disk.
- **Analyzer delta:** unused exports 24 → 16, orphan files 4 → 1, unused deps 27 → 10.
- **Two cascades the static analysis alone would have missed, both found by re-running the analyzer after each step:** `src/lib/utils.ts` (`cn`) was reachable *only* from the four deleted components; and `MiniMetric` / `PatternCard` / the `Bot` icon were used *only* by `LearnRoute`. **Re-run the analyzer after every deletion stage — dead code is a graph, not a list.**
- **⚠️ Required follow-up:** `pnpm-lock.yaml` still lists the 19 removed packages. `pnpm install --frozen-lockfile` **will fail in CI** until the lockfile is regenerated. Run `pnpm install` (which is required anyway to repair `node_modules`) — that syncs the lockfile automatically. The lockfile could not be regenerated here because the sandbox blocks pnpm's store cleanup.
- **Deliberately NOT deleted:** `src/lib/learn-route-features.ts` + its 2 tests in `learning.test.ts`. The module's only app consumer was the dead `LearnRoute`, so it is now orphaned — but deleting it means deleting passing tests, which is a decision about intent (re-wire vs. remove), not a mechanical cleanup. **Decide this one explicitly.** Same reasoning applies to `cloudflare-cleanup.ts`, `workspace-cleanup.ts`, and `content-search.ts` (Category 7).
- **Rollback:** `git branch -D cleanup/stage-1` (nothing was merged), or `git revert 7e951fb`.

### Stage 2 — Consolidation (behaviour-preserving)
- **Change:** Route factories (§2.1), `withApiErrorBoundary` fallback (§2.3), `storage-record.ts` (§2.2), and the shared UI/form/tone/html helpers (§2.4).
- **Impact:** ~440 lines.
- **Proof:** Existing tests green + new table-driven tests for the three CRUD entities.
- **Rollback:** Per-commit revert.

### Stage 3 — IO and data-layer fixes ⚠️ **PARTIALLY EXECUTED**

**Branch:** `cleanup/stage-1` · **Commit:** `9fd87a4c`

**Done:**

- **§6.1 single hash + throttled write** — `getCurrentUserFromToken` hashed the session token twice (once for the `SELECT`, once for the `last_seen_at` `UPDATE`) and wrote on every call, on a path that 123 `requireApiUser` call sites execute. Now hashes once and only refreshes `last_seen_at` when it is more than 5 minutes stale.
  - **New finding while fixing it:** `last_seen_at` is written on every authenticated request and **read nowhere in the entire codebase** — a pure write-only column. The throttle keeps the column meaningful for a future "active sessions" view while removing the cost. If nothing consumes it, deleting the write outright is the stronger fix; that is a product decision, not a cleanup.
  - **Latent bug fixed:** `datetime('now')` produces `"YYYY-MM-DD HH:MM:SS"`, which `Date.parse` interprets as **local** time. Any staleness comparison against it would have been skewed by the host's UTC offset (8 hours here) — the throttle would have been wrong in one direction or the other. Now normalised to explicit UTC before parsing.
- **§6.8 redundant re-query** — `updateProfile` re-read the whole session (`cookies()` + hash + `SELECT` + possible `UPDATE`) to return a user object it could build from the values it had just written. Now rebuilt in place.
- **§6.2 N+1 inserts (3 of 11 sites)** — new `src/lib/sql-batch.ts` builds multi-row `INSERT`s chunked to **D1's documented ceiling of 100 bound parameters per query**. Converted `quiz_questions`, `quiz_attempt_answers`, `practice_session_items`. A 20-question quiz drops from 20 sequential round trips to 2; an attempt submission from 20 to 4. This matters more than the raw count suggests because **D1 serves a single database strictly one query at a time**, so every one of those awaits was fully serialised.
  - Covered by 12 new unit tests, including a round-trip through `normalizeD1Sql` — the real risk is placeholder/value drift, since `normalizeD1Sql` reorders values by the `$n` index it rewrites.
- **§8 silent autosave failures** — see the corrected entry in Category 8.

**Not done:** the remaining 8 N+1 sites (`knowledge_nodes`, `knowledge_edges`, `review_items` ×2, `micro_lessons`, `feed_rank_cache`, `achievements`, plus the `knowledge_edges` second pass), §6.3–6.7, §6.9. `insertRows()` now exists, so each remaining site is a small mechanical change — but they are seed/aggregate paths rather than user-facing hot paths, so they are lower priority than Stage 4.

**Verified:** `tsc --noEmit` exit 0 · **370/370 tests pass** (358 before + 12 new) · `next build` compiled, typechecked and generated 77/77 static pages.

### Stage 4 — Structural refactor *(highest value, highest risk)*
- **Change:** Split `studio-view.tsx`, `data.ts`, `social-features.ts`, `ChatView`; introduce reducers.
- **Proof:** Green suite **plus** new tests written in Stage 0/2 covering the extracted paths.
- **Rollback:** Do it file-by-file, each behind its own commit.

### Stage 5 — Schema consolidation *(separate project)*
- **Change:** Unify `content_items` vs per-type tables; collapse social containers.
- **Proof:** Migration applied to a D1 replica, dual-read verification.
- **Rollback:** Migration down-script.

---

## Method & Confidence

- **Analyzer:** `code-quality-audit/scripts/deadcode.mjs` — import-graph based (resolves real specifiers, handles dynamic `import()`, `require()`, `export … from`, `@/` aliases), plus repo-wide bare-specifier scanning including config files and CSS. Run at `5f06f9e1`.
- **Semantic analysis:** three parallel specialist passes (duplication, complexity/legacy, IO/unused-UI/abandoned), each required to cite file:line and to report negative findings.
- **False positives ruled out:** dynamic imports, framework entry points (`page`/`layout`/`route`/worker `main`), config-referenced files, test-only usage, peer dependencies, CSS `@import`.
- **Confidence:** Category 1/3/7 **high** (mechanically verified). Category 2 **high** (diff-verified for §2.1; structural for the rest). Category 6 **high** for 6.1–6.8, **medium** for 6.9. Category 4/5 **high** on measurement, **medium** on the optimal decomposition.
- **Known limitation:** no green build could be established when this audit was written, so all risk ratings were *static* assessments. That has since changed — see **Baseline Status**, where the build, typecheck and test results are recorded as verified. The residual risk is now concentrated in test *coverage*, not in tooling: `app/api`, `lib/data.ts` and `workers/` remain untested, so Category 2/4 refactors still need tests written first.
- **One correction to the original text.** The claim in Category 8 that `studio-view.tsx` had "8 interleaved effects with `.catch(() => undefined)`" was wrong — there is exactly one such catch, and the surrounding autosave machinery is sound. The *conclusion* (autosave failures were invisible) was right for a different reason: `saveActive()` had no `catch` at all. Corrected in place. This is a reminder that the semantic-analysis passes in this audit are the least mechanically verified part of it.
