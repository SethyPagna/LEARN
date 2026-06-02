# LEARN Productivity Suite Plan

Status: Active
Last updated: 2026-05-21

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
| Cloudflare cleanup | In progress | Generated local output cleanup runs before deploy. LEARN-only remote cleanup now has a tested classifier and dry-run audit command before any deletion is considered. |

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
- 2026-05-19: Continued Social maturity by adding a protected connections API, friend/follow discovery, remove-connection support, and a compact Social start page that groups people search, quick posts, and Chat/Groups/Live/Battles flows.
- 2026-05-19: Redid the Social start workflow around plain user actions: find people, post, invite, and create/open Chat, Groups, Live rooms, or Battles from one compact hub with deeper signals collapsed.
- 2026-05-19: Continued Social detail cleanup by replacing stacked Spaces/Rooms/Battles drawers with compact tabs for Actions, Invite, People, Activity, and Safety.
- 2026-05-19: Continued Social hub cleanup by moving Find, Post, Invite, and Connections into one task switcher so the start page shows one clear action at a time.
- 2026-05-19: Continued Social flow cleanup by changing the Chat/Groups/Live/Battles cards into a compact action rail with smaller create buttons.
- 2026-05-19: Continued Practice cleanup by turning the quiz timer into a compact command strip and removing corrupted separator text from quiz progress labels.
- 2026-05-19: Continued Games cleanup by aligning Flashcard Sprint with the compact Practice command style and moving score, prompt, and time into status chips.
- 2026-05-19: Continued AI Tutor cleanup by merging separate Readiness and Requirements blocks into one compact Review setup drawer.
- 2026-05-19: Continued Social people maturity by replacing the fixed five-person cap with a tested paged people finder, visible available counts, show-more behavior, and a direct invite action when no match exists.
- 2026-05-19: Continued Social connections maturity by replacing the fixed six-connection cap with a tested paged connections summary, show-more control, and friend/follow/pending/blocked chips.
- 2026-05-19: Continued Social detail maturity by replacing the Spaces/Rooms/Battles People drawer's fixed ten-person cap with a tested expandable member page and clearer empty states.
- 2026-05-19: Continued Social record-list maturity by paging long Spaces/Rooms/Battles record lists with visible/total counts and a show-more control.
- 2026-05-19: Continued Social activity maturity by replacing the fixed four-action Activity drawer cap with a tested expandable recent-activity page and visible shown/total counts.
- 2026-05-19: Continued Social action safety by making Spaces/Rooms/Battles delete a two-step confirm inside the compact More menu instead of an immediate destructive action.
- 2026-05-19: Continued Social action reliability by adding busy states, guarded Save/Toggle/Delete flows, and clear recovery messages for failed record updates.
- 2026-05-19: Continued Social action clarity by disabling draft-only quick actions with tested Save-first labels so record actions do not feel broken.
- 2026-05-19: Continued Social invite maturity by adding tested secure-invite readiness states so link creation waits for a saved record and valid email.
- 2026-05-19: Continued Social workflow accuracy by making the primary next-action button open recommended public/open/team records instead of always starting a new draft.
- 2026-05-19: Continued Social record-list polish by replacing plain metadata text with tested compact status/meta/recommended chips on Spaces/Rooms/Battles cards.
- 2026-05-19: Continued Social record clarity by adding tested per-card action labels such as Review, Join, Plan, and Play.
- 2026-05-19: Continued Social selection feedback by adding tested next-step messages and clearing stale delete state when opening records.
- 2026-05-19: Continued Social empty-state clarity by separating true empty lists from search/filter misses and adding a clear-filters action.
- 2026-05-19: Continued Social filter clarity by adding tested active-filter summaries and a compact clear action before lists become empty.
- 2026-05-19: Continued Social command clarity by adding a tested primary action that recommends Invite, Find, Post, Groups, Rooms, or Battles based on workspace readiness.
- 2026-05-19: Continued Social invite reliability by reusing validated invite drafts in the command center and showing compact readiness before API calls.
- 2026-05-19: Continued Files refinement by adding tested filter summaries plus safer copy/delete busy and error states.
- 2026-05-19: Continued Files usability by separating empty uploads from filtered misses and keeping previews scoped to visible files.
- 2026-05-19: Continued Calendar refinement by adding tested day-part segments and a compact timeline for each selected date.
- 2026-05-19: Continued Calendar action reliability by adding guarded busy states, compact action labels, and recovery messages for save, duplicate, complete, and delete flows.
- 2026-05-19: Continued Reviews maturity by gating grading until reveal, adding tested rating action state, and showing compact recovery feedback for review submissions.
- 2026-05-19: Continued Practice reliability by adding tested run-action state and guarded submit, retry, full-set, and save-review-card flows with compact recovery feedback.
- 2026-05-19: Continued Games reliability by adding tested sprint action state and guarded next, finish, restart, target, and score-save feedback.
- 2026-05-19: Continued Chat reliability by adding tested composer action state and guarded send, clear-draft, and suggestion flows with compact failure feedback.
- 2026-05-19: Continued Chat thread reliability by adding tested thread action state and persisting helpful/save selections through the social actions API.
- 2026-05-19: Continued Chat feedback maturity by making helpful/save status per-thread so menu labels, active states, and saved filtering update immediately.
- 2026-05-19: Continued Chat reply reliability by normalizing reply thread IDs and sending restored reply drafts back into the existing thread.
- 2026-05-19: Continued Chat list clarity by replacing the static read label with tested compact statuses for saved, helpful, questions, wins, and recent threads.
- 2026-05-19: Continued Social people reliability by adding tested Add/Follow/Remove action states and wiring per-person busy/disabled feedback in the Social hub.
- 2026-05-19: Continued Social command reliability by adding tested hub-level action states for Sync, Post, Invite, and flow creation buttons to prevent duplicate requests.
- 2026-05-19: Continued Social flow clarity by separating open labels from create labels so compact plus buttons describe the action they actually run.
- 2026-05-19: Continued Social terminology cleanup by replacing learner-facing “space” wording with clearer “group” copy while keeping existing API routes stable.
- 2026-05-19: Continued Social label consistency by aligning navigation, dashboard, profile, intro, and showcase copy around Groups while preserving `/spaces` compatibility.
- 2026-05-19: Continued Social label polish by aligning the Feed ritual button and Social tab caption with Groups terminology.
- 2026-05-19: Continued Social API copy polish by keeping `/api/learning-spaces` stable while changing fallback error text to learner-facing group language.
- 2026-05-19: Continued Groups compatibility by adding `/groups` as a friendly route alias for the existing `/spaces` Social surface.
- 2026-05-19: Continued Groups route polish by making navigation prefer `/groups` while preserving `/spaces` as a compatibility path.
- 2026-05-19: Continued Studio draft UX refinement by keeping local draft persistence frequent while rate-limiting the visible saved notice so editing no longer feels pushed around.
- 2026-05-19: Continued Calendar maturity by moving month-grid workload logic into a tested helper and showing event count, first time, and planned minutes directly in each day cell.
- 2026-05-19: Continued Dashboard clarity by replacing the fake no-attempts weak-topic card with tested real-topic cards and a compact empty action.
- 2026-05-19: Continued AI Tutor clarity by deriving compact workflow chips from tested readiness logic and raising stale low token settings to the selected output-length budget at runtime.
- 2026-05-19: Continued AI import-loop maturity by adding tested follow-up actions so imported material can load cleanup, practice, or flashcard workflows with the right task, source scope, insert target, and legacy mode.
- 2026-05-19: Continued AI import accuracy by making cleanup follow-ups target-aware: sheets open the sheet organizer, slides open the slide builder, and docs/notes keep the document formatter.
- 2026-05-19: Continued AI import accuracy by splitting note cleanup from document cleanup so imported notes use the note-design workflow and insert as note blocks.
- 2026-05-19: Continued AI import reliability by preserving pasted/imported material as Uploaded files context, so cleanup, practice, and flashcard follow-ups send the actual learner content instead of only the title.
- 2026-05-19: Continued AI import readiness by warning when Uploaded files is selected without attached/imported content, keeping follow-up prompts from looking ready with weak context.
- 2026-05-19: Continued AI Tutor action clarity by making the primary run button open Import or Gateway when that is the useful next step instead of presenting a dead or misleading run action.
- 2026-05-19: Continued AI Import clarity by showing attached pasted/saved source status in the Import panel, badge, and clear action so hidden context is no longer confusing.
- 2026-05-19: Continued AI Import workflow accuracy by automatically switching the AI source to Uploaded files when material is pasted/imported and returning to Recent notes when that source is cleared.
- 2026-05-19: Continued AI Import state reliability by making pasted-source edits replace the previous saved import text, preventing stale hidden context from reappearing after the text box is cleared.
- 2026-05-19: Continued AI Import metadata reliability by clearing saved source attachments when the import title or target changes, unless current pasted text is already replacing the source.
- 2026-05-20: Continued Social hub UX by reducing always-visible controls, moving sync/signals into a compact menu, surfacing one best next action, and collapsing social-space creation tools.
- 2026-05-20: Continued Practice UX by merging progress, timer, draft status, target presets, reset, and clear actions into a tested compact session bar.
- 2026-05-20: Continued Dashboard UX by collapsing secondary route moves, setup gaps, signals, and quick actions into compact menus while keeping every action available.
- 2026-05-20: Continued public-entry reliability by stabilizing theme hydration on login/intro controls and removing corrupted public language labels.
- 2026-05-20: Continued sidebar refinement by making compact desktop navigation a true icon-only rail while preserving labeled groups on mobile.
- 2026-05-20: Continued Learn workspace cleanup by removing Dashboard/Reviews/Calendar-style route actions from Learn and focusing it on Studio, Practice, and AI path-building.
- 2026-05-20: Continued Reviews UX by moving detailed queue statistics into a compact drawer and keeping the main review panel focused on due count, recall, and active grading state.
- 2026-05-20: Continued Calendar UX by replacing the left-panel report grid with tested planning chips and a details drawer for secondary counts and suggestion rationale.
- 2026-05-20: Continued Calendar reliability by deferring current-date planner defaults until browser mount, removing time-zone hydration mismatch noise on the live Worker.
- 2026-05-20: Continued Files UX by adding tested library summary chips, surfacing compact storage counts, and fixing non-image file previews to use document-aware icons.
- 2026-05-20: Continued Settings UX by adding tested header summary chips and guarded save feedback for profile/preferences without expanding visible copy.
- 2026-05-20: Continued Admin UX by adding tested header summary chips and replacing repeated status pills with compact clickable operation chips plus a quieter signals drawer.
- 2026-05-20: Continued Provider Admin UX by adding client-safe tested gateway chips and using them to make provider health, readiness, routing, and setup states compact and clickable.
- 2026-05-20: Continued Profile UX by adding tested learner summary chips and making next action, privacy, mastery, streak, and artifact state compact, clickable, and less text-heavy.
- 2026-05-20: Continued Feed UX by adding tested discovery summary chips, keeping open/outside/answered state visible, and folding secondary feed metrics plus topic counts into a compact signals drawer.
- 2026-05-20: Continued Graph UX by adding tested graph health chips and folding secondary graph density, sharing, seed, and mastery counts into a compact signals drawer.
- 2026-05-20: Continued Vault UX by reusing graph health chips in the Vault hero and replacing the long flat block palette with tested grouped capture/study/media/advanced tools.
- 2026-05-20: Continued Studio UX by adding tested record action groups and using them to organize item menus into Open, Edit, Share, and Manage clusters instead of one flat action list.
- 2026-05-20: Continued Studio context-menu UX by reusing the same action groups for right-click record actions, keeping fast workflows aligned with the compact item menu.
- 2026-05-20: Continued Social UX by adding tested Friends, Chats, Moments, Groups, and Calls lanes that map familiar social actions to existing LEARN chat, people, groups, and live-room flows.
- 2026-05-20: Continued Practice UX by adding tested play styles inspired by live quizzes, study tools, assessments, arcade review, and strategy games, then surfacing them as compact guided cards.
- 2026-05-20: Continued Social calls by adding tested voice, video, group, focus, and battle call modes and surfacing them as compact actions backed by rooms and battles.
- 2026-05-20: Continued Practice depth by adding tested Classic, Team race, Match, Redemption, Arcade quest, and Economy battle modes and surfacing them in a compact Practice drawer.
- 2026-05-21: Continued Social maturity by adding tested WeChat-style starter actions for Add, Chat, Moment, Group, and Call, then surfacing them as a compact icon rail above detailed panels.
- 2026-05-21: Continued Social contacts by adding tested per-contact Chat, Group, and Call actions and surfacing them directly inside connection cards while gating pending contacts.
- 2026-05-21: Continued Social moments by adding tested Win, Question, Resource, and Milestone moment options and wiring them to compact post chips with channel-aware posting.
- 2026-05-21: Continued Chat maturity by adding tested quick prompts for questions, wins, resources, and recaps and surfacing them as compact composer chips.
- 2026-05-21: Continued Chat inbox UX by adding tested shortcuts for All, Help, Wins, Saved, Mentions, and Studio and wiring them to compact thread filtering.
- 2026-05-21: Continued Social Find UX by adding tested people-search shortcuts for All, Learners, Admins, Active, and Email and surfacing them above the add/follow list.
- 2026-05-21: Continued repo hygiene by adding a tested generated-workspace cleanup plan, local cleanup ops command, ignored output folder, and pre-Cloudflare-deploy cleanup.
- 2026-05-21: Continued Cloudflare cleanup safety by adding a tested LEARN-only resource classifier plus a dry-run audit command for Workers, Pages, D1, and R2 resources.
- 2026-05-21: Continued CI/deploy hygiene by opting GitHub Actions into Node 24 and replacing old branch trigger naming with descriptive feature/fix/refine branch groups.
- 2026-05-21: Continued Social architecture cleanup by replacing the temporary-looking `social-api-copy` module with an intentful Social API messages module and aligned tests.
- 2026-05-21: Continued AI import-loop cleanup by renaming the old `legacyMode` follow-up field to `aiMode` across the import gateway, tests, and AI Tutor caller.
- 2026-05-21: Continued Import Gateway cleanup by centralizing import target labels and destination views so AI Tutor and import previews share one routing source.
- 2026-05-21: Continued Studio import cleanup by reusing the shared Import Gateway target options, labels, and destination mapping in Studio.
- 2026-05-21: Continued AI Tutor import cleanup by reusing the shared Import Gateway target options in draft restore and import selection.
- 2026-05-21: Continued Import Gateway safety by adding one shared import target selection normalizer and using it in Studio and AI Tutor selectors.
- 2026-05-21: Continued AI insert-back cleanup by centralizing Studio insert targets and draft normalization in the prompt builder.
- 2026-05-21: Continued onboarding safety by centralizing first-run workflow and Studio-type options, labels, and select normalization.
- 2026-05-21: Continued Social invite safety by centralizing invite role options and using shared role normalization in Social hubs and detail panels.
- 2026-05-21: Continued Admin cleanup by centralizing Admin tab options and reusing them in the control-center tab bar.
- 2026-05-21: Continued Calendar cleanup by centralizing event type labels, event type normalization, and duration presets in the calendar feature helper.
- 2026-05-21: Continued AI Tutor cleanup by centralizing tutor task modes, filter options, token presets, and mode grouping in the workflow helper, then wiring the AI page to that shared catalog.
- 2026-05-21: Continued Studio cleanup by centralizing rich-text font, size, text color, and highlight options in a shared formatting helper used by the toolbar.
- 2026-05-21: Continued Studio navigation cleanup by centralizing Studio kind labels, section filters, view modes, inspector tabs, and empty-tab labels in a tested navigation helper.
- 2026-05-21: Continued workspace cleanup by centralizing Practice and Social tab labels, command labels, and route mapping in a tested workspace navigation helper.
- 2026-05-30: Continued repository cleanup by moving operational change-control docs under `docs/operations/` and this productivity plan under `docs/roadmap/`, while preserving root files for framework and deploy entry points only.
- 2026-05-30: Continued CI hygiene by updating GitHub checkout/setup-node actions to their Node 24 major versions, removing the old force-runtime flag, and adding a project-structure guard for the workflow runtime contract.
- 2026-05-30: Continued dependency hygiene by checking current package drift, updating the Node 22 type definitions to the latest patch line, and ignoring transient `.pnpm-store/` cache output from lockfile-only maintenance.
- 2026-05-30: Continued toolchain hygiene by updating the pinned pnpm 11.x Corepack package-manager hash after Corepack supply-chain verification passed for the lockfile.
- 2026-05-21: Continued Social architecture cleanup by centralizing the hub summary, primary action, lanes, starter actions, call modes, and moment options in one tested command model.
- 2026-05-21: Continued Studio creation cleanup by moving sheet/deck blank defaults into a tested helper and stopping new sheets/decks from opening with seeded sample content unless a template is chosen.
- 2026-05-21: Continued Studio default cleanup by extending shared blank defaults to notes and docs so creation, draft detection, and rich-text fallbacks use one source of truth.
- 2026-05-21: Continued Studio persistence cleanup by reusing the same shared blank titles in the D1 save paths for docs, sheets, and decks.
- 2026-05-21: Continued Studio label cleanup by centralizing create labels, preview fallbacks, and draft/no-item summaries in the shared Studio defaults helper.
- 2026-05-21: Continued Studio fallback cleanup by reusing the shared fallback title in layout defaults and Dashboard recent-work cards.
- 2026-05-21: Continued Social declutter by moving Social's Chat/Groups/Live/Battles navigation into a page subsidebar and folding starter, calls, and creation tools into compact drawers.
- 2026-05-21: Continued Studio maturity by turning slide templates into real design presets with themes, motion, speaker notes, editable objects, simpler template cards, and reliable slide navigation controls.
- 2026-05-21: Continued Studio template maturity by adding tested rich-document and sheet design presets so templates apply visual surfaces, media areas, review tools, operational columns, and compact title-first cards.
- 2026-05-21: Continued Studio slide polish by applying theme colors to slide objects and title/body text, adding one-click apply-to-all theme behavior, and replacing redundant ellipsis controls with clearer Layout/File actions.
- 2026-05-24: Continued product polish by removing duplicate Dashboard info affordances, changing progress to studied-minutes over daily goal, moving Studio/AI/Files into Learn navigation, refreshing the LEARN icon assets, moving AI prompt preview below the learner input with a full assembled prompt, simplifying Social into messenger-style top tabs, and adding editable app accent colors in Settings.
- 2026-05-21: Continued Studio slide-canvas maturity by making canvas objects selectable, focusing the properties panel on one selected object at a time, auto-selecting inserted objects, and removing always-expanded object editors.
- 2026-05-21: Continued Studio slide-object tooling by adding tested duplicate, nudge, resize, and layer-order helpers plus a compact Object menu for selected canvas objects.
- 2026-05-21: Continued Studio slide-object alignment by adding tested left, center, right, top, and bottom alignment helpers and wiring them into the compact Object menu.
- 2026-05-21: Continued Studio slide-object workflow by adding right-click canvas menus for duplicate, nudge, align, layer order, size presets, and delete actions without adding more always-visible buttons.
- 2026-05-21: Began the Canva-style Studio redesign by adding a project-browser entry, universal canvas dimensions, collapsible tool rails, Back/New design actions, and page-like document/slides surfaces.
- 2026-05-21: Continued the Canva-style Studio redesign by adding tested universal tool panels for Projects, Templates, Elements, Text, Media, Brand, and AI, with working insert actions for rich documents, sheets, and slide objects.
- 2026-05-21: Continued Canva-style page workflows by adding tested rich-document page helpers, New page/Duplicate page tool actions, document page counters, and shared slide page creation behavior.
- 2026-05-21: Continued Studio project-browser cleanup by centralizing active-kind filtering, search normalization, project counts, and template matching so the launcher behaves more like a focused design workspace.
- 2026-05-21: Continued Studio decluttering by making tool panels title-first, moving panel guidance into info popovers, and replacing long action copy with compact Page/Data/Canvas/Insert chips.
- 2026-05-21: Continued Studio launcher maturity by changing template clicks into preview selection with a deliberate Use template action, reducing accidental editor jumps while keeping design details expandable.
- 2026-05-21: Continued Canva-style Studio sizing by centralizing canvas format groups and replacing the flat dimension picker with expandable Presentation, Document, Social, and Poster groups.
- 2026-05-21: Continued Studio preview cleanup by centralizing template preview labels, action text, section trimming, and fallback canvas display before rendering the launcher preview panel.
- 2026-05-22: Continued Studio unification by making the launcher project-first, moving Notes/Docs/Sheets/Slides into metadata filters, showing all templates together, and expanding Canva-style tool actions across elements, text, media, brand, and AI.
- 2026-05-22: Continued Studio format maturity by filtering templates against compatible canvas formats and expanding document, presentation, social, poster, sheet, thumbnail, and infographic sizes.
- 2026-05-22: Continued Studio launcher functionality by making Canva-style tool cards apply real editor actions instead of only opening blank designs, with tested kind resolution for compatible Notes, Docs, Sheets, and Slides targets.
- 2026-05-22: Continued Studio launcher clarity by grouping Canva-style tool actions into compact Pages, Visuals, Data, Inserts, Media, Brand kit, Text styles, and AI prompt sections instead of one long button list.
- 2026-05-22: Continued Studio project-first cleanup by moving Notes/Docs/Sheets/Slides language into quieter project metadata so the launcher reads as one Projects workspace with formats, designs, and tools.
- 2026-05-22: Continued Studio template cleanup by making template rows title-first and moving style, format, and section details into the selected preview panel.
- 2026-05-22: Continued Studio rail maturity by making the Projects tool panel show a compact filtered project shelf instead of an empty decorative tab.
- 2026-05-22: Continued Canva-style Studio export work by adding tested Share and Download option models and surfacing them in the Export inspector with copy-link and suggested format actions.
- 2026-05-22: Continued Canva-style Projects polish by redesigning the Studio launcher canvas around an All projects hero search, Type/Category/Owner/Date filters, and a horizontal Recents thumbnail shelf.
- 2026-05-23: Continued Studio project-first maturity by adding a main-canvas template shelf, keeping template cards title-first, and replacing fragile separator glyphs with ASCII-safe Studio labels.
- 2026-05-23: Continued Studio consolidation by replacing launcher Notes/Docs/Sheets/Slides filter language with project-first Pages, Guides, Tables, and Decks labels while preserving the existing data routes.
- 2026-05-23: Continued Studio launcher cleanup by replacing the decorative Owner menu with a working Status filter for all, draft, and saved project shelves.
- 2026-05-24: Verified the latest Studio launcher instructions across sessions: the project page is project-first, the canvas preview panel is removed, a New project card sits with recents, and editing tools stay inside the editor workspace after a project opens.
- 2026-05-24: Continued Canva-style Studio editing by adding a collapsible icon rail/library drawer and a floating slide toolbar with working edit, color, effect, animation, position, notes, and timer actions.
- 2026-05-24: Continued Studio interaction hardening by making shared Studio buttons explicit non-submit controls and closing compact dropdown menus immediately after a user selects an action.
- 2026-05-24: Continued Studio menu polish by closing select-based compact menus after choices such as canvas, transition, animation, and layout selections.
- 2026-05-24: Continued Studio menu repeatability by resetting select menus after a choice so the same canvas, motion, or layout command can be run again later.
- 2026-05-24: Continued Studio menu accessibility by letting compact Studio menus close with Escape and return focus to the trigger.
- 2026-05-24: Continued Studio menu polish by closing compact menus when keyboard focus leaves the menu instead of leaving old dropdowns open.
- 2026-05-24: Continued Studio menu accessibility by adding menu and menuitem semantics to shared compact Studio dropdowns.
- 2026-05-24: Continued Studio menu accessibility by syncing compact menu expanded state with the real dropdown open state.
- 2026-05-24: Continued Studio menu accessibility by adding visible keyboard focus rings to compact Studio menu triggers and actions.
- 2026-05-24: Continued Studio menu accessibility by adding labels and visible focus rings to select controls inside compact Studio menus.
- 2026-05-24: Continued Studio context-menu polish by adding highlighted and keyboard focus states to shared right-click menu items.
- 2026-05-24: Continued Tutor cleanup by hiding the redundant all-task category, combining setup signals into one compact panel, and keeping prompt preview behind a single checkpoint.
- 2026-05-24: Continued Social cleanup by renaming the main social workspace tabs to plain Friends, Chats, Groups, Calls, and Games labels while preserving route compatibility.
- 2026-05-24: Continued profile maturity by saving avatar, about text, visibility, daily goal minutes, and public links through Settings and showing them on the Profile page.
- 2026-05-24: Continued Practice maturity by adding a real quiz archive path with an additive D1 migration, DELETE endpoint, and active-bank UI update.
- 2026-05-24: Continued Social simplification by reducing hub copy to Friends, Shortcuts, and Create labels while keeping chat, groups, calls, and games available behind compact controls.
- 2026-05-24: Continued navigation cleanup by removing the standalone Learn entry, routing Reviews into Practice, and keeping old /learn and /reviews paths compatible.
- 2026-05-24: Continued Dashboard polish by making metrics, weak topics, recent work, review queue, and agenda cards horizontally scannable with stronger color personality and compact quick actions below reviews.
- 2026-05-24: Continued Calendar polish by matching the compact study-calendar planning layout, adding colored event type controls, and showing selected-day time lanes.
- 2026-05-24: Continued Dashboard compaction by replacing XP with progress and planned hours, turning route actions into compact popovers, and keeping quick actions as their own horizontal mini strip.
- 2026-05-30: Continued project hygiene by removing the unused direct date-fns dependency after a source scan found no runtime imports, keeping the dependency graph smaller before larger major-version migrations.
- 2026-05-30: Continued root cleanup by aligning Docker build-context ignores with generated workspace outputs and adding a regression test so local caches do not bloat self-deploy builds.
- 2026-05-30: Continued dependency cleanup by removing unused scaffold-era UI packages after exact import scans and local gates confirmed the app no longer depends on those packages.
- 2026-05-30: Continued dependency hygiene by removing unused Univer and Zod package entries after source scans confirmed the current Studio and API code paths do not import them; future spreadsheet-framework work should add packages only when wired into a tested editor surface.
- 2026-05-30: Continued runtime alignment by moving Node type definitions from the Node 22 line to the latest Node 24 line used by CI and deployment, avoiding Node 25 APIs until the runtime itself moves.
- 2026-05-31: Continued dependency hygiene by removing stale Tailwind-era packages after source scans confirmed the app now uses the Tailwind v4 PostCSS plugin and `tw-animate-css` instead of direct Autoprefixer or `tailwindcss-animate` imports.
- 2026-05-31: Continued lockfile hygiene by deduping transitive AWS/Smithy patch versions and Node type consumers so installs resolve fewer duplicate packages without changing direct runtime dependencies.
- 2026-05-31: Continued Social performance cleanup by centralizing chat-thread signal parsing and using single-pass workspace counts so filtering, summaries, and status chips share one compact classification path.
- 2026-05-31: Continued Import Gateway optimization by parsing pasted learning material once into reusable line/count metadata for target detection, preview counts, fallback sheets, slide shaping, and title inference.
- 2026-05-31: Continued Social and Practice UX cleanup by changing dense all-in-one panels into focused workflow steps: Social now defaults to one active People/Chats/Groups slice, and Practice exposes Start, Live, Setup, and Drafts one section at a time.
- 2026-05-31: Continued Studio UX cleanup by making the project launcher step-based: Projects, Templates, and Formats are now selected one at a time instead of rendering every shelf and setup choice on the same screen.
- 2026-05-31: Continued Social code cleanup by removing stale command-center shortcut and call-mode helpers from the active workspace view after the page moved to focused People, Chats, and Groups steps.
- 2026-05-31: Continued Social UX cleanup by folding invites into the single search flow: typing an email now opens a compact confirmation instead of showing a permanent separate invite form.
- 2026-05-31: Continued Practice UX cleanup by turning the setup area into one small Arena, Styles, Modes, or Actions step at a time instead of rendering every setup drawer together.
- 2026-05-31: Continued AI Tutor UX cleanup by merging repeated run details into the summary chip row with hover details, keeping prompt preview and run actions closer together.
- 2026-05-31: Continued Social simplification by removing the duplicate New dropdown from the Social home search bar and keeping groups, calls, and games in the focused results/sidebar flow.
- 2026-05-31: Continued Studio chrome cleanup by removing a duplicated pane summary chip and making the inspector render inside its existing responsive column instead of hiding its own contents on smaller screens.
- 2026-05-31: Continued compact UI cleanup by tightening shared empty states and shortening Files, Practice, and Studio empty-copy so pages read more like product surfaces than instructions.
- 2026-05-31: Continued Dashboard cleanup by removing repeated route copy and shortening section help text so details live behind info controls instead of filling the main page.
- 2026-05-31: Continued Practice cleanup by shortening empty states, draft copy, and learning-loop cards so Practice stays step-based instead of reading like documentation.
- 2026-05-31: Continued AI Tutor cleanup by shortening result, gateway, and import helper copy while keeping the grouped task/context/output controls intact.
- 2026-05-31: Continued Settings and Progress cleanup by shortening section help, compacting empty copy, and replacing a non-ASCII route-chip separator with an ASCII-safe divider.
- 2026-05-31: Continued project-structure cleanup by adding local development logs to workspace cleanup and Docker ignores, while documenting why root source folders stay in place until a dedicated `src` routing migration.
- 2026-06-02: Fixed the live Cloudflare raw-render regression by moving PostCSS/Tailwind config to a runtime `.mjs` file, explicitly registering Tailwind source scanning, and adding a favicon fallback for the Worker.

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
