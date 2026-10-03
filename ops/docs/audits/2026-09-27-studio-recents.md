# Studio content previews

The project categories and search now share the top of the Studio page. The
decorative recent-project banner is replaced by a horizontal row of real
project previews, ordered newest-edited first. The full list remains below.

Previews reuse content already returned by the project APIs and local canvas
drafts: the first visible canvas/slide, opening document or Markdown blocks,
and sheet cells. They are read-only and lazily rendered near the viewport.
Document previews are bounded content excerpts, not full-fidelity page captures.
Supported spreadsheet formulas resolve; unsupported expressions remain visible.
Empty or malformed records use an explicit empty/unavailable preview.

Search and categories filter both the cards and the list. Cards support touch,
trackpad, keyboard focus and previous/next controls, with disabled edge controls
and reduced-motion support.

Navigation counts are red numerals attached to their icons in expanded and
collapsed modes. Notification counts use the same treatment. The separate
sidebar footer connection indicator and hide control are removed; the top
sidebar toggle and account connection state remain available.

## Verification

- TypeScript and 1,108 tests pass, including four preview checks for real HTML
  content without executable markup, Markdown structure, sheet formulas and
  honest empty states.
- Production build and emitted CSS validation pass.
- Browser checks: next/previous boundaries, category and search filtering,
  empty search, opening the correct canvas, expanded/collapsed sidebar, and
  390px phone layout without document horizontal overflow.
- Local screenshots: `.cache/design-review/recents-desktop.png` and
  `.cache/design-review/recents-phone.png`.
