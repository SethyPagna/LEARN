# AI Council: complete the LEARN takeover through working journeys

Question: how should the remaining editor, learning, social and tooling work be
completed without losing prior capabilities or expanding duplicate code?

Baseline: `7be1cc5`. The user authorizes continued implementation, clear commits
and pushing the current branch. This supersedes the older stop-after-each-checkpoint
preference. Production deployment is not a current acceptance requirement.

Method: AI Council and Code Quality & Maintainability Audit skills. The engineer,
expansionist and skeptic responses came from independent bounded code audits;
outsider and executor are explicitly modeled perspectives from the maintainer.

## Phase 1 — independent responses

### Contrarian Skeptic

Verdict: feature breadth will conceal broken destinations unless privacy and real
behavior are verified first. The current DM/group fallback and AI quiz-to-note
fallthrough are concrete examples. Dictation is not voice messaging; moments are
not expiring stories. Recover historical requirements rather than obsolete entire
editors. A passing helper suite cannot prove two-user isolation.

Would change my mind: two-user destination tests, browser journeys and honest
infrastructure-dependent limits. The worst failure is leaking private content.

### First-Principles Engineer

Verdict: use one model/controller/rendering contract for designs and preserve
records, drafts, saves and shares before adding controls. The multi-page foundation
already exists. Integrate it instead of rebuilding it. Keep the geometry engine
because the new model depends on it. Test the persistence and gesture boundaries.

Would change my mind: evidence that the existing model cannot preserve a required
workflow. Filename counts alone cannot establish that.

### Expansionist

Verdict: the strongest product is a continuous note or Vault block → AI → real
quiz/design → practice/share journey. Carry source identity and open the actual
destination immediately after saving. The compounding advantage is reusable
learning material, rather than a collection of unrelated editors. A shared design
model can bridge decks and notes. The ceiling remains provider availability and
the quality of source material; UI labels cannot overcome those constraints.

Would change my mind: the connected journey fails to retain source meaning or
becomes less understandable than separate explicit actions.

### Outsider

Verdict: make it obvious what each action creates and where it goes. Why are there
Studio, Design, Notes and Vault? If I press Create quiz, can I play a quiz? Can I
find a design after closing the window? The learning journey is compelling only
when a newcomer can complete it without knowing the storage model.

Would change my mind: a first-use walkthrough demonstrates clear destinations,
successful persistence and understandable failure messages.

### Executor

Verdict: run the launcher outside the checkout, then verify a real quiz destination
and two-user DM isolation. This is a bounded first experiment, not a release claim.
It produces command-path and destination evidence within the first implementation
slice, using the existing test and API harnesses.

Kill criterion: **If destination or authorization correctness fails, stop feature
expansion and repair that boundary before adding another sending surface.**

Would change my mind: these boundaries already pass meaningful runtime checks;
then the next experiment is save/reload/share of a two-page design.

## Phase 2 — anonymous cross-critique

The responses were presented without persona names in this order:
A connected journey; B executable destination/privacy gate; C breadth/privacy
skepticism; D newcomer clarity; E single design contract and recoverability.

| Reviewer | Strongest point | Biggest blind spot |
| --- | --- | --- |
| Skeptic | B catches the existing destination defect through real journeys | A can work for one user while leaking across audiences |
| Engineer | B tests behavior instead of component presence | D can label a button correctly while its conversion loses data |
| Expansionist | B turns ambition into observable acceptance | E can unify internals without preserving source identity or clear destinations |
| Outsider (modeled) | A explains a usable purpose for the parts | C identifies danger but does not explain the successful experience |
| Executor (modeled) | C names a defect already present | A remains too broad until divided into independently testable journeys |

Mapping: A Expansionist, B Executor, C Skeptic, D Outsider, E Engineer.
Convergence: correct artifact/message destinations and recoverability are the
highest-confidence requirements; both the ambitious and skeptical views need them.

## Phase 3 — chairman synthesis

1. **Proceed with changes.** Correct the proven boundary failures before expanding
   chat/media surfaces. Integrating the existing design foundation is preferable
   to restoring entire incompatible historical editors.
2. **One-hour decision:** can the current launcher and destination boundaries
   support a trustworthy first journey? Run the shared launcher and focused
   request tests; preserve exact failures instead of hiding them with UI copy.
3. **Biggest risk:** confident completion claims from tests that bypass the UI or
   intended recipient. Earliest signal: a button creates the wrong resource or a
   client supplies both DM and group destinations.
4. **Number-one step:** fix those destinations behind request-level regressions,
   while finishing the local launcher. Apply the executor's kill criterion as
   written above, then integrate the editor and verify save/reload/share.

## Outcome — executed

**One-hour decision:** “Can the current launcher and destination boundaries
support a trustworthy first journey?” **Yes.** After repairing the exposed
boundaries, the launcher, two-user messaging, saved designs and generated quiz
destination have direct execution evidence.

**Convergence closed:** artifact/message destinations and recoverability now have
request tests plus browser evidence, rather than relying on historical claims.

| Advisor | Correct diagnosis or recommendation | Correction or remaining blind spot |
| --- | --- | --- |
| Skeptic | DM/group isolation failed and needed repair before adding senders | Privacy tests alone did not find browser dependency and SDP failures |
| Engineer | Existing design model supported the integrated editor without wholesale restoration | Runtime font/export dependencies needed browser checks beyond model tests |
| Expansionist | Real source-to-design and provider-to-quiz journeys became usable | The review destination still required restoring a deleted view and multiple route mappings |
| Outsider (modeled) | Honest labels and usable destinations mattered; inactive actions were removed | A visible review route name did not prove that it rendered review cards |
| Executor (modeled) | Bounded destination and launcher gates exposed actionable defects | First-gate success did not establish call, export or review behavior; those needed separate journeys |

- Baseline production build passed, including CSS output validation.
- Shared launcher `check.bat` passed TypeScript and all 1,000 tests. Its first run
  exposed a direct-pnpm-only batch guard and a roadmap naming guard; both corrected.
- The privacy criterion fired during audit. Exclusive destination and private-quiz
  authorization repairs were tested before adding social media sending surfaces.
- Two-account browser checks proved DM/group isolation, real-time reactions/media,
  audience-scoped stories, a connected local call and live game result delivery.
- The engineer's integrated editor passed save/reopen/two-page/share checks and
  mobile layout inspection. The expansionist's note-to-design journey worked.
- A real Ollama response became a playable quiz and scored 1/1. Following the same
  output into review cards exposed a conversion gap and incorrect review routing;
  those boundaries were repaired and the real card was revealed and graded.
- Browser testing also found missing JSZip in the PowerPoint browser asset and
  terminal CRLF trimming in SDP. Both fixes have direct runtime evidence.
- Calibration: the skeptic/executor focus on real destinations was justified;
  passing unit tests alone had missed export, call and review-route defects.
  The outsider's label clarity led to removing fake event/mute/translation/notify
  actions and clarifying remaining draft actions. Shared model consolidation
  avoided restoring incompatible historic editors.
- WAN/TURN and physical devices require separate deployment testing. See the
  [verification report](./2026-09-24-takeover-verification.md) for gates and limits.

## Measured cleanup baseline

The import-graph analyzer scanned 385 code files: 291 non-test and 94 test files.
It reported 49 unused exports, 390 internal-only exports, 10 orphan files,
10 unused-dependency candidates and three mutual import cycles.

The 10 orphans are all intended design integration pieces. Dependency candidates
include TypeScript/types, tsx, Wrangler, PostCSS and TipTap's peer package; they are
not justified removal candidates. Type-only locale imports need separate review
before the reported cycles can be called runtime cycles. Each later removal must
be confirmed and followed by another analyzer pass.

The code-audit slices covered all eight categories: disconnected UI, overlapping
render/persistence generations, overloaded editor/chat modules, bounded and
unbounded source reads, and missing request/browser coverage. No broad deletion
is authorized by the candidate counts alone. Consolidate the specific boundaries
being corrected, with rollback through their individual commits.

After integration: 428 files, 12 unused-export candidates and zero orphan files.
Five confirmed unused helpers, the obsolete editor and duplicate PPTX loader were
removed. Ten tooling/type/peer dependency candidates and three type-level import
relationships were retained rather than deleted solely on an analyzer report.
