# LEARN assistant history and progress reconciliation

Date: 2026-09-24 (Asia/Hong_Kong)
Code baseline: `3681710`, branch `cleanup/stage-1`

## Result

The current checkout is committed and pushed, but that does **not** mean every
historical request has been implemented or every earlier implementation survives
in this checkout. The main gaps are the interrupted launcher work, the remaining
P2b–P6 overhaul, and older Studio/Social implementations described by Codex.

At the code baseline, `origin/cleanup/stage-1` equals HEAD. `origin/main` is
`5f06f9e`, 54 commits behind this branch, with no commits unique to main. There is
one worktree and no listed stash. This review does not merge or deploy the branch.

## Sources checked

Local assistant records were read as historical evidence, then compared with Git
and the current source. Raw conversations, secrets, local databases and generated
assets are not part of this report's Git changes.

| Source | Coverage | Evidence and limitation |
| --- | --- | --- |
| Claude | LEARN session `014ad3fe-ca8d-4000-96f0-4498320b4323`, five saved subagent transcripts, and all three project memory files | Project history under the user's `.claude/projects/C--Users-user-Downloads-LEARN`; latest session ends with an authentication failure after the cleanup edit |
| WorkBuddy | LEARN session `edbf3fd1-40b2-4662-a320-118787aa6e78`, three saved subagent transcripts, and `.workbuddy-ai/memory/2026-09-21.md` | Main transcript contains 285 messages; later commits supersede several environment warnings and incomplete task notes |
| ZCode | All 36 LEARN session records found by directory in its local SQLite database, including saved text reports and task statuses | Read-only database inspection; `.zcode/plans/plan-sess_b9e2512b-cb23-4918-8fc2-23a38c96d98e.md` also checked |
| Codex, same checkout | Task “Apply images and pasted text”, `019e95cd-46ad-7c22-bb84-ff27be0f0cae` | Scanned the complete available local JSONL: 115 turn-context records, 66 final reports, 734 patch-path entries; compacted portions and unavailable original attachments limit reconstruction |
| Codex, related checkouts | “Organize learn workers setup” (`019ee950-0698-70e2-989a-b3f610289daf`), “Update Cloudflare docs and config” (`019ee933-c7e6-78c1-b229-1bed95c7ea46`), and earlier learning-app task `019e1d27-ab73-7cd2-b635-390fea59325c` | Available local histories scanned; these concern LEARN-v1, Documents/Learn, or learning-app, so their deployment reports are not verification of this checkout |
| Git and tracked documentation | Branches, remote refs, worktree, reflog, unreachable commits, roadmap and audit documents | The 13 unreachable commits inspected are September snapshots/earlier cleanup work; the checked June Studio/Social implementation paths were not found there |

Codex task pagination failed after 80 turns of the large June task; scanning its
local rollout supplied the remaining available records. The archived-task listing
returned no additional tasks. This is an inventory of accessible local records,
not a guarantee that deleted, cloud-only or other-device conversations were found.

## September progress matched to commits

| Work | Evidence on the pushed branch | Status |
| --- | --- | --- |
| Cleanup, dependency reduction, security and API test foundation | `c402d6c` through `45638de` | Committed; see September 21 audits for individual scope |
| Quiz ownership, route wiring and shared CRUD factory | `49f468a`, `c2b01ae`, `d010335`, `feaacf0` | Committed |
| Calendar ICS, PWA, voice and note access fixes | `612219d`, `6563f93`, `6288af3`, `ca542b4`, `89da16f` | Committed; the local calendar plan is represented in source |
| Canvas, formatted AI output, Office export/import, sharing and live games | `eb029b1`, `e851ce4`, `3ee39f1`, `dba0961`, `d244733`, `1d73247`, `557881d`, `578b203` | Committed foundations; not evidence that every later overhaul requirement is complete |
| Create/guide controls, accessibility, browser audit and PDF export | `74e61d5` through `8405d7c` | Committed; historical test totals differ by checkpoint |
| R2 downloads and deployment binding parity | `f2f9b2d`, `d02fadf` | Committed |
| P0: local realtime, presence and call signaling | `949ba3f` | Committed and pushed; includes existing `ops/run/*.bat` root-directory fixes |
| P1: notebook shell, sidebar modes, command palette, notifications | `e1be1a4` | Committed and pushed |
| P2a: multi-page design model, editor parts and export | `8472644` | Committed and pushed; new editor is not wired into `/canvas` |
| Protect local D1/R2 data during workspace cleanup | `1b44c7f`, `3681710` | Committed and pushed, with regression coverage |

Some ZCode task lists still mark verification or commits pending for work already
represented by `c2b01ae`, `6563f93`, `e851ce4`, `d244733`, `1d73247`, `fb3ab47`,
`9d959ca` and `e53eb52`. Treat these as stale task bookkeeping, not instructions
to repeat implementations. Individual runtime claims still need their own evidence.

## Interrupted and remaining work

Claude's final user request on September 24 included batch files for easier run,
deployment and tests. Claude announced launcher work followed by P2b, but the last
session failed authentication after editing the cleanup logic. The two changed
cleanup files were the only remaining working-tree changes when this review began.

Existing tracked launchers are `start-local`, `setup-first-time`, `setup-d1`,
`setup-r2`, `doctor`, `deploy-cloudflare`, `deploy-vercel` and `try-cloudflare`,
plus `ops/run/bin/pnpm.cmd`. There is no dedicated test batch launcher or completed
new launcher menu. Existing run-file fixes are pushed; the expanded launcher request
is **unfinished**, rather than a set of files accidentally omitted from staging.

| Checkpoint | Remaining scope |
| --- | --- |
| Launcher follow-up | Finish the requested convenient run/test/deployment wrappers; verify working directories and error handling |
| P2b | Connect the new design components to `canvas-editor.tsx`, pass notes from the shell, integrate editing gestures, pages, zoom, context actions and undo/redo |
| P2c | Multi-page share rendering, document page breaks/count, deck export fixes, deck/note-to-design paths |
| P3 | Notes/vault ↔ AI, including proposed local Ollama support, ↔ activities/discussions/quizzes |
| P4 | Chat v2: stories, stickers, GIFs, memes, voice notes and improved media/emoji |
| P5 | Call quality and expanded Messenger-style minigames |
| P6 | Browser checks, polish, documentation and review/PR; pushing completed checkpoints is already done |

Current source confirms that `learn-shell.tsx` still renders `<CanvasEditorView />`
from the older view without notes, and that view has no imports from the new design
component directory. P2a's presence must not be described as a finished visible
multi-page editor. The saved checkpoint preference is to report after each bounded
checkpoint; this audit itself does not start the implementation backlog.

## Older work needing recovery comparison

The June Codex task records extensive standalone Canva-style Studio and
WhatsApp-style Social work, including deployment and browser-test reports. These
files are absent now, and representative implementation paths have no history on
the available branches:

- `src/app/studio/canva-studio.tsx`
- `src/app/studio/project-ark-studio.tsx`
- `src/app/social/whatsapp-social.tsx`
- `src/lib/import-adapters.ts`
- `src/lib/studio-rich-import.ts`
- `src/tests/ai/import-adapters.test.ts`
- `src/tests/studio/studio-rich-import.test.ts`
- `src/tests/social/social-design.test.ts`
- `ops/scripts/test/studio-interaction-smoke.ts`
- `ops/scripts/test/social-interaction-smoke.ts`
- `ops/scripts/test/capture-ui-screenshots.ts`

The historical temporary `.tmp-ui-check.spec.js` is absent too; a scratch test is
not itself a product recovery requirement. The September WorkBuddy record says
the workspace initially had all tracked files deleted and was restored from
remote main. That is context for this discontinuity, not proof of exactly when or
why each June file disappeared.

Some earlier capabilities have newer equivalents, such as DOCX/XLSX import and
the new design foundations. Compare requirements and behavior before restoring
old files: importing an obsolete entire editor could undo the September work.
The June transcript retains patch records for a focused recovery investigation.
No missing historical files were silently reconstructed or claimed as pushed.

Related-checkout histories also contain older deployment reports and a recorded
overbroad Worker cleanup incident. They are historical context only; current
deployment state was not inspected or changed during this audit.

## Verification and next handoff

- At `3681710`, `pnpm test`: **1,000 passed, zero failed**; `pnpm lint`: passed.
- Remote branch SHA matched local HEAD after the push; tracked working tree was clean.
- No production build, live deployment, browser interaction or two-device call
  validation was run for this reconciliation. Earlier claims do not replace those checks.
- Keep this report linked from both progress trackers. Next work should choose a
  bounded checkpoint from the launcher, historical recovery, or P2b backlog and
  update status only after its implementation and verification are complete.
