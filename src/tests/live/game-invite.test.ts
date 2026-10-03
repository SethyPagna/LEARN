import assert from "node:assert/strict"
import test from "node:test"

import {
  LIVE_GAME_METADATA_KIND,
  LIVE_GAME_RESULT_METADATA_KIND,
  buildLiveGameInvite,
  buildLiveGameResult,
  liveGameInviteBody,
  liveGameResultBody,
  parseLiveGameInvite,
  parseLiveGameResult,
} from "../../lib/live/game-invite"

/**
 * The chat descriptor is the contract between the composer that starts a game
 * and the thread that renders it. These tests pin the exact JSON that gets
 * written (the format a reviewer is asked to read back), and pin that reading
 * arbitrary metadata is total: every message in a thread goes through these
 * parsers, so a throw here is a broken conversation.
 */

const INVITE_INPUT = {
  code: "ABC234",
  mode: "race",
  quizId: "quiz_1",
  quizTitle: "Photosynthesis",
}

test("an invite is exactly the documented descriptor and round-trips through its own parser", () => {
  const invite = buildLiveGameInvite(INVITE_INPUT)

  assert.deepEqual(invite, {
    kind: "live-game",
    code: "ABC234",
    mode: "race",
    quizId: "quiz_1",
    quizTitle: "Photosynthesis",
  })
  assert.deepEqual(parseLiveGameInvite(invite), invite)
  // The stored form is plain JSON — the column is text, and this is the bytes.
  assert.equal(
    JSON.stringify(invite),
    '{"kind":"live-game","code":"ABC234","mode":"race","quizId":"quiz_1","quizTitle":"Photosynthesis"}',
  )
})

test("the invite body names the mode, the quiz, and the code", () => {
  assert.equal(liveGameInviteBody(buildLiveGameInvite(INVITE_INPUT)), "Race: Photosynthesis — join with code ABC234")
  assert.equal(
    liveGameInviteBody(buildLiveGameInvite({ ...INVITE_INPUT, mode: "survival" })),
    "Survival: Photosynthesis — join with code ABC234",
  )
  assert.equal(
    liveGameInviteBody(buildLiveGameInvite({ ...INVITE_INPUT, mode: "streak" })),
    "Streak: Photosynthesis — join with code ABC234",
  )
})

test("a malformed or non-game descriptor parses to null rather than throwing", () => {
  for (const junk of [
    null,
    undefined,
    42,
    true,
    [],
    {},
    "live-game",
    { kind: "attachment" },
    { kind: LIVE_GAME_METADATA_KIND },
    { kind: LIVE_GAME_METADATA_KIND, code: "ABC234" },
    { kind: LIVE_GAME_METADATA_KIND, quizId: "quiz_1" },
    // The join code generator never emits these characters, so neither may a
    // descriptor: a card must not offer a code that cannot be typed.
    { kind: LIVE_GAME_METADATA_KIND, quizId: "quiz_1", code: "ABCO1I" },
    { kind: LIVE_GAME_METADATA_KIND, quizId: "quiz_1", code: "SHORT" },
  ]) {
    assert.equal(parseLiveGameInvite(junk), null, `${JSON.stringify(junk)} is not an invite`)
  }

  // A result descriptor is not an invite, and vice versa.
  const result = buildLiveGameResult({ ...INVITE_INPUT, participants: [] })
  assert.equal(parseLiveGameInvite(result), null)
  assert.equal(parseLiveGameResult(buildLiveGameInvite(INVITE_INPUT)), null)
})

test("an invite with an absent or unknown mode reads back as race, never as an error", () => {
  const withKind = (mode: unknown) => ({ kind: LIVE_GAME_METADATA_KIND, ...INVITE_INPUT, mode })
  for (const mode of [undefined, null, "banana", 7]) {
    const parsed = parseLiveGameInvite(withKind(mode))
    assert.ok(parsed, `mode ${JSON.stringify(mode)} should still parse`)
    assert.equal(parsed.mode, "race")
  }
  assert.equal(parseLiveGameInvite(withKind("survival"))?.mode, "survival")
  // Codes are canonicalised the way a player types them: lower case, spaces,
  // and dashes all resolve to the same six characters.
  assert.equal(parseLiveGameInvite({ ...withKind("race"), code: "abc-234" })?.code, "ABC234")
})

test("a result carries the ranked scores and a sentence a human can read", () => {
  const result = buildLiveGameResult({
    ...INVITE_INPUT,
    mode: "streak",
    participants: [
      { participantId: "lp_u2", name: "Grace", score: 2250, rank: 2 },
      { participantId: "lp_u1", name: "Ada", score: 3000, rank: 1 },
    ],
  })

  assert.equal(result.kind, LIVE_GAME_RESULT_METADATA_KIND)
  assert.deepEqual(result.participants.map((entry) => entry.name), ["Ada", "Grace"], "the record is stored best-first regardless of insertion order")
  assert.deepEqual(result.participants.map((entry) => entry.rank), [1, 2])
  assert.equal(liveGameResultBody(result), "Streak: Photosynthesis — Ada won with 3000 points, ahead of 1 other.")
  assert.deepEqual(parseLiveGameResult(result), result)
  // Scores stay integers end to end: a card must never show a fractional score.
  assert.equal(
    JSON.stringify(buildLiveGameResult({ ...INVITE_INPUT, participants: [{ participantId: "p", name: "P", score: 1499.7, rank: 1 }] }).participants[0].score),
    "1499",
  )
})

test("a result with junk entries drops them instead of failing the whole record", () => {
  const parsed = parseLiveGameResult({
    kind: LIVE_GAME_RESULT_METADATA_KIND,
    code: "ABC234",
    mode: "race",
    quizId: "quiz_1",
    quizTitle: "Photosynthesis",
    participants: [
      { participantId: "lp_u1", name: "Ada", score: 3000, rank: 1 },
      null,
      "junk",
      // A player whose account was deleted keeps their name and score: the
      // record of who played must outlive the account, so a missing id is not
      // a reason to drop the row.
      { name: "Deleted account", score: 900, rank: 3 },
      { participantId: "", name: "" },
      { participantId: "lp_u2", name: "Grace", score: "1800", rank: "2" },
    ],
  })

  assert.ok(parsed)
  assert.deepEqual(parsed.participants, [
    { participantId: "lp_u1", name: "Ada", score: 3000, rank: 1 },
    { participantId: "lp_u2", name: "Grace", score: 1800, rank: 2 },
    { participantId: "Deleted account", name: "Deleted account", score: 900, rank: 3 },
  ])
  assert.equal(parseLiveGameResult({ kind: LIVE_GAME_RESULT_METADATA_KIND, code: "ABC234", quizId: "quiz_1" })?.participants.length, 0)
  assert.equal(liveGameResultBody(buildLiveGameResult({ ...INVITE_INPUT, participants: [] })), "Race: Photosynthesis — nobody played.")
})
