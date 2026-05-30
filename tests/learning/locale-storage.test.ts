import assert from "node:assert/strict"
import test from "node:test"
import { DEFAULT_LOCALE, normalizeStoredLocale, readStoredLocale, writeStoredLocale } from "../../lib/i18n/locale-storage"

test("locale storage normalizes supported language choices", () => {
  assert.equal(normalizeStoredLocale("km"), "km")
  assert.equal(normalizeStoredLocale("ar"), "ar")
})

test("locale storage falls back for unsafe saved values", () => {
  assert.equal(normalizeStoredLocale("pirate"), DEFAULT_LOCALE)
  assert.equal(normalizeStoredLocale(""), DEFAULT_LOCALE)
  assert.equal(normalizeStoredLocale(null), DEFAULT_LOCALE)
})

test("locale storage is safe during server rendering", () => {
  assert.equal(readStoredLocale(), DEFAULT_LOCALE)
  assert.doesNotThrow(() => writeStoredLocale("en"))
})
