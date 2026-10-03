/**
 * The chat-side vocabulary of a live game.
 *
 * A chat message that *is* a game is a normal `chat_messages` row with a
 * machine-readable `metadata` descriptor — there is no second storage system.
 * Everything that reads those descriptors goes through this file, so the shape
 * is defined once: the composer writes an invite, the thread renderer reads it
 * back, and the finish path writes a result. Two consequences worth stating:
 *
 * - **Reading never throws.** `metadata` arrives from a JSON column, and from
 *   messages written by other builds. A message that was not a game, or a game
 *   descriptor missing a field, parses to `null` and renders as an ordinary
 *   message instead of taking a thread down.
 * - **The mode defaults.** An invite without a usable mode is a `race` invite,
 *   the same rule the engine applies to a session — so an unknown mode can
 *   never make a card unrenderable or a game unjoinable.
 */

import { LIVE_QUIZ_MODE_LABELS, normalizeJoinCode, normalizeLiveMode, type LiveQuizMode } from "./quiz-session"

export const LIVE_GAME_METADATA_KIND = "live-game"
export const LIVE_GAME_RESULT_METADATA_KIND = "live-game-result"

/** The launch card: "there is a game at this code, in this mode, on this quiz". */
export interface LiveGameInvite {
  kind: typeof LIVE_GAME_METADATA_KIND
  code: string
  mode: LiveQuizMode
  quizId: string
  quizTitle: string
}

export interface LiveGameResultEntry {
  participantId: string
  name: string
  score: number
  rank: number
}

/** The durable record the finish path posts back into the thread. */
export interface LiveGameResult {
  kind: typeof LIVE_GAME_RESULT_METADATA_KIND
  code: string
  mode: LiveQuizMode
  quizId: string
  quizTitle: string
  participants: LiveGameResultEntry[]
}

const MAX_TITLE_LENGTH = 120
const MAX_NAME_LENGTH = 40
const MAX_RESULT_ENTRIES = 200

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback
}

/** A stable, sortable score: integers only, so a card cannot disagree with the engine. */
function asInteger(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

export function buildLiveGameInvite(input: {
  code: string
  mode: unknown
  quizId: string
  quizTitle: string
}): LiveGameInvite {
  return {
    kind: LIVE_GAME_METADATA_KIND,
    code: normalizeJoinCode(input.code) || asText(input.code).toUpperCase(),
    mode: normalizeLiveMode(input.mode),
    quizId: asText(input.quizId),
    quizTitle: asText(input.quizTitle).slice(0, MAX_TITLE_LENGTH) || "Live quiz",
  }
}

export function buildLiveGameResult(input: {
  code: string
  mode: unknown
  quizId: string
  quizTitle: string
  participants: readonly LiveGameResultEntry[]
}): LiveGameResult {
  return {
    kind: LIVE_GAME_RESULT_METADATA_KIND,
    code: normalizeJoinCode(input.code) || asText(input.code).toUpperCase(),
    mode: normalizeLiveMode(input.mode),
    quizId: asText(input.quizId),
    quizTitle: asText(input.quizTitle).slice(0, MAX_TITLE_LENGTH) || "Live quiz",
    participants: [...input.participants]
      .filter((entry) => asText(entry.participantId) || asText(entry.name))
      .slice(0, MAX_RESULT_ENTRIES)
      .map((entry) => ({
        participantId: asText(entry.participantId),
        name: asText(entry.name).slice(0, MAX_NAME_LENGTH) || "Player",
        score: asInteger(entry.score),
        rank: Math.max(1, asInteger(entry.rank)),
      }))
      .sort((left, right) => left.rank - right.rank),
  }
}

/** `null` for anything that is not a well-formed invite — including non-game metadata. */
export function parseLiveGameInvite(metadata: unknown): LiveGameInvite | null {
  const record = asRecord(metadata)
  if (!record || record.kind !== LIVE_GAME_METADATA_KIND) return null
  const code = normalizeJoinCode(record.code)
  const quizId = asText(record.quizId)
  if (!code || !quizId) return null
  return {
    kind: LIVE_GAME_METADATA_KIND,
    code,
    mode: normalizeLiveMode(record.mode),
    quizId,
    quizTitle: asText(record.quizTitle).slice(0, MAX_TITLE_LENGTH) || "Live quiz",
  }
}

/** `null` for anything that is not a well-formed result — including non-game metadata. */
export function parseLiveGameResult(metadata: unknown): LiveGameResult | null {
  const record = asRecord(metadata)
  if (!record || record.kind !== LIVE_GAME_RESULT_METADATA_KIND) return null
  const code = normalizeJoinCode(record.code)
  const quizId = asText(record.quizId)
  if (!code || !quizId) return null
  const rawParticipants = Array.isArray(record.participants) ? record.participants : []
  const participants = rawParticipants.flatMap((raw): LiveGameResultEntry[] => {
    const entry = asRecord(raw)
    if (!entry) return []
    const participantId = asText(entry.participantId)
    const name = asText(entry.name)
    if (!participantId && !name) return []
    return [{
      participantId: participantId || name,
      name: name.slice(0, MAX_NAME_LENGTH) || "Player",
      score: asInteger(entry.score),
      rank: Math.max(1, asInteger(entry.rank)),
    }]
  })
  return {
    kind: LIVE_GAME_RESULT_METADATA_KIND,
    code,
    mode: normalizeLiveMode(record.mode),
    quizId,
    quizTitle: asText(record.quizTitle).slice(0, MAX_TITLE_LENGTH) || "Live quiz",
    participants: participants.sort((left, right) => left.rank - right.rank),
  }
}

/**
 * The human sentence under a launch card. Short on purpose: it is a chat
 * message first, and the reader may be on a phone with the code half-covered.
 * The mode label comes from the engine's own table, so the card, the badge, and
 * the sentence cannot name the mode differently.
 */
export function liveGameInviteBody(invite: LiveGameInvite): string {
  return `${LIVE_QUIZ_MODE_LABELS[invite.mode]}: ${invite.quizTitle} — join with code ${invite.code}`
}

/** The human sentence under a result card. */
export function liveGameResultBody(result: LiveGameResult): string {
  const label = LIVE_QUIZ_MODE_LABELS[result.mode]
  const winner = result.participants[0]
  if (!winner) return `${label}: ${result.quizTitle} — nobody played.`
  const others = result.participants.length - 1
  return `${label}: ${result.quizTitle} — ${winner.name} won with ${winner.score} points${others > 0 ? `, ahead of ${others} other${others === 1 ? "" : "s"}` : ""}.`
}
