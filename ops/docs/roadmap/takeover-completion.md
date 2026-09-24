# LEARN takeover completion goals

Started: 2026-09-24. Branch: `cleanup/stage-1`. Status: active.

The current instruction is to continue until all agreed goals are complete.
Checkpoints provide reviewable commits and progress, not automatic stopping points.
Source scope is the [history reconciliation](../audits/2026-09-24-assistant-history-reconciliation.md).
Sequencing follows the [takeover council](../audits/2026-09-24-ai-council-takeover.md).

| Goal | Completion evidence | Status |
| --- | --- | --- |
| G1 Local launchers | Setup/start/check/build/preview menu; correct local config path; failing commands preserve exit status; actual check run | Implemented, verification underway |
| G2 Historical parity | Map missing June requirements to current functionality or specific recovery work; preserve useful behavior without replacing newer security | Comparison recorded; implementation follow-through remains |
| G3 Multi-page editor (P2b) | Create/open/edit two-page designs; text, drag/resize/rotate/snap/crop, group/layer actions, undo/redo, upload/drop, draft recovery, save/reload, phone layout | In progress |
| G4 Sharing and interoperability (P2c) | Visible-page share preview; notes/decks to design; document page breaks preserved; faithful deck export with objects/notes/hidden pages | In progress |
| G5 Learning workflow (P3) | Owned Vault block readback; context handoff; selected provider routing and local Ollama option; real playable quiz/review cards; honest setup/failure state | In progress |
| G6 Social media (P4) | Private DM/group routing first; recorded voice messages; image/GIF/sticker/emoji tools; meme flow; scoped expiring stories | Boundary repair in progress; expansion pending |
| G7 Calls and games (P5) | Peer-addressed call negotiation, competing/rejected peers isolated; ICE recovery/TURN configuration; real-time game invite/result delivery; tested minigame experience | Boundary repair in progress |
| G8 Quality and delivery (P6) | Council outcome; measured safe debloat; full tests/types/build; browser evidence on desktop/phone; updated docs; clear commits and push; reviewable PR | Baseline build green; ongoing |

## Evidence log

- `7be1cc5`: production Next.js build and postbuild CSS check passed.
- Launcher slice: shared runner passed pinned-pnpm TypeScript and all 1,000 tests.
- Static baseline: 385 code files, 49 unused-export candidates, 10 design orphans.
  These design pieces are intentional pending integration; do not delete them.

## Rules for closing goals

- A visible action must perform the advertised operation, preserve ownership and
  return a usable destination. Helpers or status messages alone do not complete it.
- Historical completion statements do not substitute for current behavior checks.
- Provider-backed AI needs an actual reachable configured provider for live proof.
  Unavailable infrastructure remains an explicit verification gap.
- Two-user/call and browser tests must separate proven local behavior from external
  network/device conditions. Do not label untested WAN calls as verified.
- Record checks, commit IDs, remaining limitations and next work after each slice.
