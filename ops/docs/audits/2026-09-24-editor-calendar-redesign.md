# Studio editor and calendar redesign

The editor now occupies the full window. Project navigation stays in Studio;
editing opens a compact document header, menus, a working surface and page
controls. Existing projects and the shared Add menu remain the entry points.

## Delivered

- Notes and documents: one formatting strip, responsive paper, page controls,
  optional library/inspector, and imports inside File. Menus use the shared
  floating popover so scrolling toolbars cannot clip them; keyboard focus,
  arrow navigation and Escape remain available.
- Sheets: column letters, row numbers, an active cell reference and formula
  field. Existing formulas, import and row/column actions remain available.
- Slides: compact thumbnail strip, focused stage and optional Properties.
  Removed duplicate navigation over the slide itself; titles wrap on phones.
- Canvas: document header, Insert/View menus, contextual formatting, optional
  page strip, zoom and a full-height stage. New blank canvases use plain white
  paper. Existing artwork retains its theme. Returning home waits for a
  successful save; failed saves keep the editor and draft available.
- Calendar: separate month, week and agenda views, selected-day details, and
  an accessible event dialog. Event creation/editing, completion, duplication,
  deletion, reminders, study suggestions and calendar export remain available.
- Removed the old calendar implementation and its unused field components.

## Draft-loading correction

Repeated save/reopen checks exposed an initial-state race: the draft effect
could enqueue blank editor state with a newly loaded project's ID before its
content had hydrated. That stale pending write later replaced the local draft.
Hydrating a project now suppresses draft scheduling for that render. Reopening
the same saved document repeatedly retained its title, text and page break.
Server copies were intact throughout the check.

## Verification

- TypeScript and 1,069 tests passed using the Windows check launcher. Menu
  structural guards were updated for the shared popover implementation.
- Production build passed: compilation, TypeScript, 87 static-generation tasks
  and generated CSS validation. Existing local Durable Object binding-proxy
  warnings remain; this does not verify a deployed Cloudflare Worker.
- Browser checks covered all five editor types, saved server content and
  reopening, document page breaks, heading formatting through the new menu,
  canvas text insertion and multiple pages, sheet cells/formulas, slide title
  and body, and the optional Properties panel.
- Calendar creation, title edit, completion, duplication and deletion passed;
  month/week/agenda switches and the event dialog were exercised.
- Canvas save requests were deliberately aborted: Back kept the editor open,
  and saving/returning succeeded after requests were restored.
- Desktop (1440px) and phone (390px) screenshots were inspected. Documents fit
  without internal horizontal overflow at default zoom; canvas/calendar had
  no page-level horizontal overflow. Phone slide titles remained visible.
- Verification projects were archived and verification events deleted. Existing
  user records were retained. Screenshots and command logs remain in ignored
  `output/playwright` and `.cache` directories.

This is an editor and calendar UI redesign; it does not replace their storage,
document engines, authored artwork or import/export formats. Remote deployment
and real external calendar subscription delivery are outside these local checks.
