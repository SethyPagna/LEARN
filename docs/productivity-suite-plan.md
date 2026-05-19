# LEARN Productivity Suite Plan

Status: Active
Last updated: 2026-05-18

## Goal

Make the LEARN Productivity Suite feel like a complete learning workspace for non-technical users: reliable buttons, a modern file explorer, Office-style editing controls, formatted AI insert-back, templates, slide design tools, and predictable Cloudflare-first persistence.

## Current Focus

- Studio is the unified home for Notes, Docs, Sheets, and Slides.
- `/notes`, `/docs`, `/sheets`, and `/slides` remain stable routes that open Studio on the matching tab.
- Work lands on `main`, with small commits and Cloudflare deployment verification after passing local gates.

## Status Tracker

| Area | Status | Notes |
| --- | --- | --- |
| Record actions | In progress | Open, copy, duplicate, export, archive, restore, split pane, and pane controls are active in Studio. Continue auditing every visible action. |
| File explorer | In progress | Studio has list/board/gallery modes and virtualized records. Next steps: stronger folder/trash/move affordances and hover/action grouping. |
| Office ribbon | In progress | Rich text toolbar exists for notes/docs. Next steps: ribbon tabs, font/color/paragraph grouping, clearer picker UX. |
| Sheets | In progress | Row/column operations, CSV helpers, formulas, and basic context actions exist. Next steps: richer range actions, filters, and formatting presets. |
| Slides | In progress | Thumbnail rail, canvas-style editor, themes, transitions, animations, objects, notes, JSON/PPTX export exist. Next steps: preview transitions and better master templates. |
| AI insert-back | In progress | AI prompt builder and insert-back helpers exist. Next steps: richer preview formatting and sheet/slide result validation before insertion. |
| Architecture/performance | In progress | Keep TypeScript/React as the primary Workers runtime for the Cloudflare app; use other languages only for isolated tooling or services after profiling proves a real bottleneck. Continue grouping large UI and feature modules into folders with stable imports. |
| Templates | Planned | Add suite-wide template picker with colors, fonts, and slide master settings. |
| Trash/folders | Planned | Add restore/delete-forever/empty-trash and move-to-folder flows where schema supports it. |
| Tests | In progress | Local gates are `pnpm test`, `pnpm lint`, and `pnpm build`; browser checks are run on key flows. |
| Shell and calendar | In progress | Desktop sidebar is fixed for long pages. Calendar now needs to keep growing toward true date/time planning with month, day, agenda, and editing views. |
| Schema and sharing | Planned | A final Phase 6 schema/workflow plan now maps current D1 tables, social polymorphism, sharing gaps, review/practice loops, realtime snapshots, and UI declutter targets. |
| Folder organization | In progress | Group large flat surfaces into domain folders first, starting with workspace views, then split Studio/AI/Ecosystem/lib data slices in small verified commits. |

## Progress Log

- 2026-05-16: Added the tracked Productivity Suite plan.
- 2026-05-16: Improved Studio explorer records with type-colored cards, per-action loading labels, local error display, and archive confirmation.
- 2026-05-16: Verified Studio explorer actions locally, pushed to `main`, and confirmed GitHub CI plus Cloudflare Worker deploy. Live smoke passed for Studio, Notes, Docs, Sheets, Slides, Practice, and AI routes.
- 2026-05-16: Began Studio declutter redesign by collapsing suite type switching, edit/export/layout controls, record actions, inspector tabs, templates, and rich-text tools into compact menus while preserving the same functions.
- 2026-05-16: Continued editor-specific declutter by grouping sheet row/column/fill/formula tools and slide design/motion/insert/arrange/notes tools into compact menus.
- 2026-05-16: Started Practice declutter by moving mode selection, filters, timer controls, and per-question actions into compact menus while keeping submit and progress visible.
- 2026-05-16: Started AI Tutor declutter by moving task modes, context filters, provider family, creativity, and token controls into compact menus with summary chips.
- 2026-05-16: Started Social workspace declutter by moving filters and secondary record actions into compact menus while keeping save and selected record context visible.
- 2026-05-16: Continued Social Chat declutter by grouping compose intent, channel signals, composer tools, thread filters, and thread reactions into menus while keeping Send, search, drafts, and thread context visible.
- 2026-05-16: Moved Studio draft/status feedback into a floating active-pane toast so autosave no longer inserts a row that pushes the editor while typing. Architecture review kept the Workers app TypeScript-first and focused optimization on debounced drafts, isolated heavy Studio libraries, and measured React cleanup.
- 2026-05-16: Made the desktop sidebar a fixed rail for long pages and expanded Calendar with a month grid, selected-day timeline, month navigation, event dots, and timezone-aware time ranges.
- 2026-05-16: Started the Studio header refinement by hiding noisy default draft tab names, moving save status under the title, expanding Word-like style menus with saved heading presets, and aligning AI Tutor task/filter/gateway controls into a compact top-right command area.
- 2026-05-16: Added a simple public intro page before login with a short product hook and animated workflow cards.
- 2026-05-16: Made Studio font-size controls render through an explicit Tiptap extension and collapsed old empty draft tabs so saved browser layouts no longer duplicate placeholder tabs.
- 2026-05-16: Reworked the public intro into a launch-style animated product preview with layered Studio/AI/Practice mock screenshots and a horizontal workflow slideshow instead of a scrolling feature explainer.
- 2026-05-16: Moved the intro workflow into a separate `/showcase` gallery with clickable dots, thumbnails, next/previous controls, keyboard navigation, and wheel-driven slide changes across Dashboard, Studio, AI, Practice, Calendar, and Social previews.
- 2026-05-16: Optimized `/showcase` transitions by rendering one active preview at a time instead of sliding six full offscreen screens, reducing paint work and making wheel/click slide changes smoother.
- 2026-05-17: Fixed the login LEARN brand so desktop and mobile users can click it to return to the public intro page.
- 2026-05-17: Reintroduced the workflow into the public intro scroll path with a sticky animated section, realistic app-content mock screens, step buttons, and scroll-driven transitions while keeping `/showcase` as a direct gallery route.
- 2026-05-17: Converted the intro workflow handoff from plain section scrolling into a fixed overlay transition driven by scroll progress, with the workflow anchor landing on the pinned gallery and the overlap layer no longer intercepting hero clicks while hidden.
- 2026-05-17: Shortened the intro workflow overlay distance so the hero handoff and six-step gallery advance faster with less scrolling.
- 2026-05-17: Tightened the intro workflow again by cutting the scroll distance to a short overlay sequence and speeding up slide/progress transitions.
- 2026-05-17: Refined the public intro with clearer product messaging, a concrete note-to-AI-to-practice preview, and a slower hero-to-workflow overlay reveal while preserving the shorter workflow sequence.
- 2026-05-17: Smoothed the scroll workflow slide appearance with a longer soft fade/rise animation and calmer progress-bar easing while keeping the compact scroll distance.
- 2026-05-17: Added public intro theme and language icon controls beside Sign in, sharing the app theme and `learn_locale` preferences while giving the intro a readable light mode.
- 2026-05-17: Applied public theme and language preferences to the scroll workflow overlay with light-mode surfaces, translated workflow labels/copy for key public locales, and a locale-change event so the workflow updates without reload.
- 2026-05-17: Started the auth-entry refinement with a cleaner sign-in/request-access surface, theme/language controls on login, password visibility, demo account helpers, and a rate-limited access-request API that records audit activity for admin review.
- 2026-05-17: Started Phase 1 of the product maturity roadmap by moving route, alias, sidebar, and launcher definitions into a shared navigation contract so the app has fewer primary sidebar destinations while preserving stable routes.
- 2026-05-17: Continued Phase 2 auth maturity with safe redirect-back login handling, explicit admin-reset guidance for forgotten passwords, and a token-based invite acceptance path that creates or attaches learner accounts and signs them in.
- 2026-05-17: Added an Admin Access tab that turns request-access audit rows into readable request cards and lets admins issue copyable invite links from each request.
- 2026-05-17: Added Dashboard first-run onboarding for invite-created learners and `/dashboard?onboarding=1`, saving learning goal, preferred workflow, and first Studio type before routing to the next useful page.
- 2026-05-17: Started Phase 3 dashboard maturity by adding tested setup-gap helpers and compact Dashboard cards that only appear when Studio material, practice, or route signals are missing.
- 2026-05-17: Continued Phase 3 dashboard maturity by exposing D1 streak/XP metrics and replacing raw dashboard counts with compact streak, XP, review, draft, and focus tiles.
- 2026-05-17: Continued Phase 3 dashboard maturity by expanding `/api/dashboard` with recent AI chats, quiz attempts, and uploads, then replacing Studio-only recents with a mixed Recent Work panel.
- 2026-05-17: Completed the Phase 3 Today Route slice by adding tested primary/backup route actions and rendering a compact dashboard action stack for create, review, practice, schedule, and weak-topic repair paths.
- 2026-05-17: Completed Phase 3 acceptance by moving Dashboard quick actions into a tested route contract and wiring the UI to shared compact action groups.
- 2026-05-17: Started Phase 4 design-system maturity with tested shared tone/control helpers, reusable status/control primitives, and Dashboard status chips moved off one-off color logic.
- 2026-05-17: Continued Phase 4 by moving AI Tutor status pills, task menu buttons, result actions, provider status chips, gateway metrics, and readiness cards onto shared design-system primitives.
- 2026-05-17: Continued Phase 4 by moving Practice submit/timer/retry/review-card actions, repair badges, review summary chips, and dropdown menu surfaces onto shared design-system primitives.
- 2026-05-17: Continued Phase 4 by moving Calendar duration presets, month navigation, agenda filters, planning chips, timezone chips, and event action buttons onto shared design-system primitives.
- 2026-05-17: Continued Phase 4 by moving Progress, Settings, and Admin header chips plus Settings save/language/suggested-section controls onto shared design-system primitives.
- 2026-05-18: Continued Phase 4 by replacing Admin overview, provider/key, access-request, tab, invite, and plan chips/buttons with shared design-system primitives.
- 2026-05-18: Completed a multi-pass schema/workflow sweep and added the final Phase 6 relational schema plan covering content registry, universal sharing, friends/follows, content versions, practice sessions, collaboration logs, search/feed cache, and cleaner grouped UI workflows.
- 2026-05-18: Started executing the final Phase 6 schema plan by adding migration-parsing schema contract tests for the current D1 product tables and hot-query indexes.
- 2026-05-18: Added the Phase 6 content registry migration and wired notes, docs, sheets, slides, media uploads, and micro-lessons to canonical content item rows with generic content versions for Studio history.
- 2026-05-18: Added the Phase 6 social graph and sharing foundation with `user_connections`, shared-access indexes, tested permission resolution, and normalized social-action targets for safer comments/reactions.
- 2026-05-18: Added Phase 6 practice session unification with normalized `practice_sessions` / `practice_session_items`, quiz and game attempt mirroring, and a Reviews API path that can convert missed session items into review cards.
- 2026-05-18: Added Phase 6 collaboration event projection with D1-backed collaboration sessions/events, compact realtime event validation, Durable Object live-event retention, and useful non-presence projection for rooms, battles, editor changes, and snapshots.
- 2026-05-18: Added Phase 6 search/read-performance foundations with a D1-safe `content_search` projection, visibility-aware content search helpers, expiring `feed_rank_cache`, and `/api/feed` cache-first discovery selection that preserves serendipity.
- 2026-05-18: Started Phase 6 UI workflow declutter by compacting AI Tutor readiness/requirements drawers, grouping AI result insert/create actions into menus, and moving Practice draft feedback into a quiet status row that does not dominate the quiz flow.
- 2026-05-18: Continued Phase 6 UI declutter by replacing Studio explorer's exposed filter selector and view-mode button row with compact Browse/View menus plus an item-count chip.
- 2026-05-18: Continued Phase 6 UI declutter by reducing the Practice workspace side panel to a primary next action, compact signal chips, and collapsible sections for alternate paths and saved drafts.
- 2026-05-18: Continued Phase 6 UI declutter by keeping Social's primary action visible and folding safety cues, status, and mode counts into one compact expandable signal panel.
- 2026-05-18: Continued Phase 6 UI declutter by simplifying the Learn route overview: route cards now expose details on hover, the route rationale is collapsible, and the learning loop is tucked behind an expandable section.
- 2026-05-18: Added the folder architecture track to the Phase 6 plan, confirmed the app should stay TypeScript-first on Cloudflare unless profiling proves otherwise, and started grouping workspace views under `components/learn/views/workspaces`.
- 2026-05-18: Smoothed the public intro and workflow gallery transitions by lengthening the pinned scroll sequence, centering slide jump targets, and slowing the gallery wheel/preview animation so each transition feels more natural.
- 2026-05-18: Split Reviews and Calendar back into separate sidebar destinations, simplified Learn into a focused daily route page, made workspace tabs a compact one-line scroller, and raised hover/info overlays above busy backgrounds.
- 2026-05-18: Expanded Studio samples to 10 templates per type for Notes, Docs, Sheets, and Slides, and expanded slide visual presets to 10 styles with a regression test.
- 2026-05-18: Converted compact desktop navigation into a true icon rail with grouped initials, icon badges for drafts/attempts, floating search/language/notification panels, and an 84px content margin so pages gain usable space.
- 2026-05-19: Continued dashboard declutter by shortening the Today Route hero, moving explanatory copy into info popovers/tooltips, making weak-topic rows actionable, and raising dashboard hover details above dense backgrounds.
- 2026-05-19: Continued Calendar maturity with real date/time and duration inputs, selected-day quick scheduling slots, day-click draft alignment, cleaner empty agenda states, and a mojibake-free event duration label.
- 2026-05-19: Continued workspace UI declutter by making Learn/Practice/Social tabs shorter and one-line, tightening route cards, compacting Practice signal chips, and shortening expandable labels without removing any actions.
- 2026-05-19: Continued Files maturity by compacting the upload/search/filter chrome, moving file workflow explanations into info menus, showing active filter counts in the Browse control, and making delete a two-step confirmation.
- 2026-05-19: Continued Settings declutter by shortening the header action, converting section cards into a horizontal compact switcher, collapsing workspace signals, and making language selection expandable with the current language visible.
- 2026-05-19: Continued Reviews declutter by making the review ritual action-first, moving guidance and topic details into expandable sections, and hiding memory-scheduling metrics behind each review card's Memory signal drawer.
- 2026-05-19: Continued Practice declutter by moving quiz descriptions into an info popover, replacing the loud progress-stat grid with a compact session strip, hiding draft/timer details behind drawers, and folding repair weak-topic chips until needed.
- 2026-05-19: Continued AI Tutor declutter by turning the right rail into focused Gateway, Import, and Presets tabs so provider health, import-to-Studio, and model preset controls are available without competing on the same screen.
- 2026-05-19: Continued Studio explorer declutter by removing the duplicated visible Open button from every record card, keeping card-click as the primary open action, and moving Open plus secondary actions into the More/right-click menus.
- 2026-05-19: Continued Social workspace declutter by folding the visible social metric row into a compact Signals drawer so spaces, rooms, and battles keep counts available without making the left panel feel like an analytics page.
- 2026-05-19: Continued Profile declutter by moving duplicate profile metrics and portrait signals into expandable drawers while keeping identity, privacy, bio, and the next action visible.
- 2026-05-19: Continued Progress declutter by shortening the primary route action, moving route detail/focus chips into a Route details drawer, and folding large metric cards into a compact Metrics drawer.
- 2026-05-19: Continued Admin declutter by folding the large operational signal cards into an Admin signals drawer while keeping health, search, next action, and section controls visible.
- 2026-05-19: Continued Provider Admin declutter by separating providers, editor, routing, and presets into compact modes, folding gateway metrics into a signal drawer, and moving provider test/edit/delete controls into per-card action menus.
- 2026-05-19: Continued Studio polish by moving the local draft-saved feedback into a fixed quiet notice so autosave confirmations no longer compete with editing status or shift the workspace experience.
- 2026-05-19: Continued navigation polish by making sidebar groups truly expandable instead of forced open, while mobile now starts with only Home and the active group expanded for a calmer menu.
- 2026-05-19: Continued architecture cleanup by deleting the unused legacy Notes view with mojibake emoji constants now that `/notes` is served by the unified Studio workspace.
- 2026-05-19: Continued auth-entry declutter by folding desktop demo accounts into a compact expandable access drawer while preserving the same one-click sign-in helpers.
- 2026-05-19: Continued Chat workspace polish by moving draft-saved feedback from the header into the composer footer so autosave status no longer shifts the main chat controls while typing.
- 2026-05-19: Continued Chat functionality by wiring each thread Reply button to prefill the composer with the thread channel, reply title, question intent, and a ready draft cue.
- 2026-05-19: Continued Chat functionality by wiring thread menu actions so Reply opens the same composer draft while Helpful and Save selections produce clear local feedback instead of silent no-ops.
- 2026-05-19: Continued Chat composer functionality by wiring mention, reaction, translate, and notify tools into the draft body with compact status feedback instead of menu-only no-ops.
- 2026-05-19: Continued AI import maturity by preserving the last created Studio target after import and exposing stable Open, Practice, and Flashcards next actions instead of relying on a cleared preview.
- 2026-05-19: Continued AI Tutor workflow maturity by making result Create actions switch the real task mode, insert target, source scope, and legacy mode together instead of only rewriting prompt text.
- 2026-05-19: Continued AI Tutor shortcut maturity by making Studio block switch to the Studio formatter workflow, set the doc-section insert target, and avoid duplicate prompt instructions.
- 2026-05-19: Continued AI Tutor gateway alignment by raising the UI/runtime completion budget to 16k tokens, adding a 16k preset, and making the Max length filter select the larger budget automatically.
- 2026-05-19: Continued AI Tutor filter accuracy by mapping every output length choice to a concrete token budget so Short, Balanced, Deep, and Max all change runtime behavior.
- 2026-05-19: Continued navigation, Studio, and Social maturity by removing compact sidebar group initials, turning Studio templates into structured preview cards, and adding invite/chat workflow actions to social records.
- 2026-05-19: Continued Studio template maturity by enriching applied templates with workflow guidance, review/export checklists, sheet planning columns, and slide theme/motion/speaker-note defaults.
- 2026-05-19: Continued Social workspace maturity by adding a tested action kit for spaces, rooms, and battles with copy-ready invites plus compact routes into chat, calendar, files, and practice.
- 2026-05-19: Continued Social invite maturity by validating invite drafts and wiring the Social invite drawer to the secure workspace invite API while keeping lightweight copy-text invites available.
- 2026-05-19: Continued Social people maturity by adding tested workspace-member summaries and a compact People drawer with searchable roles/statuses inside spaces, rooms, and battles.
- 2026-05-19: Continued Social activity maturity by adding a tested state-derived Activity drawer that explains saved/draft state, invite readiness, people status, and the next collaborative move without requiring a new feed endpoint.
- 2026-05-19: Continued Social activity integration by adding a protected recent social-actions read API, allowing study-room targets, and showing real recent actions inside the compact Activity drawer when available.

## Implementation Slices

1. Audit all Productivity Suite buttons and replace placeholders with working handlers.
2. Improve Studio explorer actions and card/list/gallery ergonomics.
3. Add a reusable Office-style ribbon model for Notes, Docs, Sheets, and Slides.
4. Add better templates and apply them across editor surfaces.
5. Deepen AI response preview and insert-back validation.
6. Expand slide animation/transition preview controls.
7. Add folder/trash flows and integration tests for critical CRUD paths.

## Acceptance Checklist

- Every visible button either performs an action, opens a menu, or is disabled with clear state.
- Actions update local UI state and persisted records consistently.
- Destructive actions use confirmation or reversible archive behavior.
- Loading, error, and success states are visible without noisy text.
- Desktop and mobile layouts avoid horizontal overflow.
- Dark/light/high-contrast modes keep readable controls.
- Cloudflare deployment passes after local gates.
