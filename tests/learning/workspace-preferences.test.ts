import assert from "node:assert/strict"
import test from "node:test"
import { defaultWorkspaceOptions, normalizeWorkspaceOptions } from "../../lib/workspace-preferences"

test("workspace preference normalization keeps valid personalization choices", () => {
  const options = normalizeWorkspaceOptions({
    appAccent: "rose",
    dashboardDetail: "focused",
    fileLayout: "grid",
    highContrast: true,
    aiMaxTokens: 12000,
    calendarDefaultMinutes: 90,
    restDay: "friday",
  })

  assert.equal(options.appAccent, "rose")
  assert.equal(options.dashboardDetail, "focused")
  assert.equal(options.fileLayout, "grid")
  assert.equal(options.highContrast, true)
  assert.equal(options.aiMaxTokens, 12000)
  assert.equal(options.calendarDefaultMinutes, 90)
  assert.equal(options.restDay, "friday")
})

test("workspace preference normalization clamps malformed saved options", () => {
  const options = normalizeWorkspaceOptions({
    appAccent: "mud",
    dashboardDetail: "verbose",
    fileLayout: "columns",
    highContrast: "yes",
    aiMaxTokens: 999999,
    aiTemperature: -2,
    calendarDefaultMinutes: 1,
    feedSerendipity: 99,
    sheetRows: -20,
  })

  assert.equal(options.appAccent, defaultWorkspaceOptions.appAccent)
  assert.equal(options.dashboardDetail, defaultWorkspaceOptions.dashboardDetail)
  assert.equal(options.fileLayout, defaultWorkspaceOptions.fileLayout)
  assert.equal(options.highContrast, defaultWorkspaceOptions.highContrast)
  assert.equal(options.aiMaxTokens, 16384)
  assert.equal(options.aiTemperature, 0)
  assert.equal(options.calendarDefaultMinutes, 5)
  assert.equal(options.feedSerendipity, 50)
  assert.equal(options.sheetRows, 1)
})

test("workspace preference normalization falls back for non-object input", () => {
  assert.deepEqual(normalizeWorkspaceOptions(null), defaultWorkspaceOptions)
  assert.deepEqual(normalizeWorkspaceOptions("bad"), defaultWorkspaceOptions)
})
