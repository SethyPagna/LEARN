# LEARN 20-Phase Product Maturity Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine LEARN into a mature, fast, Cloudflare-first learning workspace with polished auth, dashboard, Studio, AI tutor, practice, files, calendar, social learning, admin, accessibility, security, and deployment flows.

**Architecture:** Keep the current Next.js + React + TypeScript app on Cloudflare Workers as the product shell, with D1 for data, R2 for files/media, Durable Objects for realtime, and encrypted AI provider routing. Add heavier editor, spreadsheet, slide, sync, and visualization tools only behind route/component boundaries so login, dashboard, and navigation stay fast.

**Tech Stack:** Next.js, React, TypeScript, Cloudflare Workers, D1, R2, Durable Objects, Tiptap, Univer, PptxGenJS, Radix UI, TanStack Virtual, dnd-kit, React Resizable Panels, date-fns, optional Yjs/Automerge for collaboration, optional Rust/WASM only for measured hot paths such as formulas/import parsing.

---

## Operating Rules

- Work on `main` unless a named feature branch is useful; merge and push `main` after gates pass.
- Keep commits small and descriptive; commit each file or cohesive generated pair separately.
- Preserve Cloudflare-first runtime. Do not reintroduce Supabase, Postgres, Redis, MinIO, or non-Cloudflare storage.
- Keep all app resources isolated to `learn-*`.
- Run `corepack pnpm lint`, `corepack pnpm test`, and `corepack pnpm build` for every phase.
- Browser-test desktop and mobile for every visible UI phase.
- Update this roadmap or `docs/productivity-suite-plan.md` when a phase starts, changes, or completes.

## Phase 1: Product Map And Information Architecture

**Target:** Make the app easier for non-technical learners by reducing duplicate routes and grouping functions by user intent.

### Sub-phases

- [ ] **1.1 Navigation audit:** Map every route in `app/` to one of: Home, Studio, Practice, AI, Files, Calendar, Social, Settings, Admin.
- [ ] **1.2 Merge duplicate concepts:** Keep dashboard as command center; fold vault/progress/graph summaries into Dashboard and Reviews unless graph needs a dedicated advanced mode.
- [ ] **1.3 Route compatibility:** Preserve `/vault`, `/feed`, `/graph`, `/notes`, `/docs`, `/sheets`, `/slides`, `/quizzes`, and `/games` as stable aliases into grouped pages.
- [ ] **1.4 Sidebar simplification:** Keep sidebar fixed and grouped, with nested groups and dirty badges.
- [ ] **1.5 Acceptance:** A first-time user can explain where to go for creating, practicing, asking AI, uploading, scheduling, and sharing within 30 seconds.

## Phase 2: Auth, Signup, Invitations, And Onboarding

**Target:** Make account entry feel professional, secure, and understandable.

### Sub-phases

- [ ] **2.1 Login completion:** Add forgot-password placeholder flow, session status, better error messages, and redirect-back behavior after protected route access.
- [ ] **2.2 Request access:** Connect access requests to Admin audit and a real invite review panel.
- [ ] **2.3 Invite acceptance:** Add token-based invite acceptance with password creation and role assignment.
- [ ] **2.4 First-run onboarding:** Add a three-step learner setup: goal, preferred workflow, first Studio item.
- [ ] **2.5 Acceptance:** Login, logout, request access, invite review, invite acceptance, and first-run setup work on desktop/mobile.

## Phase 3: Dashboard Command Center

**Target:** Turn Dashboard into the clean daily home, not a duplicate of every section.

### Sub-phases

- [ ] **3.1 Today Route:** Show one prioritized route: review, create, practice, schedule, or repair weak topic.
- [ ] **3.2 Compact metrics:** Use large icon tiles for streak, XP, due reviews, Studio drafts, and calendar focus.
- [ ] **3.3 Recent work:** Show Studio recents, last AI result, last quiz attempt, and file imports.
- [ ] **3.4 Empty states:** Guide new users without long explanations.
- [ ] **3.5 Acceptance:** Dashboard loads fast, has no long text blocks, and every button routes to a real action.

## Phase 4: Design System And Theme Maturity

**Target:** Make dark, light, high-contrast, reduced-motion, compact, comfortable, and dyslexia-friendly modes consistent.

### Sub-phases

- [ ] **4.1 Token audit:** Normalize colors, borders, focus rings, panel backgrounds, and active states in `globals.css` and shared UI components.
- [ ] **4.2 Component states:** Verify buttons, selects, menus, context menus, tabs, inputs, chips, alerts, cards, panels, and toolbars across modes.
- [ ] **4.3 Motion strategy:** Keep motion useful; add reduced-motion fallbacks.
- [ ] **4.4 Typography:** Define UI text, reading text, editor text, captions, and toolbar text separately.
- [ ] **4.5 Acceptance:** No unreadable dark-mode highlights, no light-mode low contrast, no horizontal mobile overflow.

## Phase 5: Studio Workspace Architecture

**Target:** Make Studio feel like a real multi-document workspace without becoming visually noisy.

### Sub-phases

- [ ] **5.1 Module split:** Split Studio into shell, command bar, explorer, panes, rich editor, sheet editor, slide editor, inspector, templates, drafts, export, and context menus.
- [ ] **5.2 Panes:** Support split right/down, close, close others, pin, duplicate, rename pane group, reset layout.
- [ ] **5.3 Drafts:** Persist unsaved drafts per item/pane and show stable dirty badges outside the editing flow.
- [ ] **5.4 Action routing:** Every New, Save, Copy, Duplicate, Archive, Restore, Export, Download, Split, and AI action must have a handler.
- [ ] **5.5 Acceptance:** Reloading Studio restores layout and drafts without pushing editor content around.

## Phase 6: Studio Explorer, Folders, Trash, And Templates

**Target:** Make records manageable like a clean Drive/Office library.

### Sub-phases

- [ ] **6.1 Explorer views:** Finish list, board, gallery, recent, favorites, archived, and search modes.
- [ ] **6.2 Folders:** Add folders/tags or collections using additive D1 tables.
- [ ] **6.3 Trash:** Add restore, delete forever, empty trash, and confirmation states.
- [ ] **6.4 Templates:** Add template gallery for notes, docs, sheets, slides, study plans, quizzes, and imports.
- [ ] **6.5 Acceptance:** Users can create, find, organize, archive, restore, and duplicate any Studio item.

## Phase 7: Notes And Docs Rich Editor

**Target:** Bring notes/docs closer to Word/Google Docs while staying learning-first.

### Sub-phases

- [ ] **7.1 Tiptap completion:** Add or verify headings, saved heading styles, font, size, bold, italic, underline, strike, code, quote, lists, tasks, alignment, indentation, line spacing, links, images, tables, callouts, emoji/stickers, and character count.
- [ ] **7.2 Style system:** Allow update/apply heading styles like Word: Heading 1, Heading 2, body, quote, code, callout.
- [ ] **7.3 Insert tools:** Add slash menu, insert block menu, image/media embeds, table insert, equation placeholder, quiz block, flashcard block.
- [ ] **7.4 Review tools:** Add find/replace, comments, version history, outline, reading stats, and AI suggestions.
- [ ] **7.5 Acceptance:** A learner can write, format, revise, export, and generate practice from a note/doc.

## Phase 8: Sheets And Data Tools

**Target:** Make Sheets useful for study trackers, vocabulary lists, grade logs, and lightweight analysis.

### Sub-phases

- [ ] **8.1 Univer primary surface:** Use Univer for rich sheets where browser support is good, with existing fallback grid for tests/low-power browsers.
- [ ] **8.2 Core operations:** Row/column insert, delete, move, resize, fill down/right, copy/paste, clear, freeze, sort, filter, and selected range actions.
- [ ] **8.3 Formatting:** Cell colors, text style, alignment, number formats, borders, conditional formatting presets.
- [ ] **8.4 Formulas/imports:** SUM, AVG, COUNT, MIN, MAX, IF-lite, CSV import/export, AI table cleanup.
- [ ] **8.5 Acceptance:** Sheet edits persist, CSV round trips, and context menus expose common spreadsheet actions.

## Phase 9: Slides, Presentations, And Visual Design Tools

**Target:** Make Slides feel like a credible lightweight PowerPoint/Canva-style learning deck editor.

### Sub-phases

- [ ] **9.1 Canvas editor:** Thumbnail rail, main canvas, zoom, rulers/guides, object selection, object properties, speaker notes.
- [ ] **9.2 Objects:** Text boxes, images, shapes, lines, tables, badges, code snippets, diagrams, and quiz cards.
- [ ] **9.3 Design tools:** Themes, layouts, backgrounds, gradients, image frames, alignment, distribute, arrange, group/ungroup.
- [ ] **9.4 Motion:** Slide transitions, object entrance/exit animations, presenter preview.
- [ ] **9.5 Acceptance:** Users can create a deck, design slides, reorder, preview, export JSON/text/PPTX, and reopen reliably.

## Phase 10: AI Tutor And Provider Gateway

**Target:** Make AI feel like a guided command center, not a raw chat box.

### Sub-phases

- [ ] **10.1 Task modes:** Tutor, Rewrite, Quiz, Flashcards, Translate, Study Plan, Import Cleanup, Document Formatter, Sheet Organizer, Slide Builder, Practice Generator, Graph Connector, Explain Mistake.
- [ ] **10.2 Compact filters:** Source, active Studio item, selected text/cells/slides, recent notes, files, weak topics, audience, difficulty, tone, language, length, format, provider family, creativity, token budget.
- [ ] **10.3 Prompt preview:** Show system intent, requirements, output contract, and insert target without exposing secrets.
- [ ] **10.4 Insert-back:** Insert AI output into note block, doc section, sheet rows, slide outline/deck, quiz, flashcards, review cards, or saved AI note.
- [ ] **10.5 Acceptance:** Every filter changes prompt state, readiness is accurate, and provider secrets stay masked.

## Phase 11: Import Gateway

**Target:** Let users paste/upload raw material and turn it into structured Studio and Practice assets.

### Sub-phases

- [ ] **11.1 Detection:** Detect note, doc, sheet, slide outline, quiz, flashcards, transcript, syllabus, and reading list.
- [ ] **11.2 Preview:** Show target, title, confidence, block/row/slide/question count, warnings, and destination.
- [ ] **11.3 Cleanup:** AI cleanup for formatting, summaries, tables, decks, quiz generation, and review cards.
- [ ] **11.4 File parsing:** Add safe PDF/text/CSV/docx/xlsx/pptx extraction paths where deployable on Workers or client-side.
- [ ] **11.5 Acceptance:** Import to Studio, generate Practice, and route to next step without losing drafts.

## Phase 12: Practice, Quizzes, And Games

**Target:** Combine quizzes and games into one friendly Practice page with serious learning loops.

### Sub-phases

- [ ] **12.1 Modes:** Quiz, exam, flashcards, matching, sprint, mistake retry, fill-in-the-blank, true/false, generated-from-Studio.
- [ ] **12.2 Timing:** Target duration, elapsed time, pause, resume, restart, and attempt summary.
- [ ] **12.3 Feedback:** Explanations, retry missed, save mistakes to reviews, create AI explanation, save weak topic.
- [ ] **12.4 Games:** Add small study games backed by quiz/note data, not decorative mini-games.
- [ ] **12.5 Acceptance:** Practice attempts persist, missed items become review cards, and timing works.

## Phase 13: Reviews, FSRS, Streaks, XP, And Mastery

**Target:** Make memory and progress loops meaningful.

### Sub-phases

- [ ] **13.1 FSRS decision:** Add `ts-fsrs` if bundle/runtime impact is acceptable; otherwise keep current scheduler and document the accepted equivalent.
- [ ] **13.2 Reviewable blocks:** Schedule notes, quotes, diagrams, flashcards, quiz misses, and imported facts.
- [ ] **13.3 Caps/rest days:** Daily review caps, rest days, streak freezes, and burnout prevention.
- [ ] **13.4 Mastery:** Skill states: Not started, Familiar, Proficient, Mastered, At risk.
- [ ] **13.5 Acceptance:** Reviews are capped, due items are explainable, and progress updates after attempts.

## Phase 14: Calendar, Time, And Study Planning

**Target:** Make Calendar a real date/time planning surface.

### Sub-phases

- [ ] **14.1 Views:** Month, week, day, agenda, review due dates, and focus blocks.
- [ ] **14.2 CRUD:** Create, edit, delete, complete, duplicate, reschedule, and recurring review suggestions.
- [ ] **14.3 Timezones:** Timezone-aware labels and local display.
- [ ] **14.4 AI planning:** Generate study blocks from weak topics, due dates, and available time.
- [ ] **14.5 Acceptance:** Events persist, reflect on Dashboard, and work on mobile.

## Phase 15: Files, Media, Safety, And R2 Storage

**Target:** Make uploaded material useful and safe without breaking image/video workflows.

### Sub-phases

- [ ] **15.1 Library:** Grid/list, preview, search, type filters, folders/tags, download, rename, delete.
- [ ] **15.2 Media:** Preserve image/video upload, preview, download, and Studio embedding.
- [ ] **15.3 Validation:** MIME sniffing, extension checks, size limits, executable signature blocking, metadata normalization.
- [ ] **15.4 Processing:** Client-side thumbnails where possible; R2 key isolation under `apps/learn/...`.
- [ ] **15.5 Acceptance:** Upload/download works live, unsafe files are blocked, and no raw object keys leak unnecessarily.

## Phase 16: Social, Spaces, Chat, Rooms, And Battles

**Target:** Make social learning useful, opt-in, and not noisy.

### Sub-phases

- [ ] **16.1 Spaces:** Public/private spaces, members, roles, invites, shared notes, and activity.
- [ ] **16.2 Chat:** Channels, threads, saved replies, reactions, moderation flags, and searchable history.
- [ ] **16.3 Rooms:** Durable Object presence, Pomodoro, focus mode, reconnect, hibernating WebSockets.
- [ ] **16.4 Battles:** Realtime quiz rounds, solo/team mode, scoreboard, persistence, invalid-message rejection.
- [ ] **16.5 Acceptance:** Two-client live tests pass for rooms and battles.

## Phase 17: Profile, Settings, Admin, And Audit

**Target:** Give users and admins mature control without overwhelming them.

### Sub-phases

- [ ] **17.1 Profile:** Edit avatar/name/bio/goals/public artifacts/privacy.
- [ ] **17.2 Settings:** Theme, language, density, accessibility, review caps, notifications, privacy, AI defaults.
- [ ] **17.3 Admin:** Provider CRUD/test, masked secrets, users, invites, audit, health, automation jobs.
- [ ] **17.4 Audit:** Filters, entity links, severity, export, request access review.
- [ ] **17.5 Acceptance:** Admin-only APIs are protected, settings persist, and audit rows explain important actions.

## Phase 18: Performance, Architecture, And Code Health

**Target:** Keep LEARN fast while it grows.

### Sub-phases

- [ ] **18.1 Bundle boundaries:** Dynamically load heavy Studio, Univer, PptxGenJS, graph, and realtime surfaces.
- [ ] **18.2 Data fetching:** Batch independent fetches, cache stable lookups, avoid repeated waterfalls, and keep protected route loading friendly.
- [ ] **18.3 React cleanup:** Split monolithic views, use primitive dependencies, memoize heavy lists, virtualize long records, debounce drafts.
- [ ] **18.4 Language strategy:** Keep TypeScript for Workers and UI; consider Rust/WASM only for measured hot paths such as formula calculation, import parsing, or graph layout. Avoid Python in request runtime; use external jobs only if later needed.
- [ ] **18.5 Acceptance:** Lighthouse-style checks show login/dashboard remain quick, Studio heavy tools do not slow first load, and no obvious dead code remains.

## Phase 19: Security, Privacy, Reliability, And Abuse Protection

**Target:** Harden the app realistically without claiming impossible guarantees.

### Sub-phases

- [ ] **19.1 Auth/session:** Secure cookies, session expiry, logout, rate limits, admin-only gates, route protection.
- [ ] **19.2 CSRF/origin:** Mutation origin checks, same-site cookie assumptions, and future CSRF token path if needed.
- [ ] **19.3 Upload safety:** Preserve media while blocking scripts, executables, oversized files, and spoofed content types.
- [ ] **19.4 Platform controls:** Document optional Cloudflare WAF, Turnstile, rate limiting, bot fight mode, and DDoS protections.
- [ ] **19.5 Acceptance:** Security tests cover auth, upload, rate limit, provider masking, and protected routes.

## Phase 20: Deployment, QA, Observability, And Release Operations

**Target:** Make every improvement safely releasable to Cloudflare and trackable.

### Sub-phases

- [ ] **20.1 CI gates:** Keep GitHub CI running tests, typecheck, build, and Cloudflare deploy.
- [ ] **20.2 Live smoke:** After deploy, smoke `/`, `/login`, `/dashboard`, `/studio`, `/ai`, `/practice`, `/files`, `/calendar`, `/settings`, `/admin`, and `/api/integrations/health`.
- [ ] **20.3 Observability:** Add structured health panels, client-safe error boundaries, route-level loading states, and deploy status notes.
- [ ] **20.4 Data QA:** Use `qa_verification_` prefixes for live test records and clean up after verification.
- [ ] **20.5 Acceptance:** `main` is clean, pushed, CI/deploy are green, and live Worker smoke checks pass before any phase is marked complete.

## Expansion Library Candidates

Use libraries only when they materially improve reliability or user value.

- **Docs/notes:** Tiptap extensions, `prosemirror-search`, `lowlight` for code highlighting, KaTeX if equation rendering becomes real.
- **Sheets:** Univer, existing CSV helpers, optional WASM parser only after measured import bottlenecks.
- **Slides:** PptxGenJS, optional Konva/Fabric only if object editing requires canvas-level manipulation beyond DOM-based slide objects.
- **Collaboration:** Yjs or Automerge for document sync; Durable Objects for presence and session coordination.
- **Visualization:** Three.js or Pixi only for graph/visual surfaces, loaded dynamically.
- **Forms/validation:** Zod, React Hook Form, existing API validation helpers.
- **Lists/performance:** TanStack Virtual and Map/Set-backed lookup helpers.
- **Design/accessibility:** Radix primitives, lucide icons, WCAG 2.2 AA contrast checks.

## Phase Execution Template

For each phase:

- [ ] Confirm `git status --short --branch` is clean on `main`.
- [ ] Add or update tests before implementation when behavior changes.
- [ ] Implement one sub-phase at a time.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm test`.
- [ ] Run `corepack pnpm build`.
- [ ] Browser-test desktop and mobile.
- [ ] Commit changed files in small descriptive commits.
- [ ] Push `main`.
- [ ] Confirm GitHub CI and Cloudflare deploy pass.
- [ ] Smoke-test the live Worker.
- [ ] Update roadmap status or progress log.

## Self-Review

- **Spec coverage:** This roadmap covers app refinement, optimization, rewriting opportunities, language/framework strategy, libraries, tools, Studio editors, slides, sheets, docs, notes, AI, practice, social, admin, security, and deployment.
- **Architecture consistency:** TypeScript remains the primary runtime because the app is Next.js on Cloudflare Workers. Other languages are considered only for measured hot paths or offline jobs.
- **No resource drift:** The roadmap keeps D1/R2/Durable Objects and `learn-*` resource isolation.
- **Execution readiness:** Each phase has sub-phases, targets, and acceptance gates that can be converted into smaller implementation plans.
