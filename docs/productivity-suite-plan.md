# LEARN Productivity Suite Plan

Status: Active
Last updated: 2026-05-16

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
| Templates | Planned | Add suite-wide template picker with colors, fonts, and slide master settings. |
| Trash/folders | Planned | Add restore/delete-forever/empty-trash and move-to-folder flows where schema supports it. |
| Tests | In progress | Local gates are `pnpm test`, `pnpm lint`, and `pnpm build`; browser checks are run on key flows. |

## Progress Log

- 2026-05-16: Added the tracked Productivity Suite plan.
- 2026-05-16: Improved Studio explorer records with type-colored cards, per-action loading labels, local error display, and archive confirmation.
- 2026-05-16: Verified Studio explorer actions locally, pushed to `main`, and confirmed GitHub CI plus Cloudflare Worker deploy. Live smoke passed for Studio, Notes, Docs, Sheets, Slides, Practice, and AI routes.
- 2026-05-16: Began Studio declutter redesign by collapsing suite type switching, edit/export/layout controls, record actions, inspector tabs, templates, and rich-text tools into compact menus while preserving the same functions.
- 2026-05-16: Continued editor-specific declutter by grouping sheet row/column/fill/formula tools and slide design/motion/insert/arrange/notes tools into compact menus.
- 2026-05-16: Started Practice declutter by moving mode selection, filters, timer controls, and per-question actions into compact menus while keeping submit and progress visible.
- 2026-05-16: Started AI Tutor declutter by moving task modes, context filters, provider family, creativity, and token controls into compact menus with summary chips.
- 2026-05-16: Started Social workspace declutter by moving filters and secondary record actions into compact menus while keeping save and selected record context visible.

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
