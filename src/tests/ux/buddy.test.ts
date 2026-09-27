import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Buddy } from "../../components/learn/buddy"

const moods = ["happy", "excited", "curious", "sleepy", "hello"] as const

test("every buddy mood draws a face with a spoken name", () => {
  const faces = new Set<string>()
  for (const mood of moods) {
    const markup = renderToStaticMarkup(createElement(Buddy, { mood }))
    assert.match(markup, new RegExp(`data-mood="${mood}"`))
    assert.match(markup, /role="img"/)
    assert.match(markup, /aria-label="Study buddy, [a-z ]+"/)
    faces.add(markup.replace(/data-mood="[a-z]+"|aria-label="[^"]*"/g, ""))
  }
  assert.equal(faces.size, moods.length, "each mood looks different")
})

test("the buddy hides from screen readers when the text beside it already speaks", () => {
  const markup = renderToStaticMarkup(createElement(Buddy, { mood: "happy", label: "" }))
  assert.match(markup, /aria-hidden="true"/)
  assert.doesNotMatch(markup, /role="img"/)
})

test("the buddy only moves when motion is welcome", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8")
  const animations = css.match(/animation:\s*buddy-/g) || []
  const start = css.indexOf(".learn-buddy[data-animated]")
  const guarded = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", start), css.indexOf("@keyframes buddy-"))
  assert.equal((guarded.match(/animation:\s*buddy-/g) || []).length, animations.length, "every animation sits inside the no-preference block")
  assert.ok(guarded.split("\n").filter((line) => line.includes("animation:")).every((line) => line.includes("html:not(.learn-reduced-motion)")), "and respects the in-app reduced-motion switch")
  assert.doesNotMatch(renderToStaticMarkup(createElement(Buddy, { animated: false })), /data-animated/)
  assert.match(renderToStaticMarkup(createElement(Buddy, {})), /data-animated="true"/)
})
