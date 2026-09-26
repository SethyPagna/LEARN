# AI Council — Session 4: making LEARN a mature, foolproof, ready app

**Date:** 2026-09-21
**Skill:** `ai-council`
**Revision:** `abc8614` (`cleanup/stage-1`) — tsc exit 0 · 472/472 tests · 47 route handlers
**Input:** the owner's vision — note-taking like Obsidian/Notion; Canva-like design/editing in a
Vault (names, formats, dimensions, tools); WhatsApp-grade realtime chat; AI/manual activities
(quiz, Kahoot-style, games, discussions) connectable as **Messenger-style multiplayer mini-games**;
a schedule that links across the app (pick a Vault item → schedule → send to Social) and **syncs to
the phone's own calendar apps with alarms**; voice transcription throughout; smart summarisation;
PWA/offline; responsive on large screens and app. *"Keep using AI council. Make it mature, genuine,
strong and foolproof."*

Measured state handed to the council:

| Subsystem | Reality |
| --- | --- |
| Realtime | **Real.** Durable Objects + WebSocket upgrade (`ChatDurableObject`, `PresenceDurableObject`, `StudyRoomDurableObject`, `StudyBattleDurableObject`); chat UI opens a real `WebSocket`. |
| Activities | Quizzes, practice sessions, games, rooms, battles — single-player complete, multiplayer infra present. |
| Studio | Docs / sheets / slides with formatting, drafts, exports. |
| Vault | Graph + block palette; block **saving was just wired** this session. |
| Interconnection | **`content_items` / `content_versions` / `shared_access` / `content_attachments` are written by 6 paths and read by nothing; `content_search` has 0 writers and 0 readers.** The spine exists on paper only. |
| Calendar | Month grid + agenda + filters. **No recurrence, no reminders, no ICS, no notifications.** `calendar_events` links only `linked_note_id`. Timezone stored as a text field defaulting to `UTC`. |
| Voice | Wired on **2** surfaces (AI composer, Studio doc editor). |
| PWA | **Nothing.** No manifest, no service worker, no offline, no install metadata. Icons exist. |
| Route robustness | **No `error.tsx` / `loading.tsx` / `not-found.tsx` / `global-error.tsx`** anywhere in `app/`. No offline handling. |
| Verification | 472 tests pass, but **every test stubs D1 at the `globalThis.fetch` boundary** — the app has never been observed running. |

---

## Phase 1 — Independent advisor responses

### 1. Contrarian Skeptic — *"'Mature and foolproof' is the most dangerous thing you have asked for."*

Foolproof is a claim about failure modes, and every failure mode you have not tested is one you
have. You are one session away from shipping two features that fail *quietly and destructively*:

1. **Offline service worker + authenticated API.** A PWA caches responses. This app's every screen
   is authenticated data (`/api/notes`, `/api/chat`, `/api/calendar`). A service worker that caches
   API responses will, on a shared or lost device, serve one user's private notes and chat from
   cache — and it will do it *offline*, where no server log sees it. This is the single most likely
   way "foolproof" produces a breach.
2. **Calendar export with sloppy time.** `starts_at` is text; `timezone` defaults to `UTC`; nothing
   validates it. Export that to ICS and a phone's calendar is wrong by the UTC offset — events at
   the wrong time, silently. A calendar you cannot trust is worse than no calendar: you miss the
   study block and you blame yourself, not the app.
3. **Features on a write-only spine.** The registry is 6 writers / 0 readers. Building
   "interconnection" on it multiplies unverified surface, and nothing tests the read side because
   there is no read side.

The failure already happening: **the app has never been run.** Not once, against real storage. Every
confidence claim in this session — including mine — rests on a stubbed network boundary.

Fatal vs annoying: the missing PWA is *annoying* (you can still use the web app). The cache leak and
the wrong-time calendar are *fatal* (trust). **If this materialises, it ends the product:** one
private-notes-in-cache incident is terminal for a study app people put their real schedule in.

**What would change my mind:** one real end-to-end run against real D1, and an offline design that
provably never caches authenticated API responses.

---

### 2. First-Principles Engineer — *"Define the actual requirement: trust, not features."*

Strip the vision to the underlying need. Nobody wants "a PWA" or "an ICS feed"; they want **to trust
this app with their real notes, their real schedule, and their real study time, on the device they
actually carry.** Everything else is a means.

Facts / assumptions / conventions:
- **Fact:** the parts exist (chat, activities, Studio, graph). Breadth is *not* the constraint.
- **Fact:** the spine that would connect them (the registry) reads nothing.
- **Assumption the vision rests on:** "more capability ⇒ more mature." False. Maturity is a property
  of *failure behaviour*, and failure behaviour is unmeasured here.
- **Convention:** "PWA" as a checklist item. The real requirement is *durable, installable, offline-
  honest* — which constrains the cache policy, not the icon set.

The constraint that actually binds: **there is no verified runtime.** So the minimal reconstruction
of "mature" is four properties, in order of whether their absence is fatal:
1. **Durability** — data must not be lost, and must be *exportable* (maturity includes exit safety;
   a user who cannot leave is not a trusting user).
2. **Time correctness** — a calendar must be right in the user's zone, with alarms, or it is worse
   than a to-do list.
3. **Offline honesty** — work offline, but *never* cache another user's private data; surface
   "offline" rather than lie.
4. **Installable** — manifest + icons + a service worker, so it opens like an app and survives a
   flaky connection.

Then, and only then, the *interconnection* spine: one object identity (the registry) so a Vault item
can be scheduled, shared, practised and reviewed. That is the vision's real architecture; today it
is a table nobody reads.

**What would change my mind:** evidence that breadth, not trust, is what current users lack. There is
no such evidence, because there are no observed users.

---

### 3. Expansionist — *"The closed loop is the unfair advantage. Build its spine."*

Ignore budget. Three years out, LEARN is the one place where **a thing you make is the thing you
practise, the thing you schedule, and the thing you share** — no export/import between five tools.

The asset competitors structurally cannot copy is the closed loop, and you have already built every
station of it: create (Studio/Vault) → practise (quiz/activities) → review (FSRS `review_items`) →
schedule (`calendar_events`) → share (Social/groups) → repeat. What is missing is the **track between
the stations**: the registry. `content_items` is designed to be exactly that spine — one identity,
one owner, one visibility, one history — and **it reads nothing**. Wire it and suddenly:

- a Vault item can be **scheduled** (calendar row referencing a content item) and **shared** (a grant);
- a quiz can be **launched as a multiplayer game** from wherever it lives;
- anything can be **reviewed** (already keyed by `source_type`/`source_id`);
- **Discover/Search** become real (they were supposed to read `content_search`).

Amplify the one channel that compounds for a study app: **the calendar you already trust.** A public
ICS feed turns LEARN into the user's actual schedule brain on every device, and every scheduled block
pulls the user back into the loop. That is a growth loop disguised as a feature.

**Ceiling:** single-tenant study workspace, not a marketplace. Excellent for one person and their
groups; do not pretend otherwise.

**What would change my mind:** if reading `content_items` shows it is already stale versus the domain
tables, it is a broken mirror — delete it, do not build on it.

---

### 4. Outsider — *"Nothing here tells me it is ready. Some of it tells me it is not."*

I am new. Here is what I found by trying to *use* it, not read it.

There is **no way to install this**. No "add to home screen", no offline, no icon on my phone. It is a
website pretending to be an app, and "pwa" was in the request, so someone knows it — but it is not
here.

There is **no reminder.** I put a study block in the schedule and then... nothing happens, ever. My
phone's calendar is where I actually live; this app cannot reach it. So the schedule is a drawing of
a schedule.

I press back or hit a broken page and get **nothing friendly** — a blank or a raw error. A "ready" app
tells me what happened and how to get back.

And the vocabulary still defeats me: **Vault**, **Studio**, **Notes**, **Docs**, **Feed**. I asked
last time; I still cannot tell you the difference between a Note and a Doc, or why editing lives in
two places. If I, an intelligent newcomer, have to ask, the design has not finished.

Where it genuinely lands: the *feel* of the editors is good, the chat looks real, the AI is not
decoration. The problem is not quality; it is that **it never leaves the browser tab.**

**What would change my mind:** install it, get reminded, and lose nothing when my connection drops.
That is the whole bar for "ready."

---

### 5. Executor — *"Make it installable and make it remind me. One sitting."*

Forget the roadmap; here is tomorrow morning, and it is deliberately small:

1. Add a **web app manifest** (name, icons already in `public/`, `display: standalone`, theme
   colours, `start_url`) and link it.
2. Add a **service worker** with the *narrowest useful* policy: cache the app shell and static
   assets; **never** cache `/api/*` (authenticated). Handle offline with an honest page.
3. Add **one** real calendar capability: a `GET /api/calendar/ics` that emits an RFC 5545 feed with a
   `VALARM` (default lead time) so the phone's own calendar app shows a reminder.

**Observable signal:** the app installs to a home screen, opens offline to a shell, and a scheduled
block appears in my phone's calendar with an alarm that fires.

**Kill criterion (pre-committed):** *if the ICS export requires a recurrence engine or a new table to
be useful, ship a single-occurrence export with a fixed default alarm lead time and stop — do not
build recurrence in this step.* Recurrence is a project; a correct single event with an alarm is a
result.

This beats the alternatives because it is the only step that makes the app **usable outside the tab**,
it is fully verifiable in this environment (a pure ICS generator is deterministic), and it closes the
single loudest gap between the vision and the code.

**What would change my mind:** if the service worker cannot be tested here and the owner will deploy
it blind, then do the ICS feed first (pure function, fully testable) and treat the SW as the second
half — never ship an untested cache.

---

## Phase 2 — Anonymous cross-critique

*Re-presented as A–E, shuffled.*

- **A (Skeptic)** — Strongest: names the two genuinely terminal failure modes (cache leak, wrong-time
  calendar) and the never-run fact. Biggest blind spot: gives no buildable path; "get a real run" is
  not something an agent can conjure, and it dismisses installability, which the Outsider shows is the
  felt gap.
- **B (First-Principles)** — Strongest: reframes maturity as trust/durability/time-correctness/offline
  honesty — and adds **export/backup** as exit safety, which nobody else named. Biggest blind spot:
  understates the loop; it treats interconnection as a "then", when the Expansionist shows it is the
  product.
- **C (Expansionist)** — Strongest: identifies the spine (registry) as the real architecture and the
  ICS feed as a growth loop. Biggest blind spot: assumes the registry is a live mirror and would build
  on it without first checking — the very query it then admits it should run.
- **D (Outsider)** — Strongest: "it never leaves the browser tab," the no-reminder observation, and
  the still-unresolved Vault/Studio/Notes confusion. Biggest blind spot: states the bar (install,
  remind, lose nothing) but offers no mechanism.
- **E (Executor)** — Strongest: the only concrete, verifiable, one-sitting step, with a real kill
  criterion and a self-imposed safety ordering (pure ICS before untestable SW if blind). Biggest blind
  spot: says nothing about the registry spine or data export, so it could deliver "installable" while
  "interconnected" stays a promise.

**Convergences (highest confidence — opposite personas landing on the same point):**

1. **Skeptic + First-Principles:** *trust before capability* — and specifically, an offline cache must
   **never** hold authenticated API responses, and calendar time must be zone-correct. Both arrive at
   this from opposite directions (leak risk vs. requirement definition).
2. **First-Principles + Expansionist:** *the registry is the decision, and it must be measured before
   it is trusted* — wire it into a real read path or delete it; a broken mirror must not be built on.
3. **Outsider + Executor:** *installability + a real reminder are the first felt maturity* — the app
   must leave the tab before anything else matters.

---

## Phase 3 — Chairman synthesis

**Verdict: proceed with changes — sequence "make it trustworthy and installable before it is more
capable," and do not add a feature on top of an unverified boundary.** The single decisive reason: the
owner's own word is *foolproof*, and the measurements show the app has never been run and has no
offline, no reminders and no error surfaces — capability is not the constraint; **trust is.**

**The 1-hour decision.** Two answers reorder everything: (a) run `smoke:cloudflare` (or the closest
real run) for one loop; (b) `SELECT count(*)` on `content_items` versus its source tables — *live
mirror or stale?* If (a) is impossible here, say so plainly and treat every claim as static.

**The biggest risk to watch.** An offline service worker that caches authenticated API responses. It
is the one change that converts "foolproof" into a private-data leak, and it fails silently, offline,
unlogged. Earliest signal: a cache rule that matches `/api/`.

**The #1 step.** **Ship the calendar's escape hatch first — a correct RFC 5545 ICS feed with a
`VALARM` — because it is a pure function, fully verifiable here, and it is the one feature that makes
the app useful on the device the user actually carries.** Then the PWA shell with a conservative,
API-free cache. Do not build interconnection on the registry until the mirror has been measured.

**Sequence:**

1. **Calendar trust + escape hatch** — zone-correct events, ICS export/subscribe with alarms. *(pure,
   testable; today)*
2. **Installable PWA** — manifest, icons, service worker caching **only** the app shell/static
   assets; honest offline page; update path. *(never cache `/api/*`)*
3. **Foolproof surfaces** — route-level `error.tsx` / `loading.tsx` / `not-found.tsx`; offline and
   failure states that tell the truth.
4. **Data ownership** — export/backup (JSON/archive) so the user can leave; this is what "genuine"
   means for a data app.
5. **Voice everywhere** — the remaining compose surfaces (chat, vault).
6. **The spine** — measure the registry, then wire one real read path (Library/Discover) or delete the
   write-only half. Everything "interconnected" depends on this.
7. **Multiplayer maturity** — turn the existing Durable Objects into the Messenger-style mini-game
   launch from any activity.

---

## Phase 4 — Outcome (this session executed the #1 step and four neighbours)

**The #1 step, executed.** Commit `612219d` shipped the calendar's escape hatch: `src/lib/calendar/ics.ts`,
a pure RFC 5545 serialiser (UTC `Z` timestamps, RFC 5545 escaping, 75-octet folding, a `VALARM` per
event), an authenticated `GET /api/calendar/ics` export, a **tokenised public subscription feed**
(`GET /api/calendar/ics?token=…`) and `POST /api/calendar/feed` to mint the copy-pasteable URL, plus a
reminder selector in the Calendar view. Migration `0014` adds `users.calendar_feed_token` and
`calendar_events.reminder_minutes`. The UTC rule reuses `parseTimestampMs` so a bare
`"YYYY-MM-DD HH:MM:SS"` is read as UTC — the exact local-time bug the Skeptic named. 34 tests.

**Also executed (the two convergences, plus voice):**

| Commit | Change | Council item |
| --- | --- | --- |
| `6563f93` | Installable PWA: `app/manifest.ts`, `public/sw.js`, `public/offline.html`, registration component, and `error.tsx` / `global-error.tsx` / `loading.tsx` / `not-found.tsx`. **The service worker can never cache `/api/`** — an explicit bail-out with a behavioural test (a `node:vm` sandbox proving zero cache writes for API traffic, with a control request that does write). It also refuses to cache rendered navigations, because app HTML is per-user SSR. | Steps 2–3; Skeptic's hard constraint |
| `6288af3` | Dictation wired into the chat composer and the Vault block field, completing voice coverage on all four intended surfaces, with a wiring guard test. Removed an inert mic stub that saved nothing. | Step 5 |
| `ca542b4` | **Security:** `listNotes`/`getNote`/`getDashboardData` returned **every** user's notes to any signed-in user; reads are now owner-scoped, and a sibling audit classified every other `list*`/`get*`. | Convergence #1 (trust) |
| `89da16f` | **Security:** `deleteNote`/`restoreNote` were a write-IDOR (`UPDATE notes WHERE id = $1`, no owner predicate) — any user could archive another's note. Now guarded. | Convergence #1 (trust) |

**The 1-hour decision, answered.** *Is the registry a live mirror or a stale one?* — **unanswerable in
this environment**, and that is itself the answer: there is no reachable D1 to count rows against, so
the registry remains **write-only and unmeasured**. The decision (wire one real read path, or stop
writing the write-only half) therefore stands unchanged and was deliberately **not** acted on.

**The highest-confidence convergence, closed or not.** Convergence #1 (*trust before capability*) —
**partially closed and substantially advanced**: the notes read/write leaks are fixed, and the PWA's
cache policy is explicitly API-free. It is **not** fully closed, because there has still been **no real
end-to-end run**. Convergence #2 (registry) is **decided but deferred**, for the reason above.
Convergence #3 (installability + reminders first) is **closed** — both shipped.

**What each advisor got right / wrong:**

| Advisor | Right about | Wrong about |
| --- | --- | --- |
| Skeptic | The cache-leak and wrong-time-calendar failure modes — both became explicit design constraints and both are now tested | It read "no real run" as a reason to stop rather than a reason to change the cache policy |
| First-Principles | Trust/durability/time-correctness as the definition of mature; the listener that led straight to the notes read-scope fix | It ranked export/backup above installability, which the Outsider showed is the felt gap |
| Expansionist | The ICS feed as a growth loop (shipped) and the registry as the spine (still correct, still unbuilt) | Assumed the registry was a live mirror and would have built on it unmeasured |
| Outsider | "It never leaves the browser tab"; the missing reminder; the dead control | Could not separate shared-by-design surfaces from leaks (the audit had to) |
| Executor | The smallest verifiable step, with a kill criterion and a self-imposed "test the pure part first" ordering | Did not mention the security leaks that the audit then found |

**What is still open, unchanged.** No real end-to-end run (every test stubs D1); the registry is still
write-only; `studio-view.tsx` is still 4,041 lines; **no recurrence (`RRULE`) and no push
notifications** — only `VALARM`; no 192×192 / 512×512 PNG icons exist (the manifest falls back to the
SVG); `getPublicProfile` does not enforce `profile_visibility`; `listAdminData` relies on its route
for the admin gate; and the Outsider's day-one question still has no answer inside the product.
