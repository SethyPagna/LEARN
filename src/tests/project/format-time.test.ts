import assert from "node:assert/strict"
import test from "node:test"
import { formatRelativeTime, parseServerTime } from "../../lib/format-time"

test("SQLite timestamps retain UTC meaning in every viewer timezone", () => {
  assert.equal(parseServerTime("2026-09-24 20:45:00").toISOString(), "2026-09-24T20:45:00.000Z")
  assert.equal(formatRelativeTime("2026-09-24 20:45:00", new Date("2026-09-24T20:45:20Z")), "now")
})

test("explicit timestamp offsets are preserved", () => {
  assert.equal(parseServerTime("2026-09-25T04:45:00+08:00").toISOString(), "2026-09-24T20:45:00.000Z")
  assert.equal(formatRelativeTime("2026-09-24T20:40:00Z", new Date("2026-09-24T20:45:00Z")), "5m")
})

test("missing and invalid timestamps do not render misleading times", () => {
  assert.equal(formatRelativeTime(null), "")
  assert.equal(formatRelativeTime("invalid"), "")
})
