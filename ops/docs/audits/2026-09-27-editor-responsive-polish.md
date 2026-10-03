# Editable landing demo and responsive editor polish

The landing Create preview now uses Studio's real renderer, selection/gesture engine and undo history. It supports text and shape editing, fonts and colors, pointer move/resize/rotation, duplication, layer ordering, deletion, undo/redo/reset and PNG download. Switching preview tabs preserves the design. The demo is anonymous and local to its mounted page; downloading keeps the image. Opening Studio does not transfer the demo document.

## Layout and navigation

- The collapsed sidebar brand expands navigation in place. The redundant expansion button below it is removed; expanded navigation retains its collapse control.
- Studio uses the available workspace width, and the shell uses dynamic viewport height. Chat no longer stops growing at 1000px and retains reachable message/composer controls in short windows.
- Opening projects/quizzes resets document scroll after the navigation guard accepts the transition. Back/Forward handling is unchanged. Shell horizontal clipping no longer establishes an unintended sticky-scroll ancestor.
- Studio's library breakpoint now matches its 1280px desktop grid. Below 600px height, Canvas preserves a usable work area and allows vertical scrolling of the workspace chrome; optional controls remain available.

The supplied screenshot's apparent 1440×900 app boundary was not reproduced as a source-level cap. Current-tab inspection was unavailable, so its exact cause is unconfirmed. Independent contexts verified full-window layout, live resizing, sidebar height and Studio width up to 2560px.

## Editing correctness

- Native toolbar fields retain their keys; Ctrl/Cmd+S saves from canvas text and title fields. Inline text blur respects the intended focus destination.
- Locked objects do not accept toolbar style changes. A fully locked selection exposes Unlock.
- Image double-click enters crop. Picture links from this site are stored as portable relative paths. External picture links produce upload guidance instead of invisible placeholder objects; the existing image CSP is preserved.
- Resize popovers fit 320px windows, and fit/zoom-out do not jump up to 100% when chrome consumes available space.
- A save acknowledgement only removes the matching stored draft. A newer draft from another instance remains available; this does not implement multi-user server conflict resolution.

Independent agent reviews covered responsive shell/Chat, canvas controls/save behavior and the shared-engine public demo. Replaced mock artwork CSS and an unused stale sidebar-width constant were removed.

## Verification

Implementation commits: `ff8d6f8` (layout/navigation), `af315bf` (editor correctness), `48a75ff` (editable public preview).

| Check | Result |
| --- | --- |
| Public demo | 174 assertions; 15 Light/Dark/Color viewport combinations |
| Editor/layout edges | 50 assertions; 20 layout samples, including 390×320, 844×320, 1199/1200/1279/1280px and 2560px |
| Public entry/account regression | 48 layouts; 76 interaction checks |
| Studio regression | 114 assertions; 15 theme/viewport combinations |
| Chat regression | 74 assertions; 15 theme/viewport combinations |
| Automated tests | 1,134 passed |
| TypeScript | Passed |
| Production build and generated CSS | Passed |

All five browser suites completed without uncaught page exceptions. Interaction checks use real pointer/keyboard events and rendered elements. Canvas persistence and error/queue checks use intercepted local fixture requests. Chat/auth/invitation writes are intercepted; no messages, invitations or access requests are sent. Actual user projects and local D1/R2 state are preserved.

The exported demo PNG was downloaded, decoded and read back from disk: 1920×1200, 199,680 bytes, SHA-256 `81553de775c819ebaa2bfb9b4eb5f3a4db69569c37fa9f97444904767e12f1a8`.

Detailed results: [browser results](2026-09-27-editor-responsive-results.json). Local visual artifacts remain under `output/playwright/`, including `public-demo/initial.png`, the three-mode demo screenshots, `editor-interactions.png`, `editor-short-390.png`, `editor-short-844.png`, `editor-resize-phone.png`, `studio-wide-responsive.png` and `writing-library-breakpoint.png`.

Repeat against a running local dev server with the pinned Playwright CLI (`@playwright/cli@0.1.21`). `playwright-demo.js` creates an anonymous context; `playwright-editor-edges.js` and `playwright-chat.js` create contexts from a signed-in demo session. The edge suite requires the existing Writing pages review fixture for its library breakpoint check. Run `playwright-public.js` in a dedicated anonymous context and `playwright-studio.js` in a dedicated signed-in context. Scripts live in `ops/scripts/test/`.

The production build retains the existing Cloudflare Durable Object proxy warnings. The first postbuild check still expected the replaced `100vh` utility; it was updated to require `100dvh`, then the build was repeated. One stale development CSS compilation was refreshed before re-running the short-window checks. These checks cover representative desktop Chromium interactions and layout, not every device or external integration. No merge, remote migration or manual deployment was performed.
