# LEARN takeover verification — September 24

Scope: finish the G1–G8 takeover in `cleanup/stage-1`, preserving existing local
data and newer authorization boundaries. The [history reconciliation](./2026-09-24-assistant-history-reconciliation.md)
records the accessible Claude, WorkBuddy, ZCode and Codex sources. This report
follows through on that inventory; it does not claim access to deleted or
cloud-only conversations.

## Delivered behavior

| Area | Result and evidence |
| --- | --- |
| Run files | Shared Windows task dispatcher and menu, setup/start/test/check/build/preview/doctor wrappers, quoted paths, pinned pnpm and preserved exit codes. Existing local D1/R2 state retained. |
| Design editor | Existing design foundation now drives the visible multi-page editor. Serialized saves, local draft recovery, title/deep-link persistence, tools, layers, gestures and history share one model. Desktop create/save/library reopen, two-page edit/undo/redo, public share and 390×844 mobile layout verified. |
| Sharing | Legacy records normalize into the same renderer; hidden pages are excluded. Browser font measurement now matches editor wrapping. |
| Studio interoperability | Notes and decks create saved designs and open their destination. Page breaks survive document editing, HTML, DOCX and PDF. Deck exports retain authored objects, aspect, notes and hidden-slide semantics through the shared design exporter. |
| Imports | Bounded PDF/PPTX text import creates a new item after complete parsing. Browser verified two PDF pages and explicit page break; PPTX relationship order and separately related speaker notes persisted after reopening. Original layouts/media/animations and scanned-page OCR are outside this text importer. |
| Learning | Vault reads owned note blocks with bounded queries. Source actions carry source context without unrelated notes. AI quiz/review insertion uses actual destination APIs; activity/discussion outputs have explicit labels and validation. Selected provider families route correctly and unavailable providers do not produce fake usable content. |
| Social | Exclusive DM/group destinations, thread mismatch rejection, guarded history loads, authorized live refresh, reactions, recorded audio, sticker/GIF/meme tools and scoped expiring stories. Migration 0017 applied locally. |
| Calls/games | Peer/device-addressed signaling, competing-peer isolation, exact SDP preservation, recovery status, optional TURN credentials, chat game invitation/result broadcasts and private quiz hosting checks. Group calls invite one peer at a time. |

## Browser evidence

- Real note → saved two-page design handoff, with the source title and body.
- Real browser PDF import using the same-origin worker; two page contents and a
  page break. No OCR claim.
- PPTX fixture deliberately places `slide2.xml` first and relates notes through
  `notes9.xml`. The reopened deck retained both presentation order and notes.
- Actual `.pptx` download succeeded. This caught a previously untested deployment
  asset bug: the standalone PptxGenJS file required a missing JSZip global. Asset
  synchronization now copies its dependency-inclusive browser bundle.
  The downloaded archive contains two slides, expected text and speaker notes.
  A real PDF download also succeeded with two page objects.
- Two isolated local users: DM request had only its intended recipient; message
  and reaction arrived live. Sticker, GIF and meme sent through the UI; received
  sticker and recorded voice loaded successfully.
- Private story remained hidden from the other user; accepted-friends story was
  visible and carried the server's 24-hour expiry.
- Fake-device local voice call reached **Connected · Direct connection**; remote
  audio had a live track and readyState 4. Mute and end worked. This caught SDP
  sanitization stripping its required final CRLF; exact SDP is now retained with
  oversize payloads rejected.
- Live game invitation → two-user lobby → timed question → reveal → completed
  standings worked; the result arrived live in recipient chat. Browser tool delays
  meant no answers were submitted before this game's timer; correct-answer
  scoring is covered by tests and the separate real AI quiz journey.
- The real Ollama response created a quiz that scored 1/1. The same response
  created a review card, revealed its answer/explanation and was graded Good,
  clearing the due queue. This exposed a quiz-to-card conversion gap and three
  review navigation mappings; the deleted review view was restored selectively
  from history and all routes now reach it.
- Removed inactive Event/Mute/Translate/Notify composer entries that claimed work
  without implementing it. Actual call muting and message reactions remain.
- Local screenshots/fixtures are under ignored `output/playwright/`, including
  `editor-desktop.png`, `editor-mobile-tools.png`, `studio-note-to-design.png`,
  `pdf-content-import.png` and `reordered-export.pptx`.

## AI and infrastructure limits

The real local Ollama adapter answered a minimal arithmetic request with `4`
using `qwen3:8b`. The full UI then generated valid one-question JSON using a
short manual source and explicit request; quiz and review insertion both worked.
Earlier larger requests timed out under heavy CPU load at 60s and 180s and
displayed honest errors without an insertable fabricated answer. This verifies
the integration, not acceptable latency for every model or source size.

Local browser calls use fake media devices and a direct local connection.
Real microphones/cameras, separate WAN networks and deployed TURN are not proven
by those checks. TURN needs operator-provided URLs/secret; production AI needs
its own reachable configured provider. No production deployment, remote schema
migration, branch merge or remote resource cleanup is part of this delivery.

## Measured debloat

The requested audit scanned the import graph before and after integration:

| Measure | Baseline | Final |
| --- | ---: | ---: |
| Source/test files | 385 | 428 |
| Unused-export candidates | 49 | 12 |
| Orphan files | 10 | 0 |
| Internal-only export candidates | 390 | 384 |
| Unused dependency candidates | 10 | 10 |
| Mutual import candidates | 3 | 3 |

Five confirmed unused helpers were deleted: `createValueStore`, `useValueStore`,
`currentDesignMeasure`, `allDesignFontSpecs` and `designPagePicture`, including
their unused interfaces. The obsolete editor and duplicated Studio PPTX loader
were replaced by shared implementations. Design integration explains most of
the orphan/export reduction; it is not presented as thousands of deleted lines.

Remaining candidates include public type/helper contracts, tooling, type
packages, required peers and type-only locale relationships. Candidate counts
alone do not justify deletion. The source count grew for tested functionality.

Reproduce: `node ~/.workbuddy-ai/skills/code-quality-audit/scripts/deadcode.mjs . --format json`.
Local raw results: `.cache/takeover-deadcode-baseline.json` and
`.cache/takeover-deadcode-final.json`.

## Verification gates

`ops/run/check.bat` completed from `C:/Users/user/Downloads`, outside the checkout:
TypeScript passed and **1,067 tests passed**, zero failures/skips. Final log:
`.cache/takeover-final-check.log`. Earlier failures exposed a stale toolbar label
assertion and boundary fixtures; corrections were followed by the full passing run.

`ops/run/build.bat` also completed from outside the checkout: Next.js compiled,
TypeScript passed, all 87 static-generation tasks completed and postbuild CSS
validation passed. Log: `.cache/takeover-final-build.log`.

The build emits the known local Cloudflare binding-proxy warnings for internal
Durable Objects. The production entry exports those classes; local browser
realtime checks used the custom development hub. This is a successful Next.js
build, not proof of a deployed Worker. Nothing was deployed or merged.

## Delivery

Changes are separated into launcher, planning, document page-break, deployment
failure handling, development hydration, debloat, editor integration, sharing,
imports, AI destinations, Studio handoffs, SDP validation, social, export asset,
mobile typography, configuration and review-restoration commits. The final
documentation captures both the passing checks and their limits.
