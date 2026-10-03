import assert from "node:assert/strict"
import test from "node:test"
import {
  buddyLine,
  buddyMood,
  greetingFor,
  localDay,
  localDayModifier,
  mergeRecent,
  parseTimezoneOffset,
  shiftDay,
  summarizeStreak,
} from "../../lib/today"

test("shiftDay crosses month, year and leap-day boundaries", () => {
  assert.equal(shiftDay("2026-03-01", -1), "2026-02-28")
  assert.equal(shiftDay("2028-03-01", -1), "2028-02-29")
  assert.equal(shiftDay("2026-12-31", 1), "2027-01-01")
  assert.throws(() => shiftDay("2026-02-30", 1), RangeError)
})

test("the streak counts back from today, or from yesterday while today is still open", () => {
  const days = ["2026-09-24", "2026-09-25", "2026-09-26"]
  assert.deepEqual(
    { ...summarizeStreak(days, "2026-09-26"), week: undefined },
    { streak: 3, studiedToday: true, week: undefined },
  )
  const open = summarizeStreak(days, "2026-09-27")
  assert.equal(open.streak, 3, "a streak survives until the day ends")
  assert.equal(open.studiedToday, false)
  assert.equal(summarizeStreak(days, "2026-09-28").streak, 0, "a missed day resets it")
})

test("the streak ignores duplicates, gaps before the run, and malformed days", () => {
  const summary = summarizeStreak(["2026-09-20", "2026-09-26", "2026-09-26", "2026-09-27", "not-a-day", "2026-13-01"], "2026-09-27")
  assert.equal(summary.streak, 2)
  assert.equal(summary.studiedToday, true)
})

test("the week strip is the last seven days, oldest first, ending today", () => {
  const { week } = summarizeStreak(["2026-09-21", "2026-09-27", "2026-09-30"], "2026-09-27")
  assert.deepEqual(week.map(({ day }) => day), [
    "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
  ])
  assert.deepEqual(week.map(({ active }) => active), [true, false, false, false, false, false, true])
})

test("time zone offsets are validated and turned into local days", () => {
  assert.equal(parseTimezoneOffset("-420"), -420)
  assert.equal(parseTimezoneOffset(300), 300)
  for (const bad of ["", "abc", "12.5", "9999", null, undefined, Number.NaN]) assert.equal(parseTimezoneOffset(bad), 0)
  assert.equal(localDayModifier(-420), "+420 minutes")
  assert.equal(localDayModifier(300), "-300 minutes")
  assert.equal(localDayModifier(0), "+0 minutes")
  const lateUtc = new Date("2026-09-27T20:30:00.000Z")
  assert.equal(localDay(lateUtc, 0), "2026-09-27")
  assert.equal(localDay(lateUtc, -420), "2026-09-28", "UTC+7 is already tomorrow")
  assert.equal(localDay(new Date("2026-09-27T02:00:00.000Z"), 300), "2026-09-26", "UTC-5 is still yesterday")
})

test("the greeting follows the hour", () => {
  assert.equal(greetingFor(6), "Good morning")
  assert.equal(greetingFor(13), "Good afternoon")
  assert.equal(greetingFor(19), "Good evening")
  assert.equal(greetingFor(2), "Good evening")
})

test("the buddy cheers streaks, nudges a streak at risk and yawns late", () => {
  assert.equal(buddyMood({ streak: 5, studiedToday: true }, 10), "excited")
  assert.equal(buddyMood({ streak: 1, studiedToday: true }, 10), "happy")
  assert.equal(buddyMood({ streak: 4, studiedToday: false }, 23), "curious")
  assert.equal(buddyMood({ streak: 0, studiedToday: false }, 23), "sleepy")
  assert.equal(buddyMood({ streak: 0, studiedToday: false }, 9), "hello")
  assert.equal(buddyLine({ streak: 5, studiedToday: true }, 10), "5 days in a row. You're on fire.")
  assert.equal(buddyLine({ streak: 2, studiedToday: true }, 10), "2 days in a row. Nice.")
  assert.equal(buddyLine({ streak: 1, studiedToday: true }, 10), "Nice work today.")
  assert.equal(buddyLine({ streak: 4, studiedToday: false }, 10), "A quick session keeps your 4-day streak.")
  assert.equal(buddyLine({ streak: 0, studiedToday: false }, 9), "Let's start a streak today.")
})

test("recent work merges browser drafts, newest first, keeping the newer copy", () => {
  const saved = [
    { kind: "notes", id: "n1", updatedAt: "2026-09-26 09:00:00" },
    { kind: "canvas", id: "c1", updatedAt: "2026-09-25 09:00:00" },
    { kind: "slides", id: "s1", updatedAt: "2026-09-27T02:00:00.000Z" },
  ]
  const drafts = [
    { kind: "canvas", id: "c1", updatedAt: "2026-09-27T03:00:00.000Z" },
    { kind: "canvas", id: "c2", updatedAt: "2026-09-20T03:00:00.000Z" },
    { kind: "notes", id: "n1", updatedAt: "2026-09-01T00:00:00.000Z" },
  ]
  const merged = mergeRecent(saved, drafts, 4)
  assert.deepEqual(merged.map((item) => `${item.kind}:${item.id}`), ["canvas:c1", "slides:s1", "notes:n1", "canvas:c2"])
  assert.equal(merged[0].updatedAt, "2026-09-27T03:00:00.000Z", "the newer draft wins")
  assert.equal(merged[2].updatedAt, "2026-09-26 09:00:00", "an older draft never hides newer saved work")
  assert.equal(mergeRecent(saved, [], 2).length, 2)
  assert.deepEqual(mergeRecent([{ kind: "notes", id: "x", updatedAt: "" }, ...saved], [], 4).at(-1)?.id, "x", "unreadable stamps sort last")
})
