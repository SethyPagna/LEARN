import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * Launching a live game from a chat thread reaches across five files that have
 * no type-level link to each other: a menu action in the composer, a launcher
 * component, a POST body the route has to read, a data-layer orchestration, and
 * two card renderers the thread has to reach. Every one of those can come loose
 * without failing a type check or any other test — the composer's original
 * "Quiz battle" action was exactly that: an entry point that compiled, shipped,
 * and launched nothing.
 *
 * This file is the tripwire for that class of bug. It asserts connections, not
 * behaviour: behaviour is `src/tests/live/`'s job.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const VIEWS = path.join(PROJECT_ROOT, "src", "components", "learn", "views")
const COMPOSER = path.join(VIEWS, "productivity-views.tsx")
const CARDS = path.join(VIEWS, "live-game-cards.tsx")
const LAUNCHER = path.join(VIEWS, "live-game-launcher.tsx")
const LIVE_VIEW = path.join(VIEWS, "live-quiz-view.tsx")
const LIVE_ENGINE = path.join(PROJECT_ROOT, "src", "lib", "live", "quiz-session.ts")
const GAME_INVITE = path.join(PROJECT_ROOT, "src", "lib", "live", "game-invite.ts")
const LIVE_DATA = path.join(PROJECT_ROOT, "src", "lib", "data.ts")
const SESSION_ROUTE = path.join(PROJECT_ROOT, "src", "app", "api", "live-sessions", "route.ts")

function read(filePath: string) {
  return fs.readFileSync(filePath, "utf8")
}

/** Code with comments removed, so assertions about code cannot match prose. */
function stripComments(source: string) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
}

test("the composer's inert quiz-battle stub is gone and replaced by a real launch flow", () => {
  const composer = read(COMPOSER)

  // The exact stub this change exists to remove. Left as a plain `false`
  // assertion on the file's text, comments included: the point is that no
  // version of the string survives, prose or not.
  assert.equal(composer.includes("Practice attachment ready"), false, "the inert attach stub must not come back")
  assert.equal(composer.includes("Battle prompt ready"), false, "the second inert battle stub must not come back")

  // ...and the action that replaced it opens the launcher.
  assert.match(composer, /label="Start a live game"/, "the composer must offer the real launch action")
  assert.match(composer, /setLiveGameOpen\(true\)/, "that action must open the launcher")
  assert.match(composer, /<LiveGameLauncher\b/, "the composer must render the launcher")
  assert.match(composer, /from "\.\/live-game-launcher"/, "the launcher must be imported")
})

test("the game card and the result card exist and are reachable from the thread renderer", () => {
  assert.ok(fs.existsSync(CARDS), "the card renderers must live in their own file")
  const cards = read(CARDS)

  assert.match(cards, /export function LiveGameCard\b/, "the launch card must be exported")
  assert.match(cards, /export function LiveGameResultCard\b/, "the result card must be exported")
  // The result card's "Play again" starts a genuinely fresh session, in the
  // same mode, through the same endpoint the launcher uses.
  assert.match(cards, /Play again/, "the result card must offer another game")
  assert.match(cards, /mode: result\.mode/, "play-again must keep the mode")
  // The join action goes to the existing /live route with the code, not a new one.
  assert.match(cards, /export function liveGameJoinHref\(code: string\): string \{\s*return `\/live\?code=\$\{encodeURIComponent\(code\)\}`/)
  assert.match(cards, /href=\{liveGameJoinHref\(invite\.code\)\}/, "the launch card must link to the player screen")

  const composer = read(COMPOSER)
  assert.match(composer, /from "\.\/live-game-cards"/, "the thread renderer must import the cards")
  assert.match(composer, /<LiveGameCard\b/, "the thread must render the launch card")
  assert.match(composer, /<LiveGameResultCard\b/, "the thread must render the result card")
  // Reachability in practice: the cards are chosen from a message's metadata
  // inside the message map, not rendered unconditionally somewhere else.
  assert.match(stripComments(composer), /messages\.map\(\(message\) => \{[\s\S]*parseLiveGameInvite\(message\.metadata\)/)
  assert.match(composer, /parseLiveGameResult\(message\.metadata\)/, "the result card must be driven by the message's own metadata")
})

test("the descriptor shapes live in one pure module that both the writer and the reader use", () => {
  const invite = read(GAME_INVITE)

  assert.match(invite, /export const LIVE_GAME_METADATA_KIND = "live-game"/)
  assert.match(invite, /export const LIVE_GAME_RESULT_METADATA_KIND = "live-game-result"/)
  for (const builder of ["buildLiveGameInvite", "parseLiveGameInvite", "buildLiveGameResult", "parseLiveGameResult", "liveGameInviteBody", "liveGameResultBody"]) {
    assert.match(invite, new RegExp(`export function ${builder}\\b`), `${builder} must be exported`)
  }
  // The mode vocabulary is the engine's, not a second copy: a card that could
  // name a mode the reducer does not know would be a card nobody can play.
  assert.match(invite, /from "\.\/quiz-session"/, "the descriptor module must reuse the engine's mode type")
  assert.match(read(LIVE_ENGINE), /export const LIVE_QUIZ_MODE_LABELS/)

  // Both sides of the conversation go through it.
  assert.match(read(COMPOSER), /from "@\/lib\/live\/game-invite"/)
  assert.match(read(LIVE_DATA), /from "\.\/live\/game-invite"/)
})

test("/api/live-sessions has consumers outside the API tree, including the in-thread launcher", () => {
  const launcher = read(LAUNCHER)
  assert.match(launcher, /"\/api\/live-sessions"/, "the launcher must create the session through the API")
  assert.match(launcher, /threadId/, "the launcher must tell the server which conversation it is in")
  assert.match(launcher, /mode,/, "the launcher must send the chosen mode")
  assert.match(launcher, /LIVE_QUIZ_MODES\.map/, "the launcher must offer every mode the engine knows")

  // The pre-existing consumer must stay a consumer: the Practice screen still
  // hosts a game without a thread.
  assert.match(read(LIVE_VIEW), /\/api\/live-sessions/, "the live quiz view must keep using the endpoint")
  assert.match(read(SESSION_ROUTE), /launchLiveGameInChat/, "the route must delegate the in-thread launch to the data layer")
  assert.match(read(SESSION_ROUTE), /requireApiUser\(/, "the launch route must authenticate")
})

test("the result is recorded server-side, once, from the finish path", () => {
  const data = stripComments(read(LIVE_DATA))

  // The hook is on the transition into `finished`, which the reducer allows
  // exactly once per session — not on "phase is finished", which a poll repeats.
  assert.match(data, /effects\.some\(\(effect\) => effect\.type === "finalize"\)/, "the result must be recorded when the session finalizes")
  assert.match(data, /await recordLiveGameResultMessage\(result\.session, input\.nowMs\)/, "finalize must post the result")

  // Idempotency is a deterministic primary key plus ON CONFLICT DO NOTHING, so
  // two racing closes cannot write two result messages.
  assert.match(data, /const LIVE_RESULT_MESSAGE_ID_PREFIX = "chatmsg_liveresult_"/, "the result message id must be derived, not random")
  assert.match(data, /`\$\{LIVE_RESULT_MESSAGE_ID_PREFIX\}\$\{session\.code\}`/, "the id must depend only on the join code")
  assert.match(data, /ON CONFLICT \(id\) DO NOTHING/, "the insert must tolerate the message already existing")

  // The launch message is still an ordinary chat message written by the one
  // function that writes chat messages.
  assert.match(data, /postChatMessage\(user, \{[\s\S]{0,400}?metadata: invite/)
  assert.match(data, /async function attachLiveSessionThread/, "the session must remember its thread")
  assert.match(data, /if \(!session\.threadId\) return null/, "a game with no thread must record nothing")
})

test("the player screen honours ?code= so a card in a thread drops straight into the lobby", () => {
  const view = stripComments(read(LIVE_VIEW))

  assert.match(view, /new URLSearchParams\(window\.location\.search\)\.get\("code"\)/, "the view must read the code from the query")
  assert.match(view, /normalizeJoinCode\(new URLSearchParams/, "the query code must be normalised like typed input")
  assert.match(view, /if \(typeof window === "undefined"\) return ""/, "the read must be safe during a server render")
  assert.match(view, /void joinSession\(code\)/, "a code in the URL must auto-join")
  assert.match(view, /async function joinSession\(codeOverride\?: string\)/, "joining by code must reuse the existing join path")
})

test("the mode vocabulary is not duplicated: the engine owns it and the UI reads it", () => {
  const engine = stripComments(read(LIVE_ENGINE))

  assert.match(engine, /export type LiveQuizMode = "race" \| "survival" \| "streak"/)
  assert.match(engine, /export const LIVE_QUIZ_MODES = \["race", "survival", "streak"\] as const/)
  // The reducer is still the only place a mode changes an outcome.
  assert.match(engine, /session\.mode === "streak" && scored\.correct \? streakPoints\(participant, scored\.points\) : scored\.points/)
  assert.match(engine, /session\.mode === "survival" && !scored\.correct/)
  assert.match(engine, /function survivalIsOver\(session: LiveQuizSession\)/)
})
