# AI result recovery — 2026-10-01

The tutor keeps the previous result while a request is pending, fails or becomes stale. A usable replacement appears only after the outgoing draft is archived and the new snapshot is saved. Known unavailable storage prevents the request; later storage failure keeps the previous result and shows an accessible status.

Source: `2b21252`; probes: `f255759`, on `cleanup/stage-1`. The preceding compact workspace is delivered at `66d6cc9`. No dependency or draft-schema change.

## Evidence

- Compiled baseline `66d6cc9` failed the first recovery assertion: starting a held request hid the previous result. [Baseline fixture record](./2026-10-01-ai-result-recovery/baseline-results.json); raw failure log remains in `.cache/design-review/ai-result-recovery-baseline.log`.
- `pnpm lint` passes. `pnpm test` passes **1,355/1,355**, no skips, 52.1 seconds. Production `pnpm build` and all four CSS checks pass. Root ran these serially with Node capped at 4,096 MB; delegates ran no heavy checks.
- [Recovery browser: 69/69](./2026-10-01-ai-result-recovery/results.json), 23 per layout: 1280/color, 390/light and 320/dark. Covers pending output and disabled actions, edited-prompt stale replies, non-ok/HTTP errors, empty/whitespace/missing/non-string success payloads, storage preflight, active/history write failure, successful replacement, reload, previous-draft restore and unmounted replies.
- [Compact AI regression: 312/312](./2026-10-01-ai-result-recovery/workspace-results.json), all nine width/theme combinations. The previous late-response assertion now verifies that the prior result remains while fresh stale output is rejected.
- [Learning workflow regression: 108/108](./2026-10-01-ai-result-recovery/learning-results.json), three layouts. Its handoff starts without a prior result, so its original stale-reply assertion remains valid.
- All browser API traffic was intercepted. No page errors or unexpected writes escaped the fixtures; no live-provider or production-data requests were made.
- Independent source review found and resolved two issues: unusable success text could overwrite the result, and retained-result errors needed a live status region. Final frozen review found no remaining scoped source blocker.
- Root inspected downscaled [phone workspace](./2026-10-01-ai-result-recovery/workspace-390-light.jpg) and [result menu after a blocked draft write](./2026-10-01-ai-result-recovery/result-menu-320-dark.jpg). Layout is unchanged by this recovery slice.
- Six evidence files match two reads of their originals and two reads of the copies: [receipt](./2026-10-01-ai-result-recovery/evidence-hashes.json).

Reproduce locally with `pnpm exec tsx ops/scripts/test/ai-result-recovery-probe.ts`, then the existing `ai-workspace-probe.ts` and `learning-workflow-probe.ts`. The probe requires a compiled localhost preview and installed Chrome; it does not contact a configured AI provider. Raw check/build/browser logs use `.cache/design-review/ai-result-recovery-*`.

## Limits and next work

If storage becomes unavailable after a provider has answered, the unsaved new output is not applied; the previous result stays available. Archive and active-draft writes are synchronous but are not one atomic cross-tab transaction. Legacy draft keys remain browser-global, and workspace token/temperature/include-notes preferences remain outside the draft schema. Live provider credentials, cross-account/cross-tab recovery and hosted collaboration require separate verification.

The production build still emits existing local workerd Durable Object export warnings. This passed Next build does not establish Cloudflare Durable Object deployment/call behavior. No merge or manual deployment was performed.

Next bounded UI cleanup: remove the duplicate desktop sidebar Help control while retaining the account-menu guide, and make two landing-demo tutorial prompts accurately describe the selected object and download behavior. Those are source-confirmed findings, not yet implemented in this checkpoint. Source-specific review provenance and provider-backed calendar/AI verification also remain follow-ons.

Push and exact-head CI receipts are recorded in the [session resume log](../sessions/2026-10-01-ai-result-recovery.md).
