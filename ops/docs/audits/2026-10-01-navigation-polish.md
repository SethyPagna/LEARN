# Compact navigation and demo polish — 2026-10-01

Help now lives in the account menu instead of also occupying the desktop sidebar footer. Expanded Me sections still have their page links. Closing the guide returns keyboard focus to its connected opener, and the public Studio tour accurately describes trying text tools and downloading the current page.

Source: navigation `579a9c0`, demo `1a36f91`; probes `99c8df1`, branch `cleanup/stage-1`. This follows the [completed AI result recovery](./2026-10-01-ai-result-recovery.md) at `326dba6` with green exact-head CI. No dependencies, APIs, schemas or editing-engine behavior changed.

## Verification

- Compiled baseline `326dba6` fails the new duplicate-Help assertion while the account menu is closed: [baseline record](./2026-10-01-navigation-polish/baseline-results.json). The raw expected failure is in `.cache/design-review/navigation-polish-baseline.log`.
- `pnpm lint` passes, including the final corrected fixture. `pnpm test` passes **1,355/1,355**, no skips, 53.5 seconds. Production `pnpm build` and all four CSS checks pass. Root ran heavy jobs serially, capped at 4,096 MB; delegates ran only source reviews.
- [Navigation: 76/76](./2026-10-01-navigation-polish/navigation-results.json): 1280/color in expanded, rail and hidden modes; 390/light; 320/dark; and 740×320/dark landscape. Keyboard opening, focus inside the guide, ArrowDown focus retention, repeated-open invoker preservation, Escape and close-button focus return pass. The probe checks containment rather than a specific focused row. One account trigger and one account-menu guide entry remain; Me links, brand expansion without changing the page, destination navigation and viewport fit pass.
- Navigation HTTP API and realtime WebSocket traffic are isolated fixtures. Initial probe failures came from an incomplete connected-calendar response and an unstubbed local realtime handshake; fixtures now use the actual response shape and no upstream socket. App source stayed frozen. No page/console errors or API writes remain in the final run.
- [Public demo: 93/93](./2026-10-01-navigation-polish/demo-results.json), nine width/theme layouts. Existing editing, selection tools, styles, shapes, undo/redo, pages, project switching, notes, presentation and all four tutorial steps pass. Its private anonymous context blocks server writes; read requests are local. No API writes or browser errors were attempted/observed.
- Demo PNG export decodes at 1920×1200 and two independent reads agree on SHA256 `d99a79b63d9d7e2afd6af27803ea0c8b50e32a9add813bac57405ec245072824`. This is a current-page image, not a project backup.
- Root inspected downscaled [desktop/color](./2026-10-01-navigation-polish/demo-1280-color.jpg) and [phone/dark](./2026-10-01-navigation-polish/demo-320-dark.jpg) captures. Five evidence files match two reads of originals and copies: [receipt](./2026-10-01-navigation-polish/evidence-hashes.json).
- Independent final source review found no material blocker. It verified retained Me/admin filtering, unchanged zero-argument guide API, connected-opener cleanup and accurate page-download wording. Clean-code G5/G12 removed duplicate controls; no new navigation abstraction was introduced.

Reproduce on a compiled localhost preview with `pnpm exec tsx ops/scripts/test/navigation-polish-probe.ts` and `pnpm exec tsx ops/scripts/test/demo-probe.ts`. Set `LEARN_QA_OUTPUT` for demo evidence and `LEARN_QA_SHOTS=1` for downscaled captures. Chrome must already be installed. Raw logs use `.cache/design-review/navigation-polish-*`.

## Limits and continuation

Page-specific Studio/Today Help remains intentionally available; this removes duplicate navigation controls. If the captured opener is removed while the guide is open, cleanup skips the detached node; it does not search for a relocated replacement. The local demo retains projects while mounted and downloads one PNG page; it does not persist a whole project through reload.

This slice does not prove provider-backed calendar/AI behavior, hosted realtime services or collaboration. Existing local workerd export warnings remain in the passed Next build. No manual deployment, merge, force push, original-data deletion or new dependency occurred. Source-specific review provenance and live provider round trips remain separately tracked follow-ups.

Delivered through `8327053` with [passing exact-head CI](https://github.com/SethyPagna/LEARN/actions/runs/36816116528). All 17 changed files twice match Git bytes, fsck passes twice and two remote/API head checks agree; [integrity receipt](./2026-10-01-navigation-polish/code-8327053-hashes.json). The final documentation receipt follows, with its final-head checks recorded in the harness completion checkpoint and [session log](../sessions/2026-10-01-navigation-polish.md). Checkpoints remain progress/push points, not approval gates.
