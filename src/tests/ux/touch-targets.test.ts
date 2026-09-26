import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

/**
 * Guards two things that are easy to lose and expensive to notice:
 *
 *  1. the canvas resize/rotate handles keep a hit area a finger can actually
 *     find (the dot stays small, the *target* does not), and
 *  2. the browser UX audit stays wired up — the script, its CDP driver, the npm
 *     entry point, and the two measurements that make its numbers mean
 *     something (scrollable vs clipped, and the real hit area).
 *
 * Both are read from the source, so they cannot silently disappear.
 */

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")
const CANVAS_EDITOR = "src/components/learn/design/editor-styles.ts"
const DESIGN_STAGE = "src/components/learn/design/design-stage.tsx"
const AUDIT_SCRIPT = "ops/scripts/test/browser-ux-audit.mjs"
const CDP_DRIVER = "ops/scripts/test/lib/cdp.mjs"

/** WCAG 2.2 SC 2.5.8 "Target Size (Minimum)". */
const MIN_TARGET_PX = 24

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8")
}

/** The declarations of every `selector { ... }` block, concatenated. */
function declarationsFor(css: string, selector: string) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^{}]*)\\}`, "g")
  return [...css.matchAll(pattern)].map((match) => match[1]).join(" ")
}

/** The declarations inside `@media (<query>) { ... }`, braces balanced. */
function mediaDeclarations(css: string, query: string) {
  const start = css.indexOf(`@media (${query})`)
  assert.notEqual(start, -1, `canvas-editor must keep a @media (${query}) block`)

  let depth = 0
  const open = css.indexOf("{", start)
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === "{") depth += 1
    if (css[index] === "}") {
      depth -= 1
      if (depth === 0) return css.slice(open + 1, index)
    }
  }
  throw new Error(`unbalanced braces after @media (${query})`)
}

function pxValue(declarations: string, property: string) {
  const match = new RegExp(`(?:^|[;{\\s])${property}:\\s*(-?\\d+(?:\\.\\d+)?)px`).exec(declarations)
  return match ? Number(match[1]) : null
}

/**
 * The hit area a rule buys, derived the way the browser would see it: an explicit
 * box on a pseudo-element wins, but negative insets, padding and borders all grow
 * the touchable surface too, so any of them is accepted. Never returns less than
 * the painted dot itself.
 */
function hitAreaPx(declarations: string, dotPx: number) {
  const candidates = [dotPx]

  const box = ["width", "height", "min-width", "min-height"]
    .map((property) => pxValue(declarations, property))
    .filter((value): value is number => value !== null)
  if (box.length) candidates.push(Math.min(...box))

  for (const property of ["inset", "padding", "border-width", "outline-width"]) {
    const value = pxValue(declarations, property)
    if (value !== null) candidates.push(dotPx + 2 * Math.abs(value))
  }

  return Math.max(...candidates)
}

const canvasCss = readSource(CANVAS_EDITOR)
const handleRule = declarationsFor(canvasCss, ".learn-canvas-soft .canvas-handle")
const hitRule = declarationsFor(canvasCss, ".learn-canvas-soft .canvas-handle::after") +
  declarationsFor(canvasCss, ".learn-canvas-soft .canvas-handle::before")

test("canvas handles keep a hit area of at least 24x24 around the small dot", () => {
  // Chrome lives outside the transformed page, so dot and hit area stay in
  // screen pixels at every zoom level.
  const dotMatch = /width: (\d+(?:\.\d+)?), height: \1, transform: "translate\(-50%,-50%\)"/.exec(readSource(DESIGN_STAGE))
  assert.ok(dotMatch, "design-stage must keep its handles at a fixed screen size")
  const dotPx = Number(dotMatch[1])
  assert.ok(dotPx <= 14, `handle dots stay small; found ${dotPx}px`)

  const hitPx = hitAreaPx(`${hitRule} ${handleRule}`, dotPx)
  assert.ok(
    hitPx >= MIN_TARGET_PX,
    `the canvas handle hit area must be >= ${MIN_TARGET_PX}px (WCAG 2.2 target size); found ${hitPx}px`,
  )

  const border = /(?:^|[;{\s])border:\s*([^;]+)/.exec(handleRule)?.[1]
  assert.equal(border?.trim(), "0", "the painted dot must stay borderless — only its hit area grows")
})

test("coarse pointers get a larger canvas handle hit area than a mouse", () => {
  const coarse = mediaDeclarations(canvasCss, "pointer: coarse")
  const coarseHit = hitAreaPx(
    declarationsFor(coarse, ".learn-canvas-soft .canvas-handle::after") +
      declarationsFor(coarse, ".learn-canvas-soft .canvas-handle"),
    hitAreaPx(hitRule, 10),
  )

  assert.ok(
    coarseHit > MIN_TARGET_PX,
    `touch devices must get more than the ${MIN_TARGET_PX}px minimum; found ${coarseHit}px`,
  )
  assert.match(coarse, /touch-action:\s*none/, "a touch drag on a handle must not be swallowed by scrolling")
})

test("the browser UX audit is wired up as a runnable check", () => {
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, AUDIT_SCRIPT)), true, `${AUDIT_SCRIPT} must exist`)
  assert.equal(fs.existsSync(path.join(PROJECT_ROOT, CDP_DRIVER)), true, `${CDP_DRIVER} must exist`)

  const { scripts } = JSON.parse(readSource("package.json")) as { scripts: Record<string, string> }
  assert.match(scripts["audit:ux"] ?? "", /browser-ux-audit\.mjs/, "package.json must expose audit:ux")

  const audit = readSource(AUDIT_SCRIPT)
  const driver = readSource(CDP_DRIVER)

  // Dependency-free on purpose: Chrome is driven over its own socket.
  const specifiers = [...(audit + driver).matchAll(/^\s*import[^"']*from\s+"([^"]+)"/gm)].map((match) => match[1])
  assert.ok(specifiers.length >= 4, "the audit must import what it needs")
  for (const specifier of specifiers) {
    assert.match(specifier, /^(node:|\.)/, `the audit must not depend on ${specifier}`)
  }
  assert.match(driver, /new WebSocket\(/, "the CDP driver must use Node's built-in WebSocket")
  assert.match(driver, /fetch\(/, "the CDP driver must use Node's built-in fetch")
})

test("the browser UX audit keeps the measurements that make it evidence", () => {
  const audit = readSource(AUDIT_SCRIPT)

  // Scrollable strips are reachable, clipped content is not: without this walk
  // the reported count cannot tell a defect from a carousel.
  assert.match(audit, /overflowX === "auto" \|\| overflowX === "scroll"/, "the audit must detect scrollable ancestors")
  assert.match(audit, /scrollWidth > (node|el)\.clientWidth/, "the audit must check the container really scrolls")

  // Real hit area, not painted size, and handles measured with an element selected.
  assert.match(audit, /checkVisibility/, "hidden popovers must not be counted as clipped content")
  assert.match(audit, /elementFromPoint/, "the audit must probe the real hit area")
  assert.match(audit, /data-resize-handle/, "the audit must measure the canvas handles")
  assert.match(audit, /canvas-layer button/, "the audit must select a canvas element so the handles exist")

  // Usable as a check: non-zero on failures, 2 on a broken environment.
  assert.match(audit, /process\.exit\(failed\.length \? 1 : 0\)/, "the audit must exit non-zero on failures")
  assert.match(audit, /process\.exit\(2\)/, "the audit must exit 2 when Chrome or the dev server is missing")
  assert.match(audit, /browser-ux-audit\.json/, "the audit must write its machine-readable report")
})
