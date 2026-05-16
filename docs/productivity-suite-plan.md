# LEARN Productivity Suite Plan

Status: Active
Last updated: 2026-05-17

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
| Architecture/performance | In progress | Keep TypeScript/React as the primary Workers runtime; isolate heavier Studio libraries behind Studio surfaces, debounce local drafts, virtualize long lists, and avoid adding another language runtime unless a measured bottleneck justifies it. |
| Templates | Planned | Add suite-wide template picker with colors, fonts, and slide master settings. |
| Trash/folders | Planned | Add restore/delete-forever/empty-trash and move-to-folder flows where schema supports it. |
| Tests | In progress | Local gates are `pnpm test`, `pnpm lint`, and `pnpm build`; browser checks are run on key flows. |
| Shell and calendar | In progress | Desktop sidebar is fixed for long pages. Calendar now needs to keep growing toward true date/time planning with month, day, agenda, and editing views. |

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
