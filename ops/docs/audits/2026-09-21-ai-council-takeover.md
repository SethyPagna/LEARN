# AI Council — Session 3 (Takeover): how to finish LEARN

**Date:** 2026-09-21
**Skill:** `ai-council`
**Revision:** `49f468a` (`cleanup/stage-1`), baseline tsc exit 0 · 436/436 tests
**Input to the council:** the new owner's instruction — *"take over from workbuddy; use
ai-council, debloat, deadcode, optimize; make it efficient, stable and consistent; and
make all the features fully made, well designed, complete, comprehensive and integrated."*

The council was given the measured state, not a pitch:

| Fact | Value |
| --- | --- |
| Source files | 240 code files / 188 non-test |
| God modules | `studio-view.tsx` 4,041 · `data.ts` 2,561 (100 exports) · `social-features.ts` 1,729 |
| Orphan files | 0 |
| Unused exports | 15 (11 unused type declarations in `components/learn/types.ts`) |
| Internal-only exports | 289 (de-export candidates) |
| "Unused" dependencies | 10 — mostly build/type tooling (false positives) |
| Import "cycles" | 3 — all benign i18n `import type` back-references (false positives) |
| Route handlers | 50 total, **7 with any test** |
| Routes with **no consumer** anywhere outside `app/api` | 6 |
| Content registry (`content_items`/`shared_access`/`content_versions`/`content_attachments`) | written by 6 save paths, **read by nothing** |
| Voice transcription | implemented, wired into 2 surfaces (AI composer, Studio doc editor) |

---

## Phase 1 — Independent advisor responses

### 1. Contrarian Skeptic — *"This fails as a refactor, not as a feature."*

The instruction contains an unbounded verb: "make **all** the features fully made." There is
no definition of done, no user, and no acceptance signal, so the work cannot terminate — it
can only stop. That is the first failure mode: **an open-ended polish pass that ends when
attention runs out, leaving the tree half-migrated.**

Named failure modes, by likelihood × severity:

1. **Refactor without a net (highest).** `studio-view.tsx` is 4,041 lines with 36 `useState`
   and 20 `useEffect`. Splitting it is the obvious "structural" win and the obvious disaster:
   7 of 50 handlers are tested, there are zero component tests, and there is no end-to-end
   run against a real browser and a real D1. Every regression the split introduces lands in a
   region the suite cannot see. `tsc` and 436 green tests will stay green through it. This is
   the same class of mistake the previous council already flagged — doing the impressive thing
   before the verifiable thing.
2. **Integrating a subsystem nobody uses (high).** "Complete and integrate the content
   registry" sounds like progress. The registry is *written by six save paths and read by
   nothing*. Building the read path adds surface to a subsystem with **zero users**, and no
   test can tell you whether the read path is the one a real person needs — because no real
   person has used the app to find out.
3. **Deleting intent (medium).** Stage 1 already parked four modules as *"tested but
   unreachable"* (`learn-route-features.ts`, `cloudflare-cleanup.ts`, `workspace-cleanup.ts`,
   `content-search.ts`). Deleting them deletes passing tests. That is a decision about intent,
   and a cleanup pass is exactly the context in which it gets made silently.

The failure that is **already happening**: the app has more features than evidence. Two prior
councils reached the same conclusion from different directions. A third pass that adds
"completeness" without adding a single user-visible truth continues that pattern.

**What would change my mind:** a single real end-to-end run — a browser action against a real
D1 producing a real stored result — proving any one loop works outside the stubbed harness. One
such run converts the entire "stable" claim from decoration into fact, and makes every later
refactor checkable. I would then support the structural work.

---

### 2. First-Principles Engineer — *"You have never run this program."*

Reduce to facts, assumptions, conventions.

**Facts (measured):** 436 tests pass; `tsc` is clean; 0 orphan files; 15 unused exports; 50
route handlers exist; 6 have no consumer.

**The load-bearing assumption everyone is acting on:** *"tests pass" means the app works.*
It does not. Every one of the 436 tests stubs the database at the `globalThis.fetch` boundary
(`src/tests/api/harness.ts`). Not one test opens a real D1, a real R2 bucket, or a browser. The
suite proves the code is *internally consistent*, not that it *functions*. The strongest
evidence in the whole repo — the verified `next build` — proves it **compiles and prerenders**,
not that it **runs**.

**The irreducible problem:** the app has no verified path from a user action to a durable
result. Restated: *stability is unproven at the exact seam where stability matters.* No amount
of debloating changes this, because debloating optimises code that has never been observed
working.

**Facts vs conventions in the plan:**
- "Split the god module" — convention (it is good practice), not aimed at the real problem.
- "Remove dead code" — fact (the analyzer proves it), cheap, safe. Earns its cost.
- "Wire the content registry" — **assumption** that the registry is the intended backbone. The
  evidence (six writers, zero readers) is equally consistent with *the registry being an
  abandoned first attempt*.

**Minimal reconstruction.** Cheapest path to truth: take the *existing* smoke script
(`smoke:cloudflare`, already in `package.json`) and run it against one real environment for one
loop. If that is impossible here, the honest fallback is to make the *stubbed* harness assert
one genuine create→read→play cycle end-to-end (it nearly does: `quiz-loop.test.ts`), and label
everything else explicitly unverified. Then debloat (facts), optimise (mechanical), and
**explicitly decide** the registry (wire one real read path, or delete it) instead of leaving it
in the write-only limbo that makes it look integrated when it is not.

**What would change my mind:** evidence that the app has been exercised by a real user against
real storage. Absent that, "complete" is a claim about code shape, not about a product.

---

### 3. Expansionist — *"The registry is the backbone you already paid for."*

Ignore budget. Three years out, what is LEARN? It is a **personal learning graph**: every note,
doc, sheet, deck, quiz, media file and micro-lesson is a node; every share, group and room is an
edge; every attempt, review and interaction is a signal. What makes that compound is that *every
artifact is one object with one identity, one owner, one permission set and one history* —
findable, shareable, versioned, and playable.

Look at what already exists and is **90% built but wired to nothing**: `content_items` (identity
+ owner + visibility + type), `shared_access` (user/group/space/public-link grants with roles and
expiry), `content_versions` (history), `content_attachments` (media links), plus `content_search`
(a denormalised search table with four indexes) and `practice_sessions.source_content_item_id`
(the "artifact becomes activity" link the quiz-loop test proves). This is a Drive-class model
sitting inert. Quizzes are not even registered in it — the `item_type` CHECK constraint already
allows `'quiz'`, and nothing writes it.

**The unfair advantage:** the learning↔content link. Most tools can store your notes or quiz you;
few make *the thing you made* and *the thing you practised* the same addressable object with a
review schedule attached (`review_items` keyed by `source_type`/`source_id`). Wire the registry
to one read path — a Library/Discover view that lists `content_items` by visibility and type,
with `content_search` behind the search box — and you get comprehensiveness *and* integration in
one move: every feature you already built becomes discoverable through the same lens.

**Flywheel:** artifacts are created → registered → discovered by you and your groups → shared via
`shared_access` → practised (creating `practice_sessions` against the content item) → reviewed
(`review_items`) → surfaced again on the Dashboard and Feed. Every loop already has its table.

**The ceiling:** this is a single-tenant study workspace. The registry makes it excellent for one
person and their study groups; it does not make it a marketplace. That is fine — say so, rather
than adding a tenth surface.

**What would change my mind:** if reading `content_items` reveals the rows are stale or duplicated
relative to the domain tables, the registry is a broken mirror and should be deleted, not
extended. That is one query to answer — do it before building.

---

### 4. Outsider — *"I can't tell what this is for, and neither, I suspect, can a new user."*

I have no context. I opened this and here is what I actually see.

There are 50 API endpoints. Six of them — an audit log, an automation runner, a health check, a
micro-lessons list, a moderation list, and something called "vault blocks" — are called by
**nothing**. Not by a screen, not by a script. They are rooms with no doors. In a house, that is
either a room I have not been shown or a room that should not exist; either way, *someone should
be able to tell me which.*

There is a database table called `content_items`. Six parts of the app write to it. Nothing reads
it. It is a filing cabinet that gets filled and never opened. Why is it there? If the answer is
"a screen was planned", where is the screen? If the answer is "we changed our minds", why is it
still being filled on every note save?

And there is vocabulary I cannot decode from the app itself: a **Vault**, a **Studio**, **Notes**,
**Docs**, a **Graph**, a **Feed**, **Spaces** that are apparently **Groups**. Are Vault and Notes
the same thing? Is a Doc a Note? An outsider cannot tell, which means a new user cannot tell
either — and "well designed" to me means I never have to ask that question.

I will say where this genuinely lands: the *pieces* look built with real care — keyboard-shortcut
hints, focus states, mindful animation. The **wholeness** is missing. You have five ways to store
text and six ways to be social and no single answer to "what do I do first?"

**My naive questions:** For each of the six doorless rooms — is it a feature I have not found, or
leftovers? Does the filing cabinet have a drawer I can open, or is it rented storage you forgot
to cancel? If a brand-new user logs in tomorrow, what is the one thing they do, and which of these
fifty endpoints does it call?

**What would change my mind:** a two-minute answer, in the product's own voice, to "what do I do
on day one?" If the app can answer that, my objections about Vault-vs-Notes dissolve.

---

### 5. Executor — *"Open the six doorless rooms. One sitting."*

Forget the roadmap. Here is tomorrow morning.

Take the six routes nothing calls — `/api/audit`, `/api/automation/run`,
`/api/integrations/health`, `/api/micro-lessons`, `/api/moderation`, `/api/vault/blocks` — and go
through them one at a time. For each, answer exactly one question: **which screen should show
this?** Then either wire it to that screen (with a test), or delete it (with its test).

**Cost:** one sitting. Several are admin-only and probably belong on one admin page; several may
be redundant with a route that *is* called (`/api/admin` may already carry audit data; the feed
may already serve micro-lessons). Finding out is a grep and a read, not a project.

**Observable result that counts as signal:** the count of consumer-less routes goes 6 → 0, and it
stays 0 because a test asserts it (extend the existing security invariant pattern: every route
must be referenced by a consumer or listed in a capped allowlist).

**Kill criterion (pre-committed):** *if wiring a route requires a new table, a new migration, or a
new view component, stop — that means it was never a UI feature, and the correct action is to
delete it instead.* An endpoint that needs a new screen to justify it is not "incomplete"; it is
unwanted, and deleting it is the honest completion.

This beats every other first step because it produces **information** (which of these six is
real) for the cost of reading six files, and it directly reduces the "features that are present
but not integrated" count the owner is asking about.

**What would change my mind:** if any of the six turns out to be load-bearing for a flow I cannot
see from the outside (an ops script, a webhook, a cron), then it is not doorless — it just has a
door I have not found, and the answer is to document it, not delete it. Verify before cutting.

---

## Phase 2 — Anonymous cross-critique

*Responses re-presented as A–E, shuffled.*

- **A (Skeptic)** — Strongest: it correctly names the unbounded verb. Biggest blind spot: it
  offers no path forward at all; "get a user first" is true and useless to an agent that cannot
  acquire one. It also overstates the registry risk — building one read path is cheap and
  reversible.
- **B (First-Principles)** — Strongest: *"you have never run this program"* is the single most
  important sentence in the session, and it is provable from the harness. Biggest blind spot: it
  treats "no real run" as unsolvable, when the app ships a `smoke:cloudflare` script that is
  exactly the missing evidence — the gap is that nobody ran it, not that it cannot be run.
- **C (Expansionist)** — Strongest: it identifies the one asset that is simultaneously
  comprehensive and integrative, and it checks itself (staleness query before building).
  Biggest blind spot: it assumes the registry is the intended backbone; the six-writers-zero-
  readers fact is equally consistent with an abandoned attempt, and it nearly says so.
- **D (Outsider)** — Strongest: *"rooms with no doors"* and the Vault/Notes/Docs vocabulary
  confusion are the only findings a user would actually feel. Biggest blind spot: it does not
  distinguish harmless redundancy (a route superseded by another) from missing design, and
  "answer what day one is" is not an action.
- **E (Executor)** — Strongest: it is the only response that produces a shippable, verifiable
  result today, with a real kill criterion. Biggest blind spot: it does not say what to do after
  the six rooms are closed, and it could delete a load-bearing route if the "verify before
  cutting" note is skipped.

**Convergences (highest confidence — opposite personas landing on the same point):**

1. **Skeptic (1) + First-Principles (2):** *do not perform structural refactors before a real
   verification net exists.* Opposite reasoning (risk-aversion vs. epistemology), identical
   conclusion. This is the session's strongest finding.
2. **First-Principles (2) + Expansionist (3):** *the registry must be resolved — wire it or
   delete it — not left in write-only limbo.* Both demand one query before any decision.
3. **Outsider (4) + Executor (5):** *the six consumer-less routes are the cheapest, most concrete
   "integration" win, and "present but unreachable" is indistinguishable from dead.*

---

## Phase 3 — Chairman synthesis

**Verdict: proceed with changes — but narrow the verb from "complete everything" to "close the
seams, and add no new surface."** The owner is not wrong to want completion; the danger is
completing things nobody has connected. The decisive reason: the app's problem is *unclosed
seams* (six doorless routes, a write-only registry, two voice surfaces wired of five), not
*missing pieces* — and seams are closable and verifiable today, whereas "make everything
complete" is not a finishable instruction.

**The 1-hour decision.** Run `smoke:cloudflare` (or the closest real run available here) against
one environment, **and** run one query — `SELECT count(*) FROM content_items` versus the sum of
its source tables — to answer: *is the registry a live mirror or a stale one?* Those two
answers reorder the whole plan.

**The biggest risk to watch.** Refactoring behind a suite that cannot see the refactor. Earliest
observable signal: a "behaviour-preserving" change to `studio-view.tsx` or `data.ts` that leaves
436/436 green while the app throws in the browser. Watch for any stage that claims preservation
without a new end-to-end assertion.

**The #1 step.** **Close the six doorless routes — wire each to its screen or delete it — under
the Executor's kill criterion, and pin it with an invariant test** (every route is referenced by a
consumer or sits in a capped allowlist). It is the cheapest integration win, it produces real
information about which features are real, and it is fully verifiable in this environment.

**Sequence (shortest path that survives the convergence):**

1. **Doorless routes** — wire or delete, + invariant test. *(integration; today)*
2. **Registry verdict** — wire one real read path (Library/Discover) or delete the write-only
   half. *(integration; one decision, one query first)*
3. **Debloat** — remove the 15 unused exports, de-export the clear internal-only ones, and make
   the parked "tested-but-unreachable" four an explicit keep-or-cut decision. *(safe, mechanical)*
4. **Optimise** — batch the remaining 8 N+1 insert loops. *(mechanical, helper already exists)*
5. **Stabilise** — handler coverage for every route touched above, plus one real end-to-end check.
6. **Structure** — split `studio-view.tsx` **last**, only once steps 1–5 give it a net.

---

## Phase 4 — Outcome (the #1 step, executed in the same session)

**The #1 step, executed.** All six consumer-less routes were closed in commit `c2b01ae`
(`refactor: wire or remove the six routes nothing consumed`):

| Route | Outcome | Reason |
| --- | --- | --- |
| `/api/audit` | **deleted** | `AdminView`'s Audit tab already receives the same `audit_logs` rows from `/api/admin`. |
| `/api/automation/run` | **deleted** | Stub: wrote an `automation_runs` row marked `"queued"` that nothing executes, and no UI called it. |
| `/api/micro-lessons` | **deleted** | `GET` duplicated `/api/feed`; `POST` had no caller. |
| `/api/integrations/health` | **wired** | Rendered as a "Runtime readiness" block (database / storage / AI / encryption key) inside the admin Providers panel. |
| `/api/vault/blocks` | **wired** | The Vault block palette now persists a block against a chosen note; it previously rendered clickable tools that saved nothing. |
| `/api/moderation` | **wired** | New Moderation tab inside the existing `AdminView` (read + resolve). |

The property is pinned: `src/tests/project/route-wiring.test.ts` asserts every `app/api/**/route.ts`
is referenced by a non-route source file, or sits in a capped allowlist with a reason. The
allowlist has **one** entry (`/api/notes/[id]/versions`, no UI restores a version yet), and the test
was proven non-vacuous — emptying the allowlist fails it and names that route. Route count: 50 → 47.
Verified: `tsc --noEmit` exit 0, **439/439 tests**.

**The 1-hour decision, answered.** *Is the registry a live mirror or a stale one?* — **Not a live
mirror.** Measured: `content_items` / `content_versions` / `shared_access` / `content_attachments`
have six writing call sites (`data.ts`, `storage.ts`) and **zero** readers; `content_search` has
**zero writers and zero readers**; `moderation_items` was written by one route and read by nobody
until step 1 gave it a screen. The subsystem is not integrated, and the read path does not exist.
**Decision: do not extend it this session.** It is recorded in the audit README as an explicit
wire-or-remove decision (build one real Library read path, or stop writing the write-only half) —
because extending a zero-reader subsystem adds surface without adding a verified user outcome.

**The highest-confidence convergence, closed or not.** Convergence #3 (*doorless routes ≈ dead*) is
**closed** — the count is 0 and a test keeps it there. Convergence #2 (registry: wire or delete) is
**decided but not executed** (deferred, above). Convergence #1 (no structural refactor before a real
verification net) remains **open** and is the session's standing risk — `studio-view.tsx` was
deliberately **not** split.

**What each advisor got right / wrong:**

| Advisor | Right about | Wrong about |
| --- | --- | --- |
| Skeptic | The unbounded verb; refactor risk without a net | Gave no actionable path; overstated registry cost |
| First-Principles | "Never been run"; stub-the-DB proof; registry-as-assumption | Treated the missing run as impossible, not merely undone |
| Expansionist | Registry as the comprehensive+integrative asset; self-check | Assumed intent behind a 6-writer/0-reader subsystem |
| Outsider | Doorless rooms; Vault/Notes/Docs vocabulary collapse | Could not separate redundancy from missing design |
| Executor | The cheap, verifiable, information-producing first step | Did not sequence past the six rooms |

**What is still open, unchanged.** No real end-to-end run has been performed (the refactor net is
still missing); `studio-view.tsx` is still 4,041 lines; the registry is still write-only if step 2
chooses "delete" and nothing else changes; and the Outsider's day-one question still has no answer
in the product's own voice. None of these were resolved by executing step 1.
