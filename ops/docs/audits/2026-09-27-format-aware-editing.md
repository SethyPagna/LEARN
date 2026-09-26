# Format-aware editing

The supplied references distinguish a presentation stage with a filmstrip from
a vertically scrolling workspace for printable and social designs. LEARN now
uses that distinction: presentation formats retain the single stage; A4,
Letter, posters, social and custom designs show a page stack. Each page has
compact move, visibility, duplicate, delete and add controls. The same tested
object engine, history, saves and exports remain in use.

Text color and effects open in a single side panel. Effects use visual samples;
the toolbar continues to follow text, shape, image and mixed selections. Notes
remain beside the page count, and thumbnails are optional for page designs.

Writing documents now have real page nodes in one TipTap document, keeping a
shared undo history. Page controls sit above each sheet and document statistics
move into an optional details popover. Saves serialize to the existing HTML
page-break representation, preserving compatibility with Word/PDF exports.
Page breaks split paragraphs at the cursor; breaks inside lists/tables follow
the whole block to preserve its structure. Pages can be added, duplicated,
reordered and deleted. Image selection shows image tools, table operations are
contextual, and image URL/description editing uses an in-app form. Export lists
the available formats directly.

## Verification

- TypeScript, all 1,111 tests, production build and emitted CSS checks pass.
- Regression coverage: blank pages and tables survive editing conversion;
  page reordering participates in undo; cursor-based breaks preserve text.
- Browser: canvas duplication/reorder, text editing, color/effects persistence,
  cross-page drag and exact-position undo, saving/reopening, and preserved
  presentation filmstrip. Document typing, page actions, deletion/undo,
  cursor break/undo, save/reload, table insertion and image tools exercised.
- Canvas light/dark reviewed. Canvas and documents checked at 390 × 844 with
  no document overflow; the phone footer ends at the viewport edge.
- Existing PDF/Word export round-trip tests pass. In-app browser download-event
  capture timed out, so this pass does not claim an inspected browser download.
- Screenshots: `.cache/design-review/contextual-pages-desktop.png`,
  `contextual-pages-phone.png`, `writing-pages-desktop.png`,
  `writing-pages-phone.png`.

## Scope

Writing pages use explicit boundaries and grow with their content; this is not
automatic Word-style pagination. Canvas pages still share a single design size.
Existing PDF imports remain bounded text imports, not arbitrary PDF object
reconstruction. This editing pass adds no collaboration server, stock-photo
provider, MP4 renderer or generative-image service. Existing local Durable
Object proxy warnings remain; no remote migration or deployment was performed.
