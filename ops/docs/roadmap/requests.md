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
| 2 | Canva-level editing: drag, a doc-style "add page", and slides that feel like PowerPoint, with a unique notes-tab feel. | **partly done**: the Studio editors have add page and drag. **done locally** (checkpoint 4, verified 2026-09-30): merge `/slides` into one Canva-style editor with a filmstrip, a page stack and selection-only toolbars (design step 4). The owner chose: old decks convert when opened (the original is archived), and the new editor gains PowerPoint import, tables, element animations, a rehearsal timer and outline export. Done so far (local commits): slides are presentation designs and old decks convert when opened; PowerPoint import keeps each slide's layout; tables (add, type into cells, rows and columns, header and banded rows, colours; exported to PowerPoint and pictures; imported from PowerPoint and old decks); element animations (Rise, Reveal, Emphasis; they play in turn as a page is presented; an old slide's animation carries over); a rehearsal timer and time estimates, and an Outline (.txt) download. Old slides code retired; all seven entry paths verified at1280,390 and320 wide. Final TypeScript,1241/1241 tests, production build and CSS checks pass; [checkpoint report](../audits/2026-09-30-takeover.md) saved |
| 3 | A sidebar that shrinks from full width to icons only. | **done**: expanded, icons-only rail and hidden modes. The choice survives reloads |
| 4 | Connect everything: notes and vault into AI-made or hand-made activities, discussions and quizzes. | **in progress**: the select-to-act pill turns picked text into a quiz, cards or slides. **planned**: "Notes ↔ AI ↔ activities" |
| 5 | Connect them to social: share, and play mini-games in chat like Messenger. | **in progress**: the pill can share a passage or host a live quiz in a chat. **planned**: "Chat, calls, mini-games" |
| 6 | AI arranges text and data into fun, editable designs, auto-arranged from identifiers the system recognises, with predetermined layouts. | **partly done**: layout specs build designs (`design/spec`, `design/layout`). No live AI provider is set up locally, so the AI paths are verified only by unit tests |
| 7 | Resource-saving, smart and optimised. | Standing. The pill reads AI status every 5 minutes and the chat list every minute, and makes quizzes and cards locally when it can |
| 8 | Real-time group chat with voice and video that is not laggy or fake; uploads, emoji, memes, GIFs, stickers and stories. WhatsApp with Messenger-style mini-games. | **partly done** (unverified): earlier reports claim media, stories, peer calls and real-time games. **planned**: re-verify in the "Chat, calls, mini-games" step |
| 9 | A great UI that is not monotone or old: friendly and attractive. | **in progress**: the Today page and buddy (step 1) are done. The app-wide visual refresh (step 2) is done and pushed: one colour per kind of work, colour covers, friendly empty states, and no text under 12px. Light and Dark stay grey; the Color theme carries the kind colours |
| 10 | Go deeper: tests, Playwright and analysis. | **in progress**: unit tests and read-only browser probes at each checkpoint |
| 11 | `.bat` files to run, test and deploy easily. | **done**: `run.bat`, `test.bat`, `deploy.bat`, `tools.bat` |
| 12 | Check the FROM CODEX history and GitHub. | **done** |
| 13 | Use Playwright to redesign the app into a companion for the learner. | **in progress**: design steps 1 and 2 are done and pushed: the Today page, buddy and select-to-act pill, then the visual refresh. Both were checked in read-only browser probes on desktop, phone and dark. Step 3 is done and pushed; step 4 is in progress |
| 14 | Buddy: a friendly character whose moods follow the streak. | **done**: violet blob with happy, excited, curious, sleepy and hello moods |
| 15 | Navigation in five places: Today, Create, Practice, Friends and Me. | **done** and pushed (design step 3, checkpoint 3): five places in the sidebar and phone dock, one tab row per place, the top bar names the place. The owner's follow-ups are done and checked in the browser (committed locally, not pushed): a « ‹ Sep 28, 2026 › » calendar date bar with month, day and year pickers, counts back in the page titles, and the Files grid switch on phones |
| 16 | Fix what is still open: the sheet formula engine, vault markdown, labelled AI tutor buttons, the import pill, the streak bug, the live answers bug, and the other bugs found. | **planned** (after the design steps). The bug list is in the latest session log |
| 17 | Small screens (2026-09-28): smaller previews or lists instead of big cards, balance buttons against empty space, nothing broken, consistent and easy to use. | **done** and pushed: checkpoint 3 step 5. One toolbar row per page, short covers or lists on phones, 36px taps, nothing off-screen at 390 and 320 wide (read-only phone audit of 22 pages) |
| 18 | Take over from the newest Claude checkpoint, reconcile GitHub, preserve work and independently review changes. | **done locally** (2026-09-30): current history/ledger/remote/PR reviewed, seven earlier local commits preserved, independent migration/UI/demo reviews completed. No new push yet |
| 19 | A public demo that captures actual Studio use, with working Canva-style editing and a simple guided tutorial. | **done locally**: three independent editable projects using the shared engine, selection tools, pages, notes, presentation, PNG export and an optional four-step tour.93 browser assertions/9 layouts pass in dev and compiled production; no API writes attempted |
| 20 | Fill the expanded sidebar with useful sections; place Me in the account footer, before appearance controls and notifications; brand expansion must preserve the page. | **done locally**: four main sidebar places plus active section links and Me in the footer; phone dock retains all five. Desktop/390/320 checks pass, including URL-preserving expansion |
| 21 | Thoroughly redesign Me/Profile with compact visual design and working settings. | **done locally**: identity editing, avatar, visibility and links, real learning metrics and visual badges. Mocked failed/successful saves, immediate account updates and draft preservation pass at all3 widths; avatar/link/cancel edge cases pass on desktop |
| 22 | Improve options popups and apply consistent responsive interaction rules. | **done locally for account options**: shared viewport-clamped popover, keyboard focus/Escape restoration and compact preferences verified on desktop and phones. No other specific popup was identified; future bugs remain in the later fix phase |

## Chosen order

1. Companion home + dock (**done** and pushed)
2. Visual refresh, app-wide (**done** and pushed)
3. Navigation in five places (**done** and pushed; the owner's follow-ups are committed locally)
4. One Canva-style editor (**done locally**, checkpoint4 report saved; push decision pending)
5. Fix what's still open
6. Notes ↔ AI ↔ activities
7. Chat, calls and mini-games
