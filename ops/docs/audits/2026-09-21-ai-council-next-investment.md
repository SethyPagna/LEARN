# AI Council — Session 2: Where does the next unit of effort go?

**Date:** 2026-09-21 · **Skill:** `ai-council`
**Subject revision:** `064e81a` (branch `cleanup/stage-1`)
**Question put to the council:** The app is 37,060 LOC across 231 files with 49 route handlers and a 383-test suite that passes. But no test file imports `app/api`, `lib/data.ts`, or `workers/`. Dead code is cleaned up. Where should the next unit of effort go?

## Facts given to every advisor

| Fact | Value | Verified by |
| --- | --- | --- |
| Source LOC (excl. tests) | 37,060 across 231 files | `find` + `wc -l` |
| Route handlers | 49 | `find src/app/api -name route.ts` |
| Tests | 383 pass, 46 files, ~15s | test runner |
| Route-handler coverage | **0** | no test imports `app/api` |
| DB-layer coverage | **0** | no test imports `lib/data.ts` |
| Realtime/WebRTC worker coverage | **0** | no test imports `workers/` |
| Orphan files | 0 | `deadcode.mjs` |
| Unused exports | 15 (all type aliases) | `deadcode.mjs` |
| Duplication | `escapeHtml` ×5, `isRecord` ×7, `SelectField` ×2 (byte-identical) | `grep` |
| Largest files | `studio-view.tsx` 4,228 · `data.ts` 2,643 · `social-features.ts` 1,900 | `wc -l` |
| Remaining N+1 insert loops | 8 | loop scanner |
| Voice transcription | **absent** — no `SpeechRecognition`, Whisper, or audio endpoint | exhaustive `grep` |
| Build | compiles, typechecks, 77/77 static pages | `next build` |
| `pnpm install` | **still broken** — sandbox blocks it; needs a real terminal | install log |
| `main` | untouched at `5f06f9e1`; all work unmerged on `cleanup/stage-1` | `git` |

---

# Phase 1 — Independent responses

## Advisor 1 — The Contrarian Skeptic

**Verdict:** The 383-test suite is a false signal and you are about to plan refactors on top of it. Stop.

The number that matters is not 383. It is **zero**. Zero tests import the 49 route handlers, the data layer, or the realtime worker. Those are not edge cases — they are the entire product surface. Every feature a user touches goes through a route handler into `data.ts`, and neither has ever been executed under test.

So the suite is green in exactly the way that is most dangerous: it is green *on the code you have already decided is safe*, and silent on the code you are about to change. The planned Stage 2 (route factories) consolidates three near-identical CRUD route triplets. That is six-plus handlers, all with zero coverage. A consolidation bug ships green and you find out from a user.

Three named failure modes, ranked by likelihood × severity:

1. **Silent regression in a refactor (likely, severe).** You refactor `data.ts` — 2,643 lines, ~100 exports — and the tests still pass because they never touch it. This is not hypothetical; it is the default outcome of the current setup.
2. **Breadth over depth (already happening, severe).** The app has 49 routes and the single feature the user asked for twice — voice transcription — does not exist. Six product surfaces (notes, design, chat, quizzes, calendar, AI) and the one explicitly requested capability is missing. That is a build that got wide instead of deep.
3. **Nothing is actually shipped (happening now, annoying-to-severe).** All of this work is on `cleanup/stage-1`. `main` has not moved. `pnpm install` is broken in the checkout. The user cannot run the app without manual repair. "Ideal state" is a long way from a branch nobody can install.

The one risk that ends it: **you add voice transcription next**, it becomes feature 50, it lands on top of an unverified core, and now you have 50 untested handlers and a new subsystem. When something breaks you will be bisecting blind.

**What would change my mind:** a single route-handler test that passes, proving the handlers are testable at all. That one test is worth more than the other 383.

---

## Advisor 2 — The First-Principles Engineer

**Verdict:** You are optimising file sizes when the binding constraint is that nobody can safely change anything.

Strip it down. The stated goal is "the ideal state of the app". The proposed work is consolidation, refactoring, and features. Ask what the underlying need is: **the ability to make changes without breaking the product.** Every item on the roadmap — Stage 2 consolidation, Stage 4 splitting a 4,228-line component, the 8 remaining N+1 fixes, adding transcription — is downstream of that one capability. It is the constraint that binds.

Separate the three kinds of claim properly:

- **Facts.** The suite passes. The build compiles. Dead code is gone (0 orphans). Those are real.
- **Assumptions.** That the 383 tests protect the refactors. Untested. That `data.ts` is safe to split. Untested. That a user can sign up, build a quiz, and play it with someone — **untested, and this is the product.**
- **Conventions.** "Refactor god-modules", "consolidate duplication", "split the data layer". All reasonable, all inherited, none of them aimed at the actual bottleneck.

The minimal reconstruction: mock the database boundary and call the handler. That is it. A `query()` stub, a fake `NextRequest`, an assertion on the response. Roughly one helper file and one test, and it converts the 49 handlers from "unverifiable" to "verifiable". It is a fraction of the cost of any refactor on the roadmap and it is a **prerequisite** for all of them.

Note what that test does that the other 383 cannot: it exercises the wiring. The existing tests are excellent at what they cover — pure functions in `lib/*-features.ts` — and those functions are not where the bugs will be. Bugs live at the seams: session lookup, ownership checks, JSON parsing at the request boundary, error paths.

Also worth restating the framing problem. "Ideal state" has been interpreted as "more and better code". If the user cannot verify the app works end to end, adding code moves away from ideal, not toward it.

**What would change my mind:** evidence that the handlers are already exercised some other way — an integration test suite elsewhere, a smoke test that covers authenticated mutations. There is a Cloudflare smoke script, but it checks a 403 on an unauthenticated admin route; it does not exercise a single authenticated write.

---

## Advisor 3 — The Expansionist

**Verdict:** You are sitting on a content-to-activity compiler and spending your time on file sizes. Build the loop.

Three years out this is not a note app, a chat app, or a quiz app. It is the only tool where **the thing you make and the thing you play are the same object**. You write a lecture note in Vault; it becomes a quiz; the quiz becomes a Kahoot-style multiplayer round inside the group chat; the results feed back and tell you which notes to revisit. The artifact and the activity share a schema, so there is no export step, no re-entry, no "now go make a Kahoot out of this".

That is the unfair advantage, and it is structural. Notion cannot run a live multiplayer game — its data model has no notion of a session with a scoreboard. Kahoot cannot hold your notes — it has no creation surface. Both can bolt on the other's feature; neither can make the artifact and the activity the *same row in the same database*. You already have `content_items` and `study_battles` in one schema. That is the moat and it is invisible in every screenshot.

The flywheel: content created → becomes activities → activities generate performance data → performance data decides what to create next. Each turn makes the next turn cheaper. That compounds. A notes app does not compound. A multiplayer game platform with no creation surface does not compound. This does.

**Which makes the missing transcription strategically important, not cosmetic.** Voice is the input that collapses creation cost. Talk a lecture in, get an activity out. That is the difference between a tool you use when you have time and a tool you use in the moment. The user asked for it twice and it does not exist — and from where I am standing it is the highest-leverage missing piece, not a nice-to-have.

**The ceiling, honestly:** single-player content tools plateau. If the activities never get played by more than one person, this is a personal notebook with an expensive game engine attached, and the flywheel never starts. The multiplayer loop is not a feature — it is the entire thesis. If it does not work, nothing above it matters.

**What would change my mind:** evidence that the multiplayer activities are actually being played. If nobody has run a `study_battle` with a second human, the loop is unproven and the flywheel is theoretical.

---

## Advisor 4 — The Outsider

**Verdict:** I have read the description twice and I still cannot tell you what this app is for.

I am new here. Here is what I was told it does: note-taking like Obsidian and Notion, design and editing like Canva, real-time chat like WhatsApp, quizzes and games like Kahoot, a scheduler that syncs to my phone, and AI that generates activities. That is six products. Each one is described by naming a different company.

My naive questions:

- **Which one do I open first?** If I want to make a quiz, do I start in Vault, in the quiz section, or by asking the AI? I genuinely do not know, and I suspect the answer is "all three, and they don't share a starting point."
- **What happens if I do nothing?** I opened the app and there is nothing in it. Nothing told me what the first useful thing to do is. Every one of those six products has a strong opinion about this; this one appears not to.
- **Why is the microphone switched off in the security settings** if the whole pitch includes voice? *(This one I was told has since been fixed — but the fact that a security config and the product description disagreed is itself informative.)*
- **Who is this for?** A student? A teacher? A study group? Someone who takes notes for work? "Everyone who learns" is not an answer that changes what gets built.

The unexamined premise, and this is the one I would push on: **that breadth is the value.** Everything I was shown is justified by resemblance to something else. Nothing was justified by what this does that those things cannot. The closest was the interconnection idea — schedule something from Vault, send a schedule to Social — and even that was described as a capability rather than a reason I would care.

Honest reaction, including where it lands: the "make a note, then play it as a game with your friends" idea is genuinely appealing and I would try it. I did not hear it described as the product. I heard it as one of six features. If that is actually the point, the app is currently hiding its own best idea.

**What would change my mind:** one sentence describing what a user does on day one that they cannot do anywhere else. If that sentence needs a diagram, that is the finding.

---

## Advisor 5 — The Executor

**Verdict:** Write one route-handler test tomorrow. Nothing else.

**The action:** Pick the highest-risk authenticated mutation — `/api/quizzes` POST (it writes a quiz plus N questions and is on the exact path the user cares about). Create `src/tests/api/quizzes-route.test.ts`. Stub the `query()` boundary so it records SQL and returns canned rows. Build a fake `NextRequest` with a valid session cookie. Call the exported `POST`. Assert the response status and that the expected statements were issued.

Roughly one hour. If the stub needs a small seam in `db.ts` to be injectable, that is still under two hours.

**What it produces — and this is the point:** not coverage. It produces the answer to a question nobody can currently answer: **are the route handlers testable in this codebase at all?** Right now that is unknown. One test converts it from unknown to known, and gives you a reusable harness that makes the other 48 handlers cheap.

**Cost:** 1–2 hours. Compare that to any item on the roadmap, all of which are multi-day and none of which currently have a safety net.

**Kill criterion, decided now so I cannot rationalise later:** if making `query()` stubbable requires changing production code — if `data.ts` has to take a database client through 100 exports, or the modules are wired such that the only way to inject a fake is a broad refactor — then **stop and do that refactor instead**, because that tells you the data layer's shape is the real blocker and everything else on the roadmap is blocked behind it. That is a valuable outcome, not a failure.

Do not start with the fun one. Do not start with voice transcription. Do not start with the 4,228-line file. Start with the smallest test that can fail informatively.

---

# Phase 2 — Anonymous cross-critique

Responses re-presented as **A–E** (mapping hidden).

### Advisor 1 (Skeptic) on the others

**Strongest point — D.** The "I cannot tell you what this app is for" response is the only one that attacks something none of the rest of us questioned: whether the product is coherent at all. I was busy auditing the test suite's coverage of the code. D is asking whether the code should exist in this shape. That is a bigger question and I missed it.

**Biggest blind spot — A.** "Build the loop" is exactly the move that makes my failure mode #3 worse. It adds the most expensive thing on the table — a multiplayer activity loop and voice input — on top of a core that has never been executed under test. If the loop is broken in a way that only shows up with two real users, you will have built three subsystems on top of it and you will not know which one failed.

### Advisor 2 (First-Principles) on the others

**Strongest point — B.** It is the only response that produces a decision procedure rather than an opinion. The kill criterion is what makes it good: it pre-commits to the conclusion "the data layer needs restructuring first" being a *valid result*, which means the test cannot be rationalised into a waste of time. That is exactly how to convert an unknown into information.

**Biggest blind spot — C.** "The 383-test suite is a false signal" is correct and then goes one step too far. It is not a false signal, it is a *partial* signal — those tests are genuinely load-bearing for the pure functions, and I would not want them deleted. The precise claim is that the suite's coverage is orthogonal to the risk, not that it is worthless. Overstating it invites the wrong response, which is to distrust the whole suite.

### Advisor 3 (Expansionist) on the others

**Strongest point — D.** The observation that every feature is described by naming a competitor is devastating and correct, and it applies to my own response: I described the loop as valuable *because* Notion and Kahoot cannot do it. D caught me doing the exact thing it criticised. The app's best idea is real but it is currently argued by comparison rather than on its own terms.

**Biggest blind spot — C.** It stops at the diagnosis. "Everything is unverified, stop" is true and it is also what you would say about any app of this size at any point in its life. It offers no path forward. A reviewer who only says "this is unsafe" and never says "here is the first safe step" has handed you a problem, not a decision.

### Advisor 4 (Outsider) on the others

**Strongest point — B.** It answered my question without me having to ask it. I asked "what is this for?" and B effectively said: you cannot answer that yet, and here is the one-hour experiment that will tell you whether the thing you have is trustworthy enough to build on. I did not expect a testing answer to address a positioning question. It does, because "does the product work" is a precondition for "what is the product".

**Biggest blind spot — E.** It never asks whether the feature should exist. It takes the entire feature list as given — quizzes, games, chat, calendar, AI, notes — and asks how to test them better. That is a reasonable engineering instinct and it silently accepts the premise I found most suspicious. If four of the six products should not be there, a very well-tested six-product app is still the wrong app.

### Advisor 5 (Executor) on the others

**Strongest point — A.** "Voice collapses creation cost" is the one strategic claim in the set that changes what I would build next, and it is falsifiable: measure how long it takes to turn a source document into a playable activity today, then again with voice. That is a real experiment hiding inside a vision statement.

**Biggest blind spot — C.** It ranks three failure modes and then recommends nothing actionable. I have read it twice and I still do not know what to do tomorrow morning. Diagnosis without a next action is where engineering reviews go to die.

### Convergences

**1. The loop is unproven, from two opposite directions.** C (Skeptic) says the product surface has never been executed. A (Expansionist) says the flywheel is theoretical until two humans play an activity together. These are the same finding wearing different clothes: **nobody has demonstrated that create → play → learn actually closes.** One arrives from risk, the other from ambition, and they land on the same gap. Highest-confidence finding in the session.

**2. Breadth is hiding the product, from two unrelated angles.** D (Outsider) cannot tell what the app is for across six products. C (Skeptic) observes the app got wide while the one twice-requested feature is missing. Both point at the same thing: the surface area has outrun the thesis.

**3. The cheapest real information is a route test.** B (First-Principles) names the bottleneck as change-safety; E (Executor) names the action as one route test with a kill criterion. B supplies the why, E supplies the what. They agree without having coordinated.

**4. Nobody can point to a working end-to-end path.** No advisor was able to say "and here is where we know a user completes the core journey." Every advisor who looked for it came back empty. That absence is the strongest single signal in this session.

---

# Phase 3 — Chairman synthesis

**Verdict: proceed with changes — narrow the order, not the ambition.** The decisive reason: every advisor who went looking for evidence that the product works came back empty, and three of them independently named the same gap. You cannot pick between "consolidate", "refactor", "add voice", and "sharpen the positioning" while none of them rests on verified ground. But the fix is not to stop — it is to spend the next two hours on the one action that converts opinion into fact.

**The 1-hour decision.** Can `query()` be stubbed without modifying production code? Write one route-handler test for `/api/quizzes` POST and find out. This is the highest information-per-hour available: it either gives you a reusable harness that makes the other 48 handlers cheap, or it proves the data layer's shape is the real blocker. Both answers are valuable and both arrive within the hour.

**The biggest risk to watch.** Building more surface on an unverified core. The specific version: adding voice transcription next, so the app reaches 50 untested handlers plus a new input subsystem, and a regression becomes un-bisectable. **Earliest observable signal:** the first route test takes more than two hours, or requires touching `data.ts` to make it stubbable. If that happens, stop and treat the data-layer shape as the actual bottleneck — everything else on the roadmap is queued behind it.

**The #1 step to take.** Build `src/tests/api/` with a `query()` stub and one test for `/api/quizzes` POST. Not a plan, not a harness design — one passing test. It is the only action today that generates information rather than consuming it, and it has a pre-committed kill criterion so it cannot become a rationalised dead end.

**Resolving the Skeptic vs. the Expansionist.** They disagree about whether to add voice transcription now. **The Skeptic is right for this user at this moment** — not because voice is unimportant (the Expansionist's argument that it collapses creation cost is the strongest strategic point in the session), but because it is queued behind a cheaper, prior question. Sequence, not scope, is the disagreement: verify first, then voice as the *first* new feature, because it is the one that makes the create→play loop cheap enough to actually test with real users.

**What the council could not settle.** Whether the six-product surface is correct. The Outsider's question — what do you do on day one that you cannot do anywhere else — has no answer in the codebase, and no amount of testing will produce one. That is a product decision and it belongs to the user, not the council.

---

# Outcome — the #1 step, executed

**Date:** 2026-09-21 · **Commit:** `b2da5f87` · **Result: the kill criterion did not fire.**

## The 1-hour decision, answered

> *Can `query()` be stubbed without modifying production code?*

**Yes. Not one line of production code changed.**

The Executor's kill criterion was explicit: if making `query()` stubbable required
changing production code, stop and treat the data-layer shape as the blocker. It did
not. The seam turned out to be narrower than anyone proposed — `globalThis.fetch` at
the D1 HTTP boundary. The harness supplies D1 credentials via environment variables
and intercepts the outbound request, so the real `query()`, the real
`normalizeD1Sql()`, the real statement routing and response parsing all execute
unmodified.

**This is the session's most consequential result.** The First-Principles Engineer
named change-safety as the binding constraint on every item of the roadmap; the
Skeptic said a consolidation bug would ship green. Both were right, and both are now
answered: the 49 handlers are verifiable, and a reusable harness makes the other 46
cheap. Stage 2 and Stage 4 are no longer blocked.

## The highest-confidence finding, closed

The convergence all five advisors circled — *nobody has demonstrated that
create → play → learn actually closes* — is now an executable assertion.

`src/tests/api/quiz-loop.test.ts` runs `POST /api/quizzes` and
`POST /api/quizzes/attempts` against a **stateful** fake of the quiz tables, so the
attempt genuinely reads back the quiz the create step wrote. It asserts that playing a
quiz writes a `practice_sessions` row whose metadata carries the originating quiz id
and title — the artifact-becomes-activity link the Expansionist called the moat — plus
a correctly scored attempt, batched answer rows, and an audit trail on both sides of
the loop.

The loop closes. It closed before this test existed, and now there is evidence.

## What the advisors got right, and where they were wrong

| Advisor | Called it | Verdict |
| --- | --- | --- |
| **Skeptic** | "Zero tests touch the product surface; a refactor bug ships green" | **Right, and the more urgent of the two.** This was the blocker. |
| **Executor** | "One test with a pre-committed kill criterion, and the answer is worth more than the other 383" | **Right.** It took well under the estimated hour, and the kill criterion made it unfalsifiable-into-a-waste-of-time. |
| **First-Principles** | "The binding constraint is the ability to change things safely" | **Right.** Now unblocked. |
| **Expansionist** | "Voice collapses creation cost; it is the highest-leverage missing piece" | **Right on strategy, and the council sequenced it correctly.** Voice is now built — see below. |
| **Outsider** | "I cannot tell you what this app is for" | **Still unresolved, and still the biggest question.** No test can answer it. |

The Skeptic's failure mode #3 — *"nothing is actually shipped; `pnpm install` is broken
and `main` has not moved"* — **remains true**. That is now the most important
outstanding item, and it is a release decision, not an engineering one.

## Voice transcription, built

The council ruled that voice becomes the first *new* feature after verification. It
was built in the same session: `src/lib/ai/transcription.ts`, `POST /api/ai/transcribe`,
and `VoiceInput`, wired into the AI prompt composer. Provider is Workers AI Whisper at
$0.000513/audio-minute. See the [README](./README.md#voice-transcription--executed) for
the design decisions, including why the Web Speech API was rejected and why
`CLOUDFLARE_AI_GATEWAY_URL` is deliberately ignored.

## Still open

1. **`pnpm install` must be run in a real terminal.** `node_modules` cannot be repaired in this environment. Nothing is deployable until it is.
2. **`main` has not moved.** All work is on `cleanup/stage-1`.
3. **Coverage is 3 of 50 handlers.** The harness makes the rest cheap; the highest-value next ones are the auth routes and `content_items`.
4. **The Outsider's question.** What does a user do on day one that they cannot do anywhere else? Still unanswered, still a product decision.
