# AI Council — Session 5: verification pass over the goal delivery

**Date:** 2026-09-22
**Skill:** `ai-council` (verification mode)
**Revision:** `8a90065` (`cleanup/stage-1`) — tsc exit 0 · 828/828 tests · 75 test files · 54 route handlers
**Purpose:** the owner asked to *"finish the tasks, and make sure you verify everything using ai council and deadcode and duplicate."* This session audits the delivered work rather than proposing new work.

## Input: the claims under audit

Eight commits, each with mutation-proven tests:

| Commit | Claim |
| --- | --- |
| `eb029b1` | Free-form drag-and-drop canvas (pure engine + editor + persistence) |
| `e851ce4` | Themed normalization of any AI response (never raw, never unsafe) |
| `3ee39f1` | DOCX + XLSX export via a dependency-free ZIP/OOXML writer |
| `dba0961` | Revocable share links + permission model enforced on writes |
| `d244733` | Kahoot-style live quiz (engine, host/player screens, persisted results) |
| `1d73247` | Multiplayer games launched from chat, three modes |
| `e8507fd` | Two proven duplicates consolidated; 90 symbols de-exported |
| `557881d` | DOCX/XLSX import, closing the export round-trip |
| `578b203` | Rendered share page, share UI on quizzes, AI blocks dropped on canvas |
| `8a90065` | Root loading boundary removed so `notFound()` sets a real 404 |

Machine-verified state: **duplication groups 0** · `unusedExports 0` · `orphanFiles 0` · `internalOnlyExports 243` (from 327) · 10 "unused deps" (build tooling, false positives) · 3 i18n type-only cycles (benign).

---

## Phase 1 — Independent advisor responses

### 1. Contrarian Skeptic — *"Every green number here is green about a program nobody has run."*

The strongest objection is not to any individual claim; it is to the *shape* of the evidence.
Every one of the 828 tests stubs the database at the `globalThis.fetch` boundary. There has never
been a request through a real D1, a real R2 bucket, or a browser. So "828/828" certifies internal
consistency, not function.

Three claims are weaker than they read:
1. **Multiplayer sync.** The live quiz is "verified" by a pure reducer plus a polling loop. The
   reducer is genuinely solid; the *sync* — two devices converging inside a second — is untested and
   unobserved. Calling the criterion "met" invites the reader to picture a working Kahoot session.
2. **The canvas is usable.** Drag/resize/rotate is proven *mathematically* (the anchor invariant is a
   real proof) but the pointer plumbing, hit-testing under a real device pixel ratio, and touch
   behaviour are unexercised. A canvas you cannot drag on a phone fails the acceptance criterion that
   matters most to the owner.
3. **DOCX/XLSX round-trip.** The importer was proven against *our own* writer and against Windows'
   ZIP re-compression. That is good — better than most. But no Word or Excel process opened the files.

Worst case that is already happening: the delivery report says "partial" in six places, and a reader
skims eight green ticks and hears "done". **If this materialises, it ends in a demo that fails on
stage** — the exact outcome the "never run" gap predicts. The mitigation is not more tests; it is one
honest end-to-end run before anyone is told this is finished.

**What would change my mind:** one live deployment exercised by a browser — install, drag one
rectangle, host one quiz with two devices, export one file opened in Word.

---

### 2. First-Principles Engineer — *"Separate what is proven from what is merely consistent."*

Reduce the eight commits to their evidential class.

**Proven (deterministic, reproducible, falsified by mutation):** the geometry engine (anchor
invariance across 7 rotations × 8 handles is a *proof*, not a sample); the ICS UTC conversion (the
test derives what a local misread would produce and asserts disagreement); the ZIP writer's CRC
(12/12 against `node:zlib`, a foreign implementation); the OOXML part set (unzipped by a foreign
tool); the AI sanitizer (a mutation turns exactly the security tests red); the permission rules; the
three game modes' distinguishing rules.

**Consistent but unproven (stubbed boundary):** every route handler's behaviour against a real D1;
chat delivery; live-quiz sync; persistence across devices.

**Assumed:** that the deployment target accepts the code (`next build` was never run this session —
the last verified build predates eleven commits).

That third category is the one the owner should be told about explicitly, because it is the only one
that can move without anyone writing code: `next build` on a clean checkout, then one browser run.

The irreducible statement: **the project now has a body of *verified logic* and an unverified
*runtime*.** The second is not a job for more unit tests; it is a job for one build and one deploy.

**What would change my mind:** a `next build` that completes, and one smoke run against a live URL.

---

### 3. Expansionist — *"The pieces now connect. That is the thing worth saying."*

Ignore the gaps for a second and look at the shape of what now exists. Before this work, LEARN was a
set of good parts that did not touch: a canvas with nothing draggable, an AI that emitted raw text, a
"share" model written and never read, a chat with a *fake* quiz-battle button, an export path that
could write PPTX but not the two formats people actually exchange.

Now: create → format → export → import → share → play live → record in the thread. The spine the
earlier councils kept pointing at is genuinely loadable — AI blocks drop onto the canvas, a live
session launches from a chat thread, a share link resolves to a real rendered page, and a DOCX that
leaves the app can come back. That is the "comprehensive and integrated" the owner asked for, and it
is *built*, not planned.

The unfair advantage is unchanged and now closer to real: **the same object can be made, practised,
scheduled, shared and played.** Nothing else in the owner's stack does that in one place.

Ceiling, stated honestly: single-tenant study workspace. And none of this compounds until someone
uses it — which is the Skeptic's point, and he is right about it.

**What would change my mind:** evidence the seams are cosmetic — e.g. the canvas drop works in tests
but not with a real pointer. One browser session settles it.

---

### 4. Outsider — *"The claims are careful. The product still explains itself badly."*

I read the delivery report. It is unusually honest — it says "partial" and "unverified" where most
reports would say "done". I trust it more than most.

Then I open the app. I am asked to distinguish a **Vault** from a **Studio** from a **Notes** from a
**Docs**. I still cannot, and nothing on screen tells me. There is now a **Canvas**, a **Live** and a
**Chat** as well — five nouns competing for "the place where things are". The owner's own acceptance
criterion says *"the UI/UX must be genuinely clean and easy to use and understand."* The new surfaces
are clean; the *system* still is not.

Second: several "join" and "share" flows now exist, but a first-time user has no idea any of it is
there. Nothing introduces the loop. The app is more capable and no more legible.

**What would change my mind:** a named, single entry point for "make something", and a first-run
screen that names the five places in one sentence each.

---

### 5. Executor — *"One hour, one build, one browser. Stop saying 'unverified'."*

Everything the council is arguing about collapses into one sitting:

1. `pnpm install` in a normal terminal (the one step this sandbox cannot do), then `next build`.
2. `next start` (or the Cloudflare preview script), open it in a browser.
3. Do three things by hand: drag a rectangle on the canvas, start a live game from a chat thread and
   join it in a second tab, export a DOCX and open it.

**Observable signal:** either it works (and every "partial" in the report becomes "verified", which is
worth more than the next three features), or it breaks in a specific, fixable place.

**Kill criterion (pre-committed):** *if the build fails on something the sandbox could not have caught
— a symlink, a native binary, a missing binding — stop building features and fix only that, because
until the build is green nothing else is real.* Do not start the next feature while the build is red.

**What would change my mind:** if the owner's environment cannot run a build either, then the honest
deliverable is what exists now plus the explicit statement that the runtime is unverified — which is
what the report already says.

---

## Phase 2 — Anonymous cross-critique

- **A (Skeptic)** — Strongest: *"828 green tests about a program nobody has run"*, which is precisely
  true and precisely the thing a report can hide behind. Blind spot: treats "unverified" as
  damning, when the report already says so six times; it also cannot say what to *do*.
- **B (First-Principles)** — Strongest: the proven/consistent/assumed trichotomy — it converts a vague
  worry into three named categories, and only one of them needs a deploy. Blind spot: underrates how
  much the mutation-proven logic buys; a proof of the anchor invariant is not "just consistency".
- **C (Expansionist)** — Strongest: it is the only voice that names what changed *structurally* — the
  seams are now loadable. Blind spot: enthusiasm for the architecture does not make a single loop
  observed.
- **D (Outsider)** — Strongest: the claim quality is high but the *product's legibility* is not, and
  the owner's own criterion 13 is about legibility. Blind spot: proposes a first-run screen without
  acknowledging that no feature is worth it until the runtime is proven.
- **E (Executor)** — Strongest: it is the only response whose first action is one command, with a
  kill criterion that forbids starting anything else while the build is red. Blind spot: assumes the
  owner's environment can build, which the brief says it can — so this is fair.

**Convergences (highest confidence):**
1. **A + B:** the runtime is unverified, and *that* — not any missing feature — is the top risk.
2. **B + E:** the fix is one build and one browser run, in that order, before any new work.
3. **C + D:** the seams now connect, but nothing explains them; legibility is the next *product* gap
   once the runtime is proven.

---

## Phase 3 — Chairman synthesis

**Verdict: the delivery is genuine and its own report is honest — stop building, and go verify the
runtime.** The decisive reason: every advisor independently converged on the same asymmetry — the
git history now contains *proven logic*, and the project has *no verified runtime*. Adding a tenth
feature would enlarge the unverified surface; one build and one browser session would convert six
"partial" verdicts into facts.

**The 1-hour decision.** `pnpm install` → `next build` → open the app and do three actions by hand.
Answer in one word: does the build pass?

**The biggest risk to watch.** Treating "828/828" as "it works". The earliest observable signal is
someone quoting that number without the sentence that follows it in the report: *every test stubs the
database*.

**The #1 step.** Run the build. Kill criterion: if it fails on environment-specific grounds, fix only
that and stop — do not start another feature while the build is red.

**Sequence after that:** (1) the build + browser smoke; (2) criterion 13 — name the five places and
give the app one entry point; (3) the remaining 243 internal-only exports *if* anyone values a
smaller public surface (low payoff); (4) the two sub-12-line duplicate types the scanner could not
reach (`QuizChoice`, `DashboardWeakTopic` — declared twice with *different* shapes).

---

## Phase 4 — What the evidence actually supports

| Claim | Support | Verdict |
| --- | --- | --- |
| Canvas geometry is correct | Mutation-proven anchor invariance, 51 tests | **Proven** |
| AI output is themed and safe | Mutation flips exactly the 3 security tests | **Proven** |
| DOCX/XLSX are valid OOXML | Foreign unzip + 12/12 CRC vs `node:zlib` + real Word/Excel files imported | **Proven (format)** |
| Share links enforce roles | 42 tests; expiry mutation flips the test | **Proven (logic)** |
| Live quiz rules are correct | 51 engine tests; two mutations flip the right tests | **Proven (logic)** |
| Chat-launched games sync in real time | Reducer proven; transport only structurally covered | **Unproven (runtime)** |
| The app installs, runs and stays smooth | Never built or opened this session | **Unproven (runtime)** |
| UI/UX is clean and understandable | New surfaces yes; the five-noun system no | **Partially met** |

**Standing risk unchanged:** no live run. **Residual defects recorded, not fixed:** two duplicate type
declarations with divergent shapes; 243 internal-only exports; no PDF engine (print only).
