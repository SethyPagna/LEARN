import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CreateMenuPanel } from "../../components/learn/create-menu"
import { PlaceGuidePanel } from "../../components/learn/place-guide"
import { launcherCommands, navigationGroups } from "../../lib/navigation"
import { resolveMenuKey } from "../../lib/ux/menu-navigation"
import { ARTIFACT_TYPE_IDS, ARTIFACT_TYPES, PLACE_IDS, PLACES } from "../../lib/ux/artifact-catalog"

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..")

function readSource(relativePath: string) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8")
}

/** The ids a rendered panel actually emits, in render order. */
function renderedIds(markup: string, attribute: string) {
  return [...markup.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g"))].map((match) => match[1])
}

/** React escapes text nodes, so prose has to be compared unescaped. */
function decodeEntities(markup: string) {
  return markup
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

const APP_NAV = "src/components/learn/app-nav.tsx"
const LEARN_SHELL = "src/components/learn/learn-shell.tsx"
const CREATE_MENU = "src/components/learn/create-menu.tsx"
const PLACE_GUIDE = "src/components/learn/place-guide.tsx"
const MENU_KEYBOARD = "src/components/learn/menu-keyboard.ts"

test("the Create control renders one entry per artifact type, in catalog order", () => {
  const markup = renderToStaticMarkup(createElement(CreateMenuPanel, { onChoose: () => {} }))

  assert.deepEqual(
    renderedIds(markup, "data-artifact-id"),
    [...ARTIFACT_TYPE_IDS],
    "the Create menu must list every artifact exactly once, in ARTIFACT_TYPE_IDS order",
  )

  // The point of the control is that it explains, not just links.
  const text = decodeEntities(markup)
  for (const artifact of ARTIFACT_TYPES) {
    assert.ok(text.includes(artifact.oneLine), `${artifact.id} must show its oneLine sentence`)
    assert.ok(text.includes(artifact.label), `${artifact.id} must show its label`)
  }
})

test("the place guide renders one entry per place, with a route for each", () => {
  const markup = renderToStaticMarkup(createElement(PlaceGuidePanel, { onChoose: () => {} }))

  assert.deepEqual(
    renderedIds(markup, "data-place-id"),
    [...PLACE_IDS],
    "the guide must list every place exactly once, in PLACE_IDS order",
  )

  const text = decodeEntities(markup)
  for (const place of PLACES) {
    assert.ok(text.includes(place.oneLine), `${place.id} must show its oneLine sentence`)
    assert.ok(markup.includes(`href="${place.route}"`), `${place.id} must link to its own route`)
  }
})

test("both new controls live in the component tree, not just in their own files", () => {
  const appNav = readSource(APP_NAV)

  assert.match(appNav, /import \{[^}]*\bCreateMenu\b[^}]*\} from "\.\/create-menu"/, "app-nav must import the Create control")
  assert.equal(
    (appNav.match(/<CreateMenu /g) || []).length,
    2,
    "the Create control must be mounted twice: the desktop sidebar and the mobile header",
  )
  assert.match(appNav, /CreateMenu variant=\{compact \? "rail" : "sidebar"\}/, "the sidebar must use the rail/sidebar variants")
  assert.match(appNav, /CreateMenu variant="header"/, "the mobile header must mount the header variant")
  assert.match(appNav, /import \{ openPlaceGuide \} from "\.\/place-guide"/, "the launcher must be able to open the guide")

  const shell = readSource(LEARN_SHELL)
  assert.match(shell, /import \{ PlaceGuide \} from "\.\/place-guide"/, "the shell must import the guide")
  assert.match(shell, /<PlaceGuide setView=\{chooseView\} \/>/, "the guide must be mounted once for the whole app")
})

test("each control delegates its rendering to the catalog, with no hardcoded ids", () => {
  for (const file of [CREATE_MENU, PLACE_GUIDE]) {
    const source = readSource(file)

    assert.match(source, /from "@\/lib\/ux\/artifact-catalog"/, `${file} must read the catalog`)
    // A literal id here would let the UI and the catalog drift apart.
    for (const id of [...ARTIFACT_TYPE_IDS, ...PLACE_IDS]) {
      assert.equal(source.includes(`"${id}"`), false, `${file} must not hardcode the "${id}" id`)
    }
  }

  assert.match(readSource(CREATE_MENU), /<CreateMenuPanel /, "the Create control must render CreateMenuPanel")
  assert.match(readSource(PLACE_GUIDE), /<PlaceGuidePanel /, "the guide must render PlaceGuidePanel")
  assert.match(readSource(CREATE_MENU), /useMenuKeyboard\(\{/, "the Create menu must use the shared keyboard binding")
  assert.match(readSource(PLACE_GUIDE), /useMenuKeyboard\(\{/, "the guide must use the shared keyboard binding")
  assert.match(readSource(APP_NAV), /openCreateMenu/, "the launcher must open the Create control")
})

test("the launcher offers exactly one create and one guide entry, both keyworded", () => {
  const createCommands = launcherCommands.filter((command) => command.action === "create-menu")
  const guideCommands = launcherCommands.filter((command) => command.action === "place-guide")

  assert.equal(createCommands.length, 1, "there must be one launcher entry for Create")
  assert.equal(guideCommands.length, 1, "there must be one launcher entry for the guide")
  assert.equal(createCommands[0].label, "Create something new")
  assert.equal(guideCommands[0].label, "What can LEARN do?")
  assert.match(guideCommands[0].detail.toLowerCase(), /place/)
  assert.ok(guideCommands[0].keywords.length >= 4, "a launcher entry needs enough keywords to be searchable")
  assert.ok(createCommands[0].keywords.length >= 4, "a launcher entry needs enough keywords to be searchable")

  // Entries without an action must keep navigating to a real view.
  for (const command of launcherCommands.filter((entry) => !entry.action)) {
    assert.ok(command.view, `${command.label} must name the view it opens`)
  }
})

test("the dashboard offers the guide from its empty setup state", () => {
  const dashboard = readSource("src/components/learn/views/dashboard-view.tsx")

  assert.match(dashboard, /import \{ openPlaceGuide \} from "\.\.\/place-guide"/, "the dashboard must be able to open the guide")
  assert.match(dashboard, /onClick=\{openPlaceGuide\}/, "an empty-state card must open the guide")
  assert.match(dashboard, /New here\? What&apos;s where/, "the empty-state card needs a label that says what it does")
})

/**
 * The restructuring guard.
 *
 * This change adds clarity; it is not allowed to move anything. If a future
 * edit renames a sidebar group or one of the eight primary destinations, the
 * guide's "grouped the same way as the sidebar" promise breaks silently — so
 * the pinned surface is repeated here, independently of navigation.test.ts.
 */
test("no sidebar group label or primary destination was renamed by this change", () => {
  assert.deepEqual(
    navigationGroups.map((group) => group.label),
    ["Home", "Learn", "Practice", "Social", "Manage"],
  )
  assert.deepEqual(
    navigationGroups.flatMap((group) => group.items).map((item) => item.view),
    ["dashboard", "studio", "ai", "files", "calendar", "practice", "social", "settings"],
  )
})

test("a focused text field keeps its keys: menus never hijack typing", () => {
  const base = { activeIndex: 0, count: 5, open: true }

  for (const key of ["ArrowDown", "ArrowUp", "Enter", "a", "Tab"]) {
    assert.deepEqual(
      resolveMenuKey({ ...base, key, targetIsEditable: true }),
      { type: "ignore" },
      `${key} typed into an input must reach the input`,
    )
  }
  assert.deepEqual(resolveMenuKey({ ...base, key: "Escape", targetIsEditable: true }), { type: "close" })
})

test("menu keys wrap, refuse to act while closed, and stay inert without entries", () => {
  assert.deepEqual(resolveMenuKey({ activeIndex: -1, count: 3, key: "ArrowDown", open: true }), { type: "focus", index: 0 })
  assert.deepEqual(resolveMenuKey({ activeIndex: 2, count: 3, key: "ArrowDown", open: true }), { type: "focus", index: 0 })
  assert.deepEqual(resolveMenuKey({ activeIndex: 0, count: 3, key: "ArrowUp", open: true }), { type: "focus", index: 2 })
  assert.deepEqual(resolveMenuKey({ activeIndex: 1, count: 3, key: "Enter", open: true }), { type: "choose", index: 1 })
  assert.deepEqual(resolveMenuKey({ activeIndex: -1, count: 3, key: "Enter", open: true }), { type: "choose", index: 0 })
  assert.deepEqual(resolveMenuKey({ activeIndex: 0, count: 3, key: "ArrowDown", open: false }), { type: "ignore" })
  assert.deepEqual(resolveMenuKey({ activeIndex: 0, count: 0, key: "ArrowDown", open: true }), { type: "ignore" })
  assert.deepEqual(resolveMenuKey({ activeIndex: 0, count: 3, key: "Tab", open: true }), { type: "ignore" })
  assert.deepEqual(resolveMenuKey({ activeIndex: 0, count: 3, key: "Escape", open: true }), { type: "close" })
})

test("the shared keyboard binding is the one both menus use", () => {
  const keyboard = readSource(MENU_KEYBOARD)

  assert.match(keyboard, /export function useMenuKeyboard/, "the binding must be exported for both menus")
  assert.match(keyboard, /resolveMenuKey\(/, "the binding must defer to the pure resolver")
  assert.match(keyboard, /target\.isContentEditable/, "the binding must recognise rich-text fields, not only inputs")
})
