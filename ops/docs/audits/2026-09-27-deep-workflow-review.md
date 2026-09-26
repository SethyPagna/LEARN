# Compact interface and nested workflow review

LEARN now keeps the current task in view and reveals secondary controls when
needed. This pass covers learning, practice, social, settings, administration,
files, AI and the Studio project/editor surfaces.

## Changes

- Reviews shows one question, then its answer and four rating choices. Queue
  details are optional. A successful grade is removed immediately; a failed
  queue refresh cannot expose it for duplicate grading. Refresh can be retried.
- Vault has a searchable desktop note list and a phone selector. Block saves
  prevent duplicate submission, preserve drafts on failure and disable edits
  while saving. Block actions use labelled icons.
- Graph prioritizes the selected topic and a mastery meter, with the topic
  list in a disclosure. Feed uses compact expandable lesson cards.
- Quizzes use one progress row, contextual options, a visual score and an
  optional review plan. Live games share colored mode tiles. Sprint labels
  correctly display 90 seconds as 1:30. Finished games hide active controls.
- Calendar connection explanations are optional; provider availability and
  automatic-update state remain visible.
- Social uses an in-page list/detail flow on phones. New group drafts no
  longer select an existing record automatically or lose selection after
  saving. Emoji, stickers, GIFs and memes occupy one picker at a time.
- Profile separates Shared and Achievements. Settings groups optional fields
  into disclosures, retaining all labels and editable values. Private
  artifacts are excluded from the Shared section.
- Provider administration retains test results after refresh, handles failed
  operations visibly and disables duplicate requests. Delete requires a
  second deliberate click.
- Studio libraries show actual content previews and have one main landmark.
  Canvas Magic uses Layout/Outline/Notes tabs; export choices are visual tiles.
  Document hydration stays outside undo history and React's effect flush.
- AI displays one formatted response with optional original text. Filters
  dismiss correctly, source actions reveal their tools and failed imports
  preserve their input. Clipboard failures no longer report success.
- File previews restore keyboard focus and appear in view on phones.
- A shared CSS selector incorrectly treated icon-plus-text buttons as icon
  buttons because CSS `:only-child` ignores text nodes. Removing its fixed
  width restores readable labels throughout the app.

## Verification

- `pnpm lint`: pass.
- `pnpm test`: 1,111 pass; no skipped or failed tests.
- `pnpm build`: pass, including emitted CSS validation.
- Playwright route audit: **58/58 layouts pass**, covering 29 workspace routes
  at 1440×900 and 390×844, plus 11 shell/menu assertions.
  Checks HTTP status, document overflow, unnamed visible controls, clipped
  button labels, main landmarks and uncaught page errors. It also exercises
  Add keyboard navigation, global search, notifications and minimized-sidebar
  section navigation.
- Learning: 21 checks, including failed grade/block/answer saves, failed
  refresh after a successful grade, retry recovery, keyboard graph selection
  and expanded phone layouts. Writes are intercepted to preserve user data.
- Practice: quiz answer/navigation/submit/retry; sprint answer locking and
  restart; live mode/lobby/end/leave; calendar month/year/week/filter/connection
  help and create/save/reopen/delete with notes. The temporary event is deleted.
- Social: 49 checks covering settings fields/themes, profile disclosures,
  media/story drafts, phone list/detail/back, nested group tabs and draft/save
  behavior, admin tabs and provider success/failure/pending states. Group and
  provider writes are intercepted; no messages, invites or stories are sent.
- Editor: 22 checks covering AI menus/results/import failure, real local file
  upload/preview/focus/delete, stacked canvas pages/duplicate/undo/Magic,
  document duplicate/undo and phone layouts. The upload fixture is removed.
- Actual canvas PDF export: downloaded, identified as PDF and verified as
  two pages. Both pages were rendered with Poppler and visually inspected:
  text, colors, shadows, wrapping and positions remain intact without clipping.

Screenshots, the exported PDF and browser reports are under ignored
`output/playwright/`. The broad initial audit found missing message-search
labels, an extra main landmark and the shared clipped-button defect. The
long-running development process later exhausted its 4 GB Node heap; the
preview was restarted and interrupted suites rerun on the fresh process.
Production build warnings about the local Durable Object proxy remain as in
the previous editor audit; this pass does not deploy the Worker.

## Repeat the browser checks

Start `pnpm dev`, then open a named Playwright CLI session:

```powershell
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review open http://localhost:3000/login --browser=chrome
```

Sign in to the local demo admin account using the CLI's snapshot and fill
commands. Create `output/playwright/routes` before running the scripts. Each
script is a JavaScript function evaluated by the CLI, which is why these five
files are explicit exceptions to the repository's TypeScript convention.

```powershell
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review run-code --filename ops/scripts/test/playwright-routes.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review run-code --filename ops/scripts/test/playwright-learning.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review run-code --filename ops/scripts/test/playwright-practice.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review run-code --filename ops/scripts/test/playwright-social.js
npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=learn-review run-code --filename ops/scripts/test/playwright-editor.js
```

The route report must return `failed: 0`; workflow scripts throw on failed
assertions. They require the seeded local notes/quizzes. Editor checks also
use the two-page **Page workspace review** canvas and **Writing pages review**
document from the preceding format-aware editor audit. Practice submission
and an ended empty live session remain in local demo history. Scripts reject
non-local origins; they are not production smoke tests.

## Coverage limits

This is a route/layout sweep and a representative nested-workflow regression
suite, not proof of every possible state combination. Public tokenized
share/invite pages, other user roles, multiplayer across accounts, live
microphone/camera/voice, external calendar OAuth and two-way writes, external
AI generation, real provider administration, deployment and installed-PWA
behavior were not exercised. Existing API/unit tests remain in place for
their separate contracts. No new cloud infrastructure or provider activation
is claimed by this interface pass.
