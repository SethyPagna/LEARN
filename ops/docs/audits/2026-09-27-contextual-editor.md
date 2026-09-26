# Selection-driven editor refinement

The user's Canva screenshots show a compact toolbar above the artwork that
changes with the selected object. This follow-up replaces the persistent right
inspector introduced in the earlier editor pass.

- A single floating toolbar sits above the canvas. Page selection shows page
  background/style controls; text shows typography; shapes show fill/outline;
  images show frames/filters. Mixed selections show only shared controls.
- Size and coordinates live in Position. Less-used text options and object
  actions use contextual popovers. Layers remains available from the left rail.
- Selection and page changes dismiss the previous object's tool popovers.
- Notes is a button beside the page count and zoom, opening a page-specific
  editor. The permanently occupied notes row is removed.
- The plain neutral work surface, small toolbar and optional asset panels leave
  more of the editing area clear. Existing manipulation, history, saves and
  exports use the existing engine; no backend or canvas-library migration is
  included in this focused interaction change.

## Verification

- TypeScript passes; 1,104 tests pass, including four rendered-toolbar tests for
  page, text, shape/image and mixed selection. Advanced controls start closed.
- Browser checks exercised position changes and undo, text-to-shape selection,
  stale-menu dismissal, image-frame controls, object duplication/undo, and notes
  on separate pages. The review-only frame was removed; deletion, undo and redo were verified before saving and reloading.
- Production build and emitted CSS validation pass.
- Final desktop and 390px phone checks cover the floating toolbar, geometry
  popover, notes placement, save/reload, and document horizontal overflow.
- Local visual evidence is saved under `.cache/design-review/contextual-*`.

The earlier restoration and external-provider limitations still apply. The
provided reference screenshots informed interaction hierarchy and disclosure;
this does not claim Canva feature parity or new collaboration/AI capabilities.
