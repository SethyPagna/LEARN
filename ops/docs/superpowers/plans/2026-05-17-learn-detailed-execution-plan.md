# LEARN Detailed Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the 20-phase roadmap into a practical, file-aware execution plan that can be used across many sessions to improve LEARN page by page, function by function, and system by system.

**Architecture:** Keep the current Cloudflare-first Next.js application intact while improving it in layered waves: product map, core UX, Studio, AI/practice, social/realtime, security/performance, and release operations. Each task should create tests or browser evidence before claiming completion.

**Tech Stack:** Next.js App Router, React, TypeScript, Cloudflare Workers, D1, R2, Durable Objects, Tiptap, Univer, PptxGenJS, Radix UI, TanStack Virtual, dnd-kit, React Resizable Panels, date-fns, optional Yjs/Automerge, optional Rust/WASM only for measured hot paths.

---

## Execution Model

### Required loop for every phase

- [ ] Run `git status --short --branch` and confirm work starts on `main`.
- [ ] Read the files listed for the current phase before editing.
- [ ] Write or update focused tests for the helper logic first.
- [ ] Implement a narrow vertical slice.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm test`.
- [ ] Run `corepack pnpm build`.
- [ ] Browser-test desktop and mobile when UI changes.
- [ ] Commit changed files in small descriptive commits.
- [ ] Push `main`.
- [ ] Confirm GitHub CI and Cloudflare deploy pass.
- [ ] Smoke-test the live Worker when runtime/UI changes.
- [ ] Update plan status notes.

### Suggested execution waves

- **Wave A: Foundation clarity:** Phases 1-4.
- **Wave B: Studio maturity:** Phases 5-9.
- **Wave C: AI, import, and practice loops:** Phases 10-13.
- **Wave D: Planning, files, social, admin:** Phases 14-17.
- **Wave E: Performance, security, release:** Phases 18-20.

## Phase 1: Product Map And Information Architecture

**Primary files:**
- `components/learn/app-nav.tsx`
- `components/learn/learn-shell.tsx`
- `components/learn/types.ts`
- `lib/navigation.ts` if created
- `tests/navigation.test.ts`
- `docs/roadmap/productivity-suite-plan.md`

**Detailed targets:**
- [ ] Create a canonical route-to-section map.
- [ ] Decide which views are primary pages and which are aliases.
- [ ] Remove duplicate visible navigation entries while preserving routes.
- [ ] Make search/jump route names non-technical and consistent.
- [ ] Add sidebar badges only for meaningful status: drafts, due reviews, unread messages, admin issues.

**Implementation tasks:**
- [ ] Add `lib/navigation.ts` with `navigationGroups`, `viewAliases`, and `resolveNavigationTarget(view)`.
- [ ] Add tests that assert `/notes`, `/docs`, `/sheets`, `/slides` resolve to Studio with a matching tab.
- [ ] Update `app-nav.tsx` to render grouped navigation from the canonical map.
- [ ] Update `learn-shell.tsx` so aliases route to the correct grouped view without duplicating page logic.
- [ ] Browser-test desktop long-scroll pages to confirm sidebar stays fixed.

**Acceptance gate:**
- A non-technical user sees fewer than 9 primary sidebar destinations, with nested/secondary destinations available through grouped menus.

## Phase 2: Auth, Signup, Invitations, And Onboarding

**Primary files:**
- `components/login-surface.tsx`
- `app/api/auth/login/route.ts`
- `app/api/auth/logout/route.ts`
- `app/api/auth/session/route.ts`
- `app/api/auth/signup-request/route.ts`
- `app/api/invites/route.ts`
- `lib/auth-entry.ts`
- `lib/data.ts`
- `tests/auth.test.ts`
- `tests/auth-entry.test.ts`

**Detailed targets:**
- [ ] Add redirect-back support after users hit protected routes.
- [ ] Add invite acceptance flow with a token, email confirmation, and password setup.
- [ ] Add forgot-password “admin reset required” flow until email is implemented.
- [ ] Connect request-access records to an Admin panel section.
- [ ] Add onboarding preferences after first login.

**Implementation tasks:**
- [ ] Extend auth tests for redirect params, empty credentials, rate limiting, and protected page redirects.
- [ ] Add an invite acceptance route: `app/invite/[token]/page.tsx`.
- [ ] Add an invite acceptance API: `app/api/invites/accept/route.ts`.
- [ ] Add `lib/invites.ts` for token hashing, expiry validation, and invite status transitions.
- [ ] Add browser tests for login, request access, invite accept, logout, and session expiry display.

**Acceptance gate:**
- Users can sign in, request access, accept an invite, set a password, and land in a first-run setup flow.

## Phase 3: Dashboard Command Center

**Primary files:**
- `components/learn/views/dashboard-view.tsx`
- `lib/dashboard-features.ts`
- `lib/learning.ts`
- `lib/learning-ecosystem.ts`
- `app/api/dashboard/route.ts`
- `tests/dashboard-features.test.ts`
- `tests/learning.test.ts`

**Detailed targets:**
- [ ] Dashboard becomes the daily command center, not a wall of sections.
- [ ] Add Today Route with one primary action and two backup actions.
- [ ] Make Progress a dashboard panel, not a duplicate primary destination unless opened from detail.
- [ ] Add empty states for no notes, no quizzes, no reviews, and no calendar events.
- [ ] Add compact cards for recents and next actions.

**Implementation tasks:**
- [ ] Add tests for `buildDashboardCommandPlan` covering new user, active learner, weak topic, and overdue review states.
- [ ] Add `DashboardActionCard`, `MetricTile`, and `RecentWorkList` subcomponents.
- [ ] Replace long explanatory copy with info hover buttons and short captions.
- [ ] Browser-test dashboard in dark/light/high-contrast and mobile.

**Acceptance gate:**
- Dashboard answers: “What should I do next?” within the first viewport.

## Phase 4: Design System And Theme Maturity

**Progress note (2026-05-18):** Phase 4 has started with tested shared tone/control helpers in `lib/design-system.ts`, reusable `StatusPill` and `ControlButton` primitives in `components/learn/ui.tsx`, Dashboard status/metric tone logic wired to the shared helpers, AI Tutor status/menu/gateway/result controls moved off one-off color helpers, Practice timer/submit/retry/review controls moved onto the same primitives, Calendar duration/month/filter/action controls now using the shared primitives, Progress/Settings/Admin header chips plus Settings save/language/suggestion controls moved onto shared primitives, and Admin overview, provider/key, access-request, tab, invite, and plan chips/buttons now use the shared design-system primitives.

**Primary files:**
- `app/globals.css`
- `components/learn/ui.tsx`
- `components/theme-provider.tsx`
- `components/learn/preferences.tsx`
- `components/learn/views/secondary-views.tsx`
- `tests/settings-features.test.ts`

**Detailed targets:**
- [ ] Normalize surfaces, muted text, active states, destructive states, focus rings, menu contrast, editor chrome, and disabled states.
- [ ] Make all selects and menus readable in dark/light/high-contrast.
- [ ] Add reduced-motion and dyslexia-friendly typography toggles to all relevant surfaces.
- [ ] Eliminate accidental one-off colors inside views.

**Implementation tasks:**
- [ ] Add a token audit section in `docs/roadmap/productivity-suite-plan.md`.
- [ ] Create or extend shared UI primitives for icon button, menu button, status chip, empty state, toolbar group.
- [ ] Replace one-off button styles in major views with shared primitives.
- [ ] Browser-test `/dashboard`, `/studio`, `/ai`, `/practice`, `/calendar`, `/settings`.

**Acceptance gate:**
- No page has light-on-light, dark-on-dark, clipped, or overlapping controls in common modes.

## Phase 5: Studio Workspace Architecture

**Primary files:**
- `components/learn/views/studio-view.tsx`
- `lib/studio-drafts.ts`
- `lib/studio-features.ts`
- `tests/studio-layout.test.ts`
- `tests/studio-drafts.test.ts` if created

**Detailed targets:**
- [ ] Split large Studio implementation into focused modules.
- [ ] Keep pane layout persistent and understandable.
- [ ] Move noisy status like “Draft saved locally” to non-shifting surfaces.
- [ ] Make all pane actions functional.

**Implementation tasks:**
- [ ] Create `components/learn/studio/studio-shell.tsx`.
- [ ] Create `components/learn/studio/studio-command-bar.tsx`.
- [ ] Create `components/learn/studio/studio-explorer.tsx`.
- [ ] Create `components/learn/studio/studio-pane.tsx`.
- [ ] Create `components/learn/studio/studio-inspector.tsx`.
- [ ] Move existing logic gradually, with no behavior regression.
- [ ] Add tests for split, close, close others, pin, rename, duplicate, reset.

**Acceptance gate:**
- Studio opens multiple items side by side, saves/restores layout, and never shifts the editor because of autosave feedback.

## Phase 6: Studio Explorer, Folders, Trash, And Templates

**Primary files:**
- `components/learn/studio/studio-explorer.tsx`
- `lib/studio-features.ts`
- `lib/data.ts`
- `app/api/notes/route.ts`
- `app/api/docs/route.ts`
- `app/api/sheets/route.ts`
- `app/api/slides/route.ts`
- `migrations/0006_studio_collections.sql` if schema is needed

**Detailed targets:**
- [ ] Add folder/collection support.
- [ ] Add real trash/restore/delete forever where safe.
- [ ] Add template picker and template metadata.
- [ ] Add drag-to-folder when dnd-kit can support it without making UI messy.

**Implementation tasks:**
- [ ] Add `studio_collections` and `studio_collection_items` migration if folders need persistence.
- [ ] Add `lib/studio-collections.ts` helper tests.
- [ ] Add shared archive/restore/delete API behavior for docs/sheets/slides/notes.
- [ ] Add template catalog in `lib/studio-templates.ts`.
- [ ] Browser-test file explorer list/board/gallery, context menu, and mobile actions.

**Acceptance gate:**
- Users can organize, archive, restore, duplicate, and create from templates without knowing the underlying record type.

## Phase 7: Notes And Docs Rich Editor

**Primary files:**
- `components/learn/studio/rich-text-editor.tsx`
- `components/learn/studio/rich-text-toolbar.tsx`
- `lib/document-helpers.ts`
- `lib/studio-design.ts`
- `tests/document-helpers.test.ts`
- `tests/studio-design.test.ts`

**Detailed targets:**
- [ ] Implement Word-like style dropdown and saved heading styles.
- [ ] Add font family, font size, alignment, line spacing, indentation, text color, highlight, links, images, tables, callouts, code, quote, equation placeholder.
- [ ] Add slash command / insert menu.
- [ ] Add find/replace, outline, history, comments, and AI actions.

**Implementation tasks:**
- [ ] Add tests for plaintext-to-Tiptap and Tiptap-to-markdown/html export.
- [ ] Add style preset helper: `applyTextStylePreset(editor, preset)`.
- [ ] Add toolbar groups: Style, Text, Paragraph, Insert, Review, Export.
- [ ] Add context menu actions for selected block/text.
- [ ] Browser-test bold, underline, heading save/apply, table insert, image placeholder, undo/redo, save, export.

**Acceptance gate:**
- Notes and docs have credible rich editing, not plain text with decorative buttons.

## Phase 8: Sheets And Data Tools

**Primary files:**
- `components/learn/studio/sheet-editor.tsx`
- `components/learn/studio/sheet-fallback-grid.tsx`
- `lib/sheet-helpers.ts`
- `tests/sheet-helpers.test.ts`

**Detailed targets:**
- [ ] Make Univer the primary client-side sheet if stable.
- [ ] Keep fallback grid for tests and low-power browsers.
- [ ] Add row/column/range/context actions.
- [ ] Add formatting metadata and CSV round-trip.

**Implementation tasks:**
- [ ] Add tests for insert/delete/move rows and columns.
- [ ] Add tests for selected range copy/paste/fill/sort/filter metadata.
- [ ] Add sheet toolbar menus: Data, Format, Insert, Review, Export.
- [ ] Browser-test edit cells, paste CSV, export CSV, freeze first row, delete row/column.

**Acceptance gate:**
- Sheets can support real study trackers and lightweight analysis, not only display a table.

## Phase 9: Slides, Presentations, And Visual Design Tools

**Primary files:**
- `components/learn/studio/slide-editor.tsx`
- `components/learn/studio/slide-canvas.tsx`
- `lib/slide-design.ts`
- `lib/slide-export.ts`
- `tests/slide-design.test.ts`

**Detailed targets:**
- [ ] Add slide object model: text, image, shape, table, code, diagram, quiz card.
- [ ] Add canvas with thumbnail rail, object selection, properties, notes, zoom.
- [ ] Add design tools: themes, layouts, backgrounds, alignment, arrange, group.
- [ ] Add transitions/animations and presenter preview.

**Implementation tasks:**
- [ ] Test object add/update/delete/reorder and PPTX payload mapping.
- [ ] Add slide toolbar groups: Home, Insert, Design, Motion, Present, Export.
- [ ] Add slide context menus for thumbnails and canvas objects.
- [ ] Browser-test create deck, add slide, edit title/body, add shape, reorder, notes, export.

**Acceptance gate:**
- Slides feel like a small real deck editor and export useful `.pptx`.

## Phase 10: AI Tutor And Provider Gateway

**Primary files:**
- `components/learn/views/ai-view.tsx`
- `lib/ai/prompt-library.ts`
- `lib/ai/guided-prompts.ts`
- `lib/ai/insert-back.ts`
- `lib/ai/provider-admin.ts`
- `tests/ai.test.ts`

**Detailed targets:**
- [ ] Improve compact prompt builder.
- [ ] Make every filter affect prompt summary/readiness.
- [ ] Add provider family routing visibility.
- [ ] Make insert-back actions safe and compatible with selected target.

**Implementation tasks:**
- [ ] Add tests for every task mode and missing required fields.
- [ ] Add prompt preview: intent, requirements, output contract, insertion.
- [ ] Add result preview for docs/sheets/slides/quizzes/flashcards before insertion.
- [ ] Browser-test task menu, filters menu, gateway menu, preview, run, copy, save, insert.

**Acceptance gate:**
- AI Tutor guides users toward better prompts and prevents incompatible output insertion.

## Phase 11: Import Gateway

**Primary files:**
- `app/api/import/route.ts`
- `lib/import-gateway.ts`
- `components/learn/views/ai-view.tsx`
- `components/learn/studio/import-preview.tsx`
- `tests/import-gateway.test.ts`

**Detailed targets:**
- [ ] Detect text, note, doc, sheet, slide outline, quiz, flashcards, transcript, syllabus, reading list.
- [ ] Preview structured output before creation.
- [ ] Add post-import actions: open Studio, generate quiz, generate flashcards, save as AI note.

**Implementation tasks:**
- [ ] Add tests for each import type and confidence label.
- [ ] Add stricter empty/too-short validation.
- [ ] Add structured preview components.
- [ ] Browser-test paste CSV, paste slide outline, paste notes, import, route to Studio.

**Acceptance gate:**
- Users can paste raw learning material and understand exactly what will be created.

## Phase 12: Practice, Quizzes, And Games

**Primary files:**
- `components/learn/views/quiz-view.tsx`
- `components/learn/views/productivity-views.tsx`
- `lib/practice-features.ts`
- `lib/quiz-data.ts`
- `app/api/quizzes/route.ts`
- `app/api/quizzes/attempts/route.ts`
- `tests/practice-features.test.ts`

**Detailed targets:**
- [ ] Combine quizzes/games into one Practice page with tabs or mode cards.
- [ ] Add duration controls, pause/resume/restart, attempt summaries.
- [ ] Add retry missed, save mistakes to reviews, explain mistakes with AI.
- [ ] Add generated-from-Studio practice flow.

**Implementation tasks:**
- [ ] Add tests for duration, retry missed, scoring, explanations, review card conversion.
- [ ] Add Practice command bar: Mode, Source, Timer, Review, More.
- [ ] Browser-test quiz, flashcards, matching, sprint, mistake retry, mobile.

**Acceptance gate:**
- Practice creates a learning loop, not a one-off quiz.

## Phase 13: Reviews, FSRS, Streaks, XP, And Mastery

**Primary files:**
- `lib/learning-ecosystem.ts`
- `lib/reviews.ts` if created
- `components/learn/views/workspaces/combined-workspace-views.tsx`
- `app/api/reviews/route.ts`
- `tests/learning-ecosystem.test.ts`

**Detailed targets:**
- [ ] Decide whether to install `ts-fsrs` or keep current scheduler.
- [ ] Schedule any reviewable block, not only flashcards.
- [ ] Add review caps, rest days, streak freezes, XP, and mastery states.

**Implementation tasks:**
- [ ] Add tests for review scheduling, caps, rest day, streak freeze, mastery decay.
- [ ] Add review card creation from quiz misses and AI-generated flashcards.
- [ ] Browser-test reveal/grade loop, empty rest day, save missed question to reviews.

**Acceptance gate:**
- Review behavior is explainable, capped, and connected to Studio/Practice.

## Phase 14: Calendar, Time, And Study Planning

**Primary files:**
- `components/learn/views/secondary-views.tsx`
- `lib/calendar-features.ts`
- `app/api/calendar/route.ts`
- `tests/calendar-features.test.ts`

**Detailed targets:**
- [ ] Month, week, day, agenda views.
- [ ] Create/edit/delete/complete/duplicate/reschedule events.
- [ ] Timezone-aware labels and recurring review suggestions.
- [ ] Dashboard integration for upcoming focus blocks.

**Implementation tasks:**
- [ ] Add tests for event CRUD helpers and timezone labels.
- [ ] Split calendar UI into month grid, day timeline, event editor, agenda list.
- [ ] Browser-test event creation, edit, delete, mobile timeline.

**Acceptance gate:**
- Calendar behaves like a real planner, not just a static agenda.

## Phase 15: Files, Media, Safety, And R2 Storage

**Primary files:**
- `components/learn/views/files-view.tsx`
- `lib/upload-validation.ts`
- `lib/storage.ts`
- `app/api/files/route.ts`
- `app/api/files/[id]/download/route.ts`
- `tests/upload-validation.test.ts`

**Detailed targets:**
- [ ] Better file library with previews, rename, delete, folders/tags, type filters.
- [ ] Preserve image/video upload and preview.
- [ ] Harden validation while avoiding false positives for legitimate media.

**Implementation tasks:**
- [ ] Add tests for executable signatures, spoofed MIME types, oversized files, media allowlist.
- [ ] Add file action menus and preview drawer.
- [ ] Browser-test upload, preview, download, delete, mobile file cards.

**Acceptance gate:**
- Files feel useful and safer, with no breakage to image/video workflows.

## Phase 16: Social, Spaces, Chat, Rooms, And Battles

**Primary files:**
- `components/learn/views/ecosystem-views.tsx`
- `components/learn/views/productivity-views.tsx`
- `app/api/learning-spaces/route.ts`
- `app/api/chat/route.ts`
- `app/api/study-rooms/route.ts`
- `app/api/study-battles/route.ts`
- `workers/realtime.ts` or current realtime worker files
- `ops/cloudflare/wrangler.jsonc`
- `tests/social-features.test.ts`

**Detailed targets:**
- [ ] Social surfaces become grouped and opt-in.
- [ ] Durable Object rooms/battles pass two-client testing.
- [ ] Chat has threads, channels, reactions, saved replies, and moderation flags.

**Implementation tasks:**
- [ ] Add tests for social filters, permissions, room/battle message validation.
- [ ] Add two-client Playwright or script-based realtime smoke test.
- [ ] Browser-test spaces, chat, rooms, battles, reconnect.

**Acceptance gate:**
- Social learning works without crowding private learning.

## Phase 17: Profile, Settings, Admin, And Audit

**Primary files:**
- `components/learn/views/secondary-views.tsx`
- `components/learn/views/provider-admin-panel.tsx`
- `lib/settings-features.ts`
- `lib/admin-features.ts`
- `app/api/profile/route.ts`
- `app/api/preferences/route.ts`
- `app/api/admin/route.ts`
- `app/api/audit/route.ts`
- `tests/settings-features.test.ts`
- `tests/admin-features.test.ts`

**Detailed targets:**
- [ ] Profile editing and privacy controls.
- [ ] Settings persistence for theme/language/accessibility/review/AI defaults.
- [ ] Admin provider CRUD/test with masked secrets.
- [ ] Audit filtering, access request review, and export.

**Implementation tasks:**
- [ ] Add tests for settings normalization, admin filtering, provider masking, audit search.
- [ ] Split Settings/Admin/Profile into smaller components.
- [ ] Browser-test profile save, settings toggle, provider admin, audit filter.

**Acceptance gate:**
- Admin and settings are powerful but not visually overwhelming.

## Phase 18: Performance, Architecture, And Code Health

**Primary files:**
- `next.config.*` if present
- `components/learn/learn-shell.tsx`
- `components/learn/views/*.tsx`
- `lib/*.ts`
- `tests/performance-helpers.test.ts` if created

**Detailed targets:**
- [ ] Dynamic-load heavy surfaces.
- [ ] Split monolithic components.
- [ ] Remove dead code and duplicate helpers.
- [ ] Use Map/Set for hot lookups and combine repeated loops.
- [ ] Evaluate TypeScript vs Rust/WASM only with measurements.

**Implementation tasks:**
- [ ] Run `rg` for duplicate helpers, unused exports, stale routes, and old constants.
- [ ] Add performance helper tests for caching/batching/debouncing boundaries.
- [ ] Use dynamic imports for Studio-heavy libraries if not already isolated.
- [ ] Browser-test route transition speed and first meaningful render.

**Acceptance gate:**
- Login and Dashboard remain fast even as Studio and AI grow.

## Phase 19: Security, Privacy, Reliability, And Abuse Protection

**Primary files:**
- `lib/auth.ts`
- `lib/rate-limit.ts`
- `lib/upload-validation.ts`
- `lib/api.ts`
- `middleware.ts` if created
- `app/api/**/route.ts`
- `tests/security.test.ts` if created

**Detailed targets:**
- [ ] Mutation origin checks.
- [ ] More protected route tests.
- [ ] Durable D1-backed rate limit coverage.
- [ ] Upload hardening and provider secret masking.
- [ ] Documentation for Cloudflare WAF/Turnstile/DDoS controls.

**Implementation tasks:**
- [ ] Add API tests for unauthenticated, unauthorized, rate-limited, invalid-origin requests.
- [ ] Add a shared mutation guard helper where appropriate.
- [ ] Add docs for production security settings.
- [ ] Browser-test protected route redirects and admin-only pages.

**Acceptance gate:**
- Security posture is realistic, documented, and tested.

## Phase 20: Deployment, QA, Observability, And Release Operations

**Primary files:**
- `.github/workflows/*.yml`
- `ops/scripts/deploy/cloudflare.ts`
- `ops/cloudflare/wrangler.jsonc`
- `ops/cloudflare/wrangler.jsonc`
- `app/api/integrations/health/route.ts`
- `docs/operations/change-control.md`

**Detailed targets:**
- [ ] Keep CI and Cloudflare deploy reliable.
- [ ] Add live smoke checklist scripts.
- [ ] Add health and admin observability panels.
- [ ] Record release notes and QA evidence.

**Implementation tasks:**
- [ ] Add a `scripts/smoke-live.mjs` script that checks key routes without secrets.
- [ ] Add health endpoint assertions for D1/R2/AI/realtime modes.
- [ ] Add docs for rollback and QA data cleanup.
- [ ] Run full live smoke after deployments.

**Acceptance gate:**
- Every pushed change has visible CI/deploy status and a repeatable live verification path.

## Cross-Cutting Rewrite And Conversion Strategy

### TypeScript remains primary

- [ ] Keep request/runtime logic in TypeScript because Next.js and Cloudflare Workers are the deployed runtime.
- [ ] Prefer small focused modules over language rewrites when the bottleneck is complexity.
- [ ] Use type-level boundaries for shared contracts: API payloads, Studio item types, AI prompt contracts, import previews, and practice attempts.

### When to consider Rust/WASM

- [ ] Only consider Rust/WASM after profiling proves a hot path is CPU-bound in the browser or Worker.
- [ ] Candidate hot paths: large CSV/XLSX parsing, formula evaluation, graph layout, PDF/text extraction.
- [ ] Do not add Rust/WASM for ordinary CRUD, UI state, or API routing.

### When to avoid new libraries

- [ ] Avoid adding a library if a current dependency already solves the job.
- [ ] Avoid editor libraries that duplicate Tiptap unless replacing an entire editor surface.
- [ ] Avoid canvas libraries for slides until DOM-based objects clearly cannot support needed editing.

## Definition Of Done For Any Page

- [ ] Every visible button works, opens a menu, or is disabled with a reason.
- [ ] Create, edit, save, duplicate, archive/delete, restore, export/download work where the page owns records.
- [ ] Loading, empty, error, success, and offline/draft states are visible.
- [ ] Dark, light, high-contrast, reduced-motion, compact, comfortable, and mobile states are readable.
- [ ] API calls use existing helpers and preserve Cloudflare-first storage.
- [ ] Tests cover important helper behavior.
- [ ] Browser QA covers desktop and mobile.
- [ ] Live Worker smoke passes after deploy when runtime behavior changes.

## First Three Recommended Implementation Slices

### Slice 1: Navigation and alias cleanup

- [ ] Implement `lib/navigation.ts`.
- [ ] Add `tests/navigation.test.ts`.
- [ ] Update `app-nav.tsx` and `learn-shell.tsx`.
- [ ] Browser-test sidebar, aliases, mobile navigation.

### Slice 2: Dashboard command center

- [ ] Strengthen `lib/dashboard-features.ts`.
- [ ] Split dashboard UI into focused components.
- [ ] Add empty states and quick action menus.
- [ ] Browser-test Dashboard in theme/accessibility modes.

### Slice 3: Studio action reliability

- [ ] Audit all Studio buttons and context actions.
- [ ] Add missing handlers and confirmations.
- [ ] Add tests for action routing.
- [ ] Browser-test notes/docs/sheets/slides CRUD, export, archive, restore.

## Plan Maintenance

- [ ] At the start of each session, mark the active phase and slice.
- [ ] At the end of each session, add a progress note to `docs/roadmap/productivity-suite-plan.md` or this file.
- [ ] When a phase completes, add date, commit range, test evidence, live URL evidence, and remaining risks.
- [ ] If a phase grows too large, split it into a dedicated plan file under `docs/superpowers/plans/`.

## Self-Review

- **Spec coverage:** This detailed plan expands the 20-phase roadmap with file ownership, implementation tasks, tests, QA, language strategy, library strategy, and page-level done criteria.
- **Placeholder scan:** No phase uses TBD-style placeholders; each phase has concrete files and actions.
- **Type consistency:** Terms match the current repo naming: Studio, Practice, AI Tutor, D1, R2, Durable Objects, Tiptap, Univer, PptxGenJS, Provider Admin, and Cloudflare Worker.
- **Execution readiness:** The first three recommended slices are small enough to start immediately in future sessions.
