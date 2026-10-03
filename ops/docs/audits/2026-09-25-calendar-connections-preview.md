# Calendar connections and file preview refinement

## Delivered behavior

- One page heading: desktop content owns the title; mobile retains the compact
  navigation header. Duplicate Studio/Calendar/Files headings are removed.
- Add menu uses grouped names and coordinated icons, with explanatory copy in
  tooltips rather than paragraphs in every row.
- Files open in an adjacent preview panel without route navigation. Opening a
  preview collapses navigation to icons and keeps a name-only file list visible.
  Closing restores the ordinary sidebar preference. Phone previews use a closeable
  overlay panel. Image, audio/video and browser PDF rendering are supported;
  DOCX/XLSX/PPTX use bounded text previews, not original document layouts.
- Calendar has a compact month grid, separate year/month arrows, category toggles,
  per-calendar toggles when connected, and a short event form with optional details.
- Google, Outlook and iCloud adapters support direct reads and writes, encrypted
  user-owned connections, read-only permissions, conflict detection and automatic
  refresh while open. Subscription/download remain under More options.

## Verification

- TypeScript passed and all **1,095 tests** passed.
- Production Next.js build and generated CSS validation passed. Existing internal
  Durable Object proxy warnings remain; this does not verify a deployed Worker.
- New automated coverage: authenticated connection summaries omit credentials;
  user-scoped disconnect/event access; encrypted credential owner binding; provider
  pagination and unsafe next-link rejection; UTC/all-day payloads; edit conflicts;
  preservation of Outlook rich notes; Apple event/occurrence updates; PDF-only
  inline response headers.
- Browser checked separate year/month movement; short Add form and optional
  details; category hiding and persistence after reload; setup-needed states;
  Apple connection form after restarting with the local encryption key.
- Browser checked image preview with a real existing 256×256 PNG; filename list,
  automatic rail collapse, close/restore, and no route change. Phone preview and
  calendar checked at 390×844, with no page-wide calendar overflow. Viewport reset
  after testing. No new provider event was submitted.

## Remaining activation and verification

Migration 0018 was applied only to local D1. A random local encryption key exists
in ignored `.env.local`; no secret is committed. Google/Microsoft application
credentials and actual account authorization are still required. Apple is locally
ready for the user's app-specific-password authorization. No live provider account
was connected or modified. Background refresh while the app is closed is not
implemented. Office/PDF preview rendering needs further real-file browser coverage;
image preview and the PDF response route were verified in this refinement.

Follow the [calendar connection setup guide](../operations/calendar-connections.md)
before production activation and live provider acceptance tests.
