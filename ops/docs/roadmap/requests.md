# Owner requests

Every request the owner has made for LEARN, with its status. The requests are paraphrased, because this repo is public. Newest status first in each row.

Status is one of: **done**, **partly done**, **in progress**, **planned** or **blocked**. "Unverified" marks a claim carried over from earlier assistant reports that no one has re-checked in the browser.

## Standing rules

| Rule | Where it applies |
| --- | --- |
| Stop at each checkpoint and wait for the owner's pick. At each checkpoint, commit locally with `tsc` and the tests green, and give a short visual report. | Every session |
| Ask when unsure. The owner wants 100% confidence, and reports must contain only verified facts. | Every session |
| Push only when the owner says so. | Every push |
| Real users only in social, with no fake data. Every button must work, with no placeholders. | The whole app |
| Minimal text: labels only for sections, visual design everywhere, clean and easy to follow. | Every page |
| Local only for now (localhost). When deploying later, use Cloudflare's one `learn` worker and leave the other workers alone. | Deploys |
| Keep save points and logs so any session can recover after a usage limit. | Every session (`~/.claude/CLAUDE.md`) |

## Requests

| # | Request | Status |
| --- | --- | --- |
| 1 | Analyse the whole folder and push it to GitHub with its past commits. | **done**: pushed `cleanup/stage-1`; draft PR SethyPagna/LEARN#1 |
| 2 | Canva-level editing: drag, a doc-style "add page", and slides that feel like PowerPoint, with a unique notes-tab feel. | **partly done**: the Studio editors have add page and drag. **planned**: merge `/slides` into one Canva-style editor with a filmstrip, a page stack and selection-only toolbars (design step 4) |
| 3 | A sidebar that shrinks from full width to icons only. | **done**: expanded, icons-only rail and hidden modes. The choice survives reloads |
| 4 | Connect everything: notes and vault into AI-made or hand-made activities, discussions and quizzes. | **in progress**: the select-to-act pill turns picked text into a quiz, cards or slides. **planned**: "Notes ↔ AI ↔ activities" |
| 5 | Connect them to social: share, and play mini-games in chat like Messenger. | **in progress**: the pill can share a passage or host a live quiz in a chat. **planned**: "Chat, calls, mini-games" |
| 6 | AI arranges text and data into fun, editable designs, auto-arranged from identifiers the system recognises, with predetermined layouts. | **partly done**: layout specs build designs (`design/spec`, `design/layout`). No live AI provider is set up locally, so the AI paths are verified only by unit tests |
| 7 | Resource-saving, smart and optimised. | Standing. The pill reads AI status every 5 minutes and the chat list every minute, and makes quizzes and cards locally when it can |
| 8 | Real-time group chat with voice and video that is not laggy or fake; uploads, emoji, memes, GIFs, stickers and stories. WhatsApp with Messenger-style mini-games. | **partly done** (unverified): earlier reports claim media, stories, peer calls and real-time games. **planned**: re-verify in the "Chat, calls, mini-games" step |
| 9 | A great UI that is not monotone or old: friendly and attractive. | **in progress**: the Today page and buddy (step 1) are done. The app-wide visual refresh (step 2) is done locally and waits for the owner's review: one colour per kind of work, colour covers, friendly empty states, and no text under 12px |
| 10 | Go deeper: tests, Playwright and analysis. | **in progress**: unit tests and read-only browser probes at each checkpoint |
| 11 | `.bat` files to run, test and deploy easily. | **done**: `run.bat`, `test.bat`, `deploy.bat`, `tools.bat` |
| 12 | Check the FROM CODEX history and GitHub. | **done** |
| 13 | Use Playwright to redesign the app into a companion for the learner. | **in progress**: design steps 1 and 2 are done: the Today page, buddy and select-to-act pill, then the visual refresh (local, waiting for review). Both were checked in read-only browser probes on desktop, phone and dark. Steps 3 and 4 are planned |
| 14 | Buddy: a friendly character whose moods follow the streak. | **done**: violet blob with happy, excited, curious, sleepy and hello moods |
| 15 | Navigation in five places: Today, Create, Practice, Friends and Me. | **planned** (design step 3) |
| 16 | Fix what is still open: the sheet formula engine, vault markdown, labelled AI tutor buttons, the import pill, the streak bug, the live answers bug, and the other bugs found. | **planned** (after the design steps). The bug list is in the latest session log |

## Chosen order

1. Companion home + dock (**done** and pushed)
2. Visual refresh, app-wide (**done**, committed locally, waiting for the owner's review)
3. Navigation in five places
4. One Canva-style editor
5. Fix what's still open
6. Notes ↔ AI ↔ activities
7. Chat, calls and mini-games
