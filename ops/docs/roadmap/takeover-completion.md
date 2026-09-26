# LEARN takeover completion goals

Started and completed: 2026-09-24. Branch: `cleanup/stage-1`. Status: complete.

Delivery: [draft PR #1](https://github.com/SethyPagna/LEARN/pull/1).

The current instruction is to continue until all agreed goals are complete.
Checkpoints provide reviewable commits and progress, not automatic stopping points.
Source scope is the [history reconciliation](../audits/2026-09-24-assistant-history-reconciliation.md).
Sequencing follows the [takeover council](../audits/2026-09-24-ai-council-takeover.md).

| Goal | Completion evidence | Status |
| --- | --- | --- |
| G1 Local launchers | Setup/start/check/build/preview menu, pinned package runner, external working-directory support and truthful failure codes | Complete; outside-checkout check passed |
| G2 Historical parity | Missing Studio/Social behavior mapped to current implementations; bounded PPTX/PDF text import restored; no old editor replacement | Complete within accessible history scope |
| G3 Multi-page editor (P2b) | Unified model/controller/renderer, gestures, layers, undo/redo, serialized saves and draft recovery; desktop save/reopen/share and 390px phone checks | Complete |
| G4 Sharing and interoperability (P2c) | Multi-page share, note/deck to design, document page breaks, object-aware export; real PDF/PPTX import and PPTX download | Complete |
| G5 Learning workflow (P3) | Owned Vault block readback, source handoff, provider routing/Ollama, quiz/review/activity/discussion destinations | Complete; real Ollama quiz scored 1/1, card revealed and graded |
| G6 Social media (P4) | Exclusive DM/group routing, recorded audio, image/GIF/sticker/emoji/meme tools, reactions and scoped 24h stories | Complete; two-account local browser evidence |
| G7 Calls and games (P5) | Peer/device addressing, ICE recovery, optional TURN credentials, local connected call and live game delivery | Complete locally; external network limits recorded |
| G8 Quality and delivery (P6) | Council outcome, measured cleanup, 1,067 tests, types/build/CSS, browser evidence, documentation, commits/push and review PR | Complete; branch pushed and draft PR #1 opened |

## Evidence log

- `7be1cc5`: production Next.js build and postbuild CSS check passed.
- Launcher slice: shared runner passed pinned-pnpm TypeScript and all 1,000 tests.
- Final outside-checkout launchers: TypeScript, all 1,067 tests and the production
  build passed, including 87 static-generation tasks and CSS output validation.
- Static baseline: 385 code files, 49 unused-export candidates, 10 design orphans.
  These design pieces are intentional pending integration; do not delete them.
- Final analyzer pass: 428 code files, 12 unused-export candidates, zero orphans.
  Five confirmed unused helpers and two obsolete implementations were removed;
  tooling/type dependency candidates were retained.
- Current evidence and infrastructure limits are in the
  [takeover verification report](../audits/2026-09-24-takeover-verification.md).

## Rules for closing goals

- A visible action must perform the advertised operation, preserve ownership and
  return a usable destination. Helpers or status messages alone do not complete it.
- Historical completion statements do not substitute for current behavior checks.
- Provider-backed AI needs an actual reachable configured provider for live proof.
  Unavailable infrastructure remains an explicit verification gap.
- Two-user/call and browser tests must separate proven local behavior from external
  network/device conditions. Do not label untested WAN calls as verified.
- Record checks, commit IDs, remaining limitations and next work after each slice.

## App-wide design follow-up — 2026-09-25

- [x] Extend the compact shell and consistent navigation across the app.
- [x] Redesign Files, AI, Practice, Chat, Settings, Vault, Progress and Admin layout.
- [x] Simplify the public entry and sign-in experience.
- [x] Add installable web app controls and correctly sized desktop icons.
- [x] Remove replaced UI and confirmed unused helpers.
- [x] Verify phone/tablet/desktop layouts, key interactions, tests and build.

Evidence and environment limits: [app-wide design overhaul](../audits/2026-09-25-app-design-overhaul.md).

## Calendar and preview follow-up — 2026-09-25

- [x] Remove duplicate page chrome and shorten the Add menu.
- [x] Preview files beside their names and collapse/restore navigation automatically.
- [x] Compact Calendar, separate year/month controls, and persist visibility filters.
- [x] Implement Google, Outlook and iCloud read/write adapters with secure storage.
- [x] Verify local UI, automated provider contracts, TypeScript and production build.
- [ ] Activate real provider accounts and verify live round trips after server
  credentials and user authorization are supplied.

Evidence: [calendar and preview refinement](../audits/2026-09-25-calendar-connections-preview.md).

## Learning, practice and social refinement — 2026-09-25

- [x] Tighten the sidebar and account controls; keep section tabs available in pages.
- [x] Simplify Calendar, Vault, Progress, Graph and Feed.
- [x] Add six coordinated Practice designs and one-question navigation.
- [x] Reorganize Social browsing, details and editing; compact Chat and stories.
- [x] Fix responsive interactions and remove replaced guides and unused helpers.
- [x] Verify browser behavior, TypeScript, the test suite and production build.

Evidence: [learning and social usability](../audits/2026-09-25-friendly-learning-social.md).

## Editor and compact workspace follow-up — 2026-09-27

- [x] Restore the last committed source after the user confirmed the recovery.
- [x] Rebuild the Canvas workspace around contextual properties and Focus.
- [x] Add preview-first templates and eight editable visual directions.
- [x] Tighten navigation and Social; refresh project names after saves.
- [x] Verify editor interactions, desktop/phone layouts, tests and production build.
- [ ] Activate and verify real calendar provider accounts (existing external dependency).

Evidence and restoration limits: [editor overhaul](../audits/2026-09-27-editor-overhaul.md).
