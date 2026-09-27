import assert from "node:assert/strict"
import test from "node:test"
import { resolveThemeMode } from "../../lib/appearance"

test("new and unknown appearance preferences default to Color", () => {
  assert.equal(resolveThemeMode(undefined), "color")
  assert.equal(resolveThemeMode(""), "color")
  assert.equal(resolveThemeMode("obsolete-theme"), "color")
})

test("explicit appearance choices override the system preference", () => {
  assert.equal(resolveThemeMode("light", "dark"), "light")
  assert.equal(resolveThemeMode("dark", "light"), "dark")
  assert.equal(resolveThemeMode("color", "dark"), "color")
})

test("legacy System preferences migrate to their current light or dark appearance", () => {
  assert.equal(resolveThemeMode("system", "dark"), "dark")
  assert.equal(resolveThemeMode("system", "light"), "light")
})
