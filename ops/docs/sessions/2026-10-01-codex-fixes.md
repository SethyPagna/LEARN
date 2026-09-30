# Bug-fix checkpoint: 2026-10-01

## Resume here

- **New owner direction:** continue from [2026-10-01-continuation.md](2026-10-01-continuation.md). Checkpoints are now periodic verified commits/pushes, not stop/approval gates. The earlier pending-push notes below are historical.
- Active checkout: `C:/Users/user/Downloads/Projects/LEARN`, branch `cleanup/stage-1`; starting HEAD `668318c`, clean and 14 commits ahead of origin. The previous verified editor/demo checkpoint is in [2026-09-30-codex-takeover.md](2026-09-30-codex-takeover.md).
- The owner asked to continue. Work now covers the next chosen checkpoint, "Fix what's still open" (ledger #16). The preceding push decision remains pending; no push or deploy is authorized by this continuation.
- Ten reviewed code/QA commits are saved, ending at `28d2a47`, followed by this documentation checkpoint: expected clean branch,25 ahead/0 behind origin `cfd3b8e`. Verify rather than assume. [Report, pictures and limits](../audits/2026-10-01-bugfixes.md) saved. Private quiz reads/attempts are guarded as well as lists; the existing ownerless shared question bank is retained.
- Verified: final TypeScript exit0;1,293/1,293 tests; production build/4 CSS checks;123 compiled browser assertions across1280/color,390/light and320/dark; local smoke; twice-read source hashes match committed bytes; two Git fsck runs pass. Local production preview is on http://localhost:3000 (own exec session93151; verify listener/process before stopping).
- Next: owner reviews this checkpoint and the pending push decision. Recommended next work is atomic live answers and review-budget reservation before the planned AI/social steps. Do not call the full app/roadmap complete. Preserve `.wrangler/state` and private browser credentials; no half-finished source remains.

## Requests and decisions

| Request / decision | Status |
| --- | --- |
| Continue from the saved checkpoint | Done for this scoped bug-fix checkpoint; broader roadmap remains open |
| Compact, consistent UI with clear working functions | Done for repaired controls; broader design remains a standing goal |
| Small local commits, tested checkpoints and recovery logs | Done; ten code/QA commits plus this documentation checkpoint |
| Push latest work | Pending separate checkpoint decision; no push made |
| One heavy process at a time, Node heap at 4096 MB | Required; source-only delegation, root runs checks sequentially |

## Tasks

| Area | State |
| --- | --- |
| Read resume / Claude bug list / working tree | Done |
| Formula engine and Vault markdown | Done locally; unit tests and3 browser layouts pass |
| Live answer replay, participant sessions and joining | Done locally; replay/legacy/host API tests and3 browser layouts pass |
| Review streak, read-only review list and scheduling settings | Unit tests pass, including grading cap/rest-day checks |
| Quiz scope, dashboard archives and achievement placeholders | Written; six read-route tests pass; private read/attempt tests pass |
| AI/import controls, remembered phone chat and route titles | Done locally;3 browser layouts pass |
| TypeScript / full suite / browser verification | Done: final TypeScript exit0; full1293/1293; production build/CSS;123 browser assertions; local smoke pass |
| Independent review, scoped local commits and final report | Done locally:3 source reviews, focused commits and report saved |

## Evidence and notes

- Resume logs, requests ledger and Claude's saved checkpoint-and-stop decision read before edits. `git status --short --branch`: clean, ahead 14.
- Claude's 2026-09-27 known-bug list and 2026-09-28 route-title finding are leads, not verified fixes.
- `get_goal` returned no active goal; created the scoped next bug-fix checkpoint goal.
- No listener was returned on port 3000 at initial check. Verify again before running a browser; do not stop another session's processes.
- Agents must not run builds, installs, tests or browsers, and must patch shared `data.ts` by owned region only.
- `node --import tsx --test src/tests/api/workspace-read-routes.test.ts src/tests/api/live-sessions-route.test.ts`:10/10 pass. The first read test run had an incomplete timestamp fixture; repaired before the passing run.
- Independent reviews caught and addressed: the ownerless bank must remain readable; private quiz IDs also need permission checks; Vault inline-tag examples must survive parsing; DOCX/XLSX delayed imports need project/content guards. No source-only review counts as a browser pass.
- Formula defaults: keep the five existing aggregate functions, resolve dependencies without display-rounding loss, skip blank/text cells, bound cycles/depth/work. Extra spreadsheet functions/arithmetic are outside this repair.
- Review defaults: retain established1/2/4/7-day rating intervals and UTC day boundaries, move a due date off the selected rest day, subtract today's completed grades from the cap (default30, maximum200). Adaptive scheduling is still a later design choice; do not claim FSRS. Backlog counts remain bounded by200 fetched due cards.
- Live persistence retains legacy rows and repairs missing answer rows on the next accepted session mutation; it does not delete or rewrite finished history automatically.
- Browser probe `ops/scripts/test/bugfix-ui-probe.ts` written, untested: fixtures only, API mutations aborted except mocked live joins; desktop/color,390/light and320/dark.
- TypeScript initially caught probe API arguments and a test tuple type; corrected, then exit0. Final rerun after the last probe/style edits is next.
- Focused35/35 tests pass after row-reference and Vault assertion fixes. Full suite initially1290/1294 (four obsolete source/seeding expectations); removed2 obsolete seeding tests, updated scoped ownership assertions, added the deep HTML resilience test. Full suite now1293/1293,0 skipped. `ops/scripts/test/run-tests.ts` limits test-file concurrency to1.
- Vault styles now emit once for200 saved blocks, and deeply nested HTML falls back to bounded escaped source with a notice. No raw HTML injection.
- DOCX/XLSX delayed imports refuse to replace a different project or newer content. The browser probe includes a delayed workbook fixture and an edit while it is pending.
- GitHub remote independently remains `cfd3b8ea2bf31e2a4787e4c2cb42dd0b1e00aa92`; no new push.
- Daily budget checks cover ordinary sequential/stale-tab grades. Two simultaneous grades on different cards can still both consume the final slot; there is no new atomic budget reservation or adaptive interval model.
- Final TypeScript exit0, production build exit0 (91 routes,2 workers), postbuild CSS checks pass (4 files). No build overlapped another heavy check.
- First browser run: desktop formulas/Vault/import guards/AI/chat/live checks passed; phone Vault/AI/chat/live passed. Five probe failures came from a visible-only account readiness wait (phone editor topbar is hidden) and an incomplete connected-calendar fixture (`results` missing). Corrected probe waits for attached readiness, supplies the actual calendar response shape, captures failures and checks caught React errors. Rerun in progress, no product fix inferred from these setup failures.
- Final independent live/API review found no unintended diffs. Same-session simultaneous live answers can still race the reducer JSON update; this repair scopes participant/answer identity and recovers missing stored answers, not atomic scoring. Existing placeholder achievements and finished sessions are preserved.
- Corrected production browser run passed114 assertions at1280/color,390/light and320/dark; local smoke passed. Visual inspection then found that horizontal scrolling can hide focused sheet text behind sticky row numbers. Focus now reveals that edge; written, browser verification pending. Read-only title audit found2 server/client differences (Profile and Quizzes), aligned before final rebuild.
- Before repeating heavy checks: stopped only this checkpoint's production server (session31643). Next TypeScript, full suite, production build, then focused browser repeat sequentially. No API writes were sent to the real workspace.
- After the focus/title changes: TypeScript exit0,1293/1293 tests (0 skipped,61.9s), production build exit0 and4 CSS guards pass again. Compiled browser123/123 assertions across3 layouts, no page/caught React errors, no unintended writes. Local smoke passes again. Downscaled Sheets phone/Vault desktop inspected; focused A-cell text now clears the sticky row numbers.
- Prepared separate cached patches for review, quiz-access, live and read-only API areas without changing the working files. Two SHA-256 reads agree for70 source/log files; committed-byte comparison and Git fsck remain before final save.

## Checkpoint history

- 2026-10-01: resumed the clean September 30 checkpoint and began source audits. No new local commit or remote change yet.
- Local checkpoint 45670aa : formula engine/results, readable focused phone cells and guarded compact imports saved.
- Local checkpoint b9aa364 : safe readable Vault Markdown and shared block styles saved.
- Local checkpoint 2da530c : read-only reviews, UTC budgets/rest days, stale grade checks and streak fields saved.
- Local checkpoint c4b2fa3 : scoped quiz lists, private read/attempt/host access and shared-bank preservation saved.
- Local checkpoint c5b4750 : session-scoped roster/answers, missing-answer recovery, host/direct joining and Today activity saved.
- Local checkpoint bd8bc6a : archived dashboard notes excluded and achievement placeholder creation stopped; existing rows preserved.
- Local checkpoint 1a73c80 : primary AI actions have concise visible labels.
- Local checkpoint b23088f : remembered phone conversation opens after reload.
- Local checkpoint 4f10d94 : server/client route titles and current smoke expectations aligned.
- Local checkpoint 28d2a47 : reproducible mocked browser probe and sequential test-file runner saved.
- Source integrity:69 changed source/QA files matched two fresh SHA-256 reads, the pre-stage record and their committed Git blob bytes. `git fsck --full` passed twice; recoverable dangling objects kept. Anonymous evidence source/copy hashes matched on two reads, originals retained.
- Documentation checkpoint saves the report, anonymous downscaled pictures/results, request ledger and recovery log. Eight documentation/evidence files passed repeated SHA-256 reads and independent staged Git blob comparisons before saving. Remote independently remains `cfd3b8ea2bf31e2a4787e4c2cb42dd0b1e00aa92`; no push/deploy. Recheck clean status/committed documentation after the save; the expected branch is25 ahead/0 behind.
