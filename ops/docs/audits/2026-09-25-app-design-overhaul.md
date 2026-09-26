# App-wide design overhaul

The app now uses a shared compact layout: labelled navigation, a quiet header,
list-based browsing, and optional detail panels. This extends the Studio,
Canvas and Calendar redesign recorded in the September 24 reports.

## Delivered

- Shared shell: smaller navigation rows and icon wells, one desktop creation
  menu, quieter panels, consistent workspace tabs and density-aware controls.
- Files: searchable rows, file-type filters, list/grid switch, and details that
  open on selection. On smaller screens, details replace the list until closed.
- AI tutor: the prompt is the primary surface; tools and prompt diagnostics
  open on demand. Existing task, gateway and output actions remain available.
- Practice: a compact set selector on phones and tablets; study tools and saved
  attempts live in a disclosure below the active practice area.
- Social: shared section tabs, conversation list/detail navigation on phones,
  a normal message composer, and optional media/stories/prompts. Chat menus use
  the existing portalled popover so they cannot be clipped by the chat window.
- Settings: category navigation, simpler profile fields, existing appearance
  controls, and desktop installation guidance under Appearance.
- Vault and Progress: shorter headers and direct actions; progress metrics are
  visible without opening a disclosure. Admin records use readable rows, with
  raw option policy collapsed.
- Public entry and sign-in: concise product introduction, clearly labelled
  example workspace, focused account forms, and recoverable network errors.
- Installable desktop experience: 192/512 PNG icons, a separate maskable icon,
  standalone manifest scope/identity and Projects/Calendar/AI shortcuts. The
  installation button appears only when the browser supplies an install event.
  Dismissal and failure clear the consumed event; errors are shown in Settings.

## Removal review

Removed the replaced animated intro and transition link, the unused Social
command-center implementation and its helpers, and unused imports/helpers in
the changed workspaces. Retained the separately routed classic intro/showcase.
Reduced-motion guards still cover the remaining animated surfaces; the new
public page has no custom motion to disable.

## Verification

- TypeScript passed; all 1,069 tests passed. Manifest checks now verify that
  every referenced icon exists and that the new PNG dimensions are correct.
- Production build passed, including static generation and generated CSS
  validation. Existing local Durable Object binding-proxy warnings remain.
- Browser at 390×844: Studio, Files, AI, Practice, Chat, Settings, Calendar,
  Vault, Progress, Graph, Groups and Feed had no page-wide horizontal overflow.
- Browser at 1440×1000 in dark mode: the same main surfaces plus Admin returned
  HTTP 200 and had no page-wide horizontal overflow. Light layouts were also
  inspected, along with mobile and desktop public entry/sign-in.
- Exercised Files select/close, search/reset and list/grid; AI Tools open/close;
  mobile Chat start/back; attachment menu bounds and Escape; desktop back-button
  visibility; sign-in password reveal and recovery from an intercepted network
  failure. No messages or access requests were sent during these checks.
- Simulated browser install events verified dismissal and failure behavior.
  This is component behavior evidence, not proof of a native OS installation.
- Production preview checks passed at phone, tablet and desktop widths: Admin,
  Settings, Practice, Files and Studio returned HTTP 200 without horizontal
  overflow or uncaught page errors. All six manifest icons returned HTTP 200;
  the service worker activated with the root scope. The plain Next.js production
  server does not host this project's local WebSocket upgrade bridge, so inbox
  connections retried there; restore `pnpm dev` for the full local experience.
- Local screenshots are under ignored `output/playwright/`, including
  `desktop-dark-*.png`, `mobile-app-*.png`, `desktop-public.png` and
  `mobile-chat-attach-fixed.png`. Some early screenshots predate the final
  mobile Practice selector and Admin row polish.

## Scope and remaining environment checks

Desktop support is the installable web app, not a separate Windows executable.
Native install UI depends on the browser and its eligibility checks; no OS
installation was performed. The service worker continues to exclude private
API responses and authenticated HTML from caches. Offline editing is not added.
Appearance preferences remain browser-local. Deployment, migration, WAN calls
and provider constraints from the earlier takeover report still apply.

Installability references: [MDN installable PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
and [triggering installation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt).

## Commits

- `44958bc` — compact navigation and installable app controls.
- `ab4bff9` — Files, AI, Practice and responsive Social layouts; unused UI removal.
- `93c35dc` — Settings, Progress and Admin simplification.
- `613aa2e` — public entry, account forms and sign-in network recovery.

## Theme and editor navigation refinement

The follow-up goal replaces the blue-black/sand feel with white and neutral
charcoal surfaces, a restrained indigo primary action, and consistent section
and project-type colors. Account, theme and notifications share the bottom of
the desktop sidebar; the same controls move to the header on smaller screens.
Appearance still offers Light, Dark, System and accent choices.

Studio keeps its single Add menu and compact project rows, with a small resume
panel and colored paper illustration. Opening a project collapses navigation
to an icon rail and adds a searchable project list beside the editor. The
project list becomes a dropdown on phones. Returning to Studio restores the
ordinary sidebar preference. Shell navigation waits for the active editor's
save result before switching projects. Canvas deep links show an opening state
instead of briefly displaying the old template lobby.

Project loading is shared between the lobby and editor browser. Draft/server
recency uses parsed UTC timestamps, and display times now interpret SQLite
timestamps as UTC, fixing newly saved work appearing eight hours old in Hong
Kong. The skip-link check now finds the actual Sidebar JSX tag instead of
matching a TypeScript generic name.

Validation: 1,073 tests and TypeScript passed. Desktop white/charcoal layouts,
sidebar account/notification popovers, mobile project search, note-to-canvas
switching and sidebar restoration were inspected in the browser. A Canvas
title edit survived leaving and reopening the project; its original title was
restored. Viewport overrides were reset. Production build and generated CSS
checks passed, with the existing local Durable Object proxy warnings.

The browser check also exposed a worker left by the earlier production preview
serving stale development CSS. Local Next assets now bypass its cache, and
development refreshes an already installed LEARN worker without installing a
new one. The regression test covers localhost, IPv4 and IPv6 loopback origins.
