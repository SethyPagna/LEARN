import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { CreateMenuPanel } from "../../components/learn/create-menu"
import { PageSections } from "../../components/learn/page-sections"
import { PlaceGuidePanel } from "../../components/learn/place-guide"
import type { View } from "../../components/learn/types"
import { getVocabulary } from "../../lib/i18n/vocabulary"
import { launcherCommands, navigationGroups, topbarLabelsForView, viewLabelKeys } from "../../lib/navigation"
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
const STUDIO_LOBBY = "src/components/learn/studio-lobby.tsx"

/**
 * The source of one top-level component, from its declaration to the next one.
 * Guards about *where* a control lives need a slice, or they pass on an
 * affordance that was moved to a different card in the same file.
 */
function componentSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`)
  assert.notEqual(start, -1, `${name} must still be a top-level component in its file`)
  const end = source.indexOf("\nfunction ", start + 1)
  return source.slice(start, end === -1 ? source.length : end)
}

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
  assert.match(shell, /import \{[^}]*\bPlaceGuide\b[^}]*\} from "\.\/place-guide"/, "the shell must import the guide")
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

test("the personal Studio lobby keeps a discoverable guide without a dashboard of setup cards", () => {
  const lobby = readSource(STUDIO_LOBBY)
  assert.match(lobby, /onClick=\{openPlaceGuide\}/)
  const guide = launcherCommands.find((command) => command.action === "place-guide")
  assert.ok(guide)
  assert.ok(lobby.includes(guide.label))
})

test("sidebar keeps the five places: Today, Create, Practice, Friends, Me", () => {
  assert.deepEqual(
    navigationGroups.map((group) => group.label),
    ["Today", "Create", "Practice", "Friends", "Me"],
  )
  assert.deepEqual(
    navigationGroups.flatMap((group) => group.items).map((item) => item.view),
    ["dashboard", "studio", "practice", "social", "profile"],
  )
})

test("the sidebar and the phone dock show the same five places, with no More sheet", () => {
  const appNav = readSource(APP_NAV)
  const dock = componentSource(appNav, "MobileTabBar")
  const sidebarList = componentSource(appNav, "Navigation")

  for (const source of [dock, sidebarList]) {
    assert.match(source, /navigationItems\.map\(/, "both must list the places from the navigation contract")
    assert.match(source, /aria-current=\{placeCurrent\(item, view, activePlace\)\}/, "both must mark the active place the same way")
  }
  assert.doesNotMatch(dock, /Everything in LEARN|"More"|>More</, "the phone dock has no More sheet")
  assert.doesNotMatch(sidebarList, /subViews/, "the sidebar lists places only; each place's pages are its tab row")
  assert.match(componentSource(appNav, "AccountMenu"), /openPlaceGuide\(\)/, "the account menu keeps \"What's where?\" on every screen size")
  assert.match(readSource(LEARN_SHELL), /const placeView: View = viewingSomeoneElse \? "social" : view/, "someone else's profile lights up Friends")
})

test("every place draws the same tab row, and an open editor draws none", () => {
  const text = getVocabulary("en")
  const render = (view: View, isAdmin = false) => renderToStaticMarkup(createElement(PageSections, { isAdmin, setView: () => {}, text, view }))

  const calendar = render("calendar")
  assert.match(calendar, /aria-label="Today sections"/)
  assert.deepEqual(renderedIds(calendar, "data-section"), ["dashboard", "calendar", "progress", "reviews"])
  assert.match(calendar, /data-section="calendar" aria-current="page"/)
  assert.deepEqual(renderedIds(render("files"), "data-section"), ["studio", "vault", "files"])
  assert.deepEqual(renderedIds(render("ai"), "data-section"), ["quizzes", "live", "games", "ai", "graph"])
  assert.match(render("social"), /aria-label="Friends sections"/)
  assert.match(render("social"), /data-section="chat" aria-current="page"/)
  assert.deepEqual(renderedIds(render("settings"), "data-section"), ["profile", "settings"], "Admin is not a tab for learners")
  assert.deepEqual(renderedIds(render("settings", true), "data-section"), ["profile", "settings", "admin"])
  for (const editor of ["notes", "docs", "sheets", "slides"] as const) assert.equal(render(editor), "", `${editor} is an editor`)

  assert.doesNotMatch(readSource("src/components/learn/views/workspaces/combined-workspace-views.tsx"), /<nav /, "Friends pages use the shared tab row, not their own")
  assert.doesNotMatch(readSource("src/app/globals.css"), /\.page-sections button:nth-child/, "tab icons wear their meaning, not their position")
  assert.match(readSource(LEARN_SHELL), /\{isEditor \|\| viewingSomeoneElse \? null : <PageSections /, "the shell leaves the row out on editors and on someone else's profile")
})

test("the top bar names the place; a page title that repeats the active tab is for screen readers only", () => {
  const namesPlace = (title: keyof ReturnType<typeof getVocabulary>) => ({ place: null, title })
  assert.deepEqual(topbarLabelsForView("dashboard"), namesPlace("today"))
  assert.deepEqual(topbarLabelsForView("calendar"), namesPlace("today"))
  assert.deepEqual(topbarLabelsForView("vault"), namesPlace("create"))
  assert.deepEqual(topbarLabelsForView("canvas"), namesPlace("create"), "the canvas list is a Studio filter")
  assert.deepEqual(topbarLabelsForView("ai"), namesPlace("practice"))
  assert.deepEqual(topbarLabelsForView("social"), namesPlace("friends"))
  assert.deepEqual(topbarLabelsForView("discover"), namesPlace("friends"))
  assert.deepEqual(topbarLabelsForView("admin"), namesPlace("me"))
  for (const editor of ["notes", "docs", "sheets", "slides"] as const) {
    assert.deepEqual(topbarLabelsForView(editor), { place: "create", title: viewLabelKeys[editor] }, `${editor} is named after its place`)
  }
  assert.deepEqual(topbarLabelsForView("canvas", true), { place: "create", title: "canvas" }, "an open design is an editor")

  const shell = readSource(LEARN_SHELL)
  assert.match(shell, /<Topbar[^>]*?editorOpen=\{isEditor\}[^>]*?view=\{placeView\}/, "the bar knows about open editors and names Friends on someone else's profile")

  const titles: Array<[string, RegExp]> = [
    ["src/components/learn/views/calendar-view.tsx", /<h2 className="sr-only">Calendar<\/h2>/],
    ["src/components/learn/views/secondary-views.tsx", /<h2 className="sr-only">Progress<\/h2>/],
    ["src/components/learn/views/secondary-views.tsx", /<h2 className="sr-only">Settings<\/h2>/],
    ["src/components/learn/views/secondary-views.tsx", /<h2 className="sr-only">Admin<\/h2>/],
    ["src/components/learn/views/ecosystem-views.tsx", /<h2 className="sr-only">Vault<\/h2>/],
    ["src/components/learn/views/ecosystem-views.tsx", /<h2 className="sr-only">Reviews<\/h2>/],
    ["src/components/learn/views/ecosystem-views.tsx", /<h2 className="sr-only">Feed<\/h2>/],
    ["src/components/learn/views/ai-view.tsx", /<h2 className="sr-only">AI tutor<\/h2>/],
    ["src/components/learn/studio-lobby.tsx", /className=\{workspaceTitle === "Studio" \? "sr-only"/],
  ]
  for (const [file, title] of titles) assert.match(readSource(file), title, `${file} keeps its title for screen readers only`)

  // The owner's pick at the checkpoint 3 stop: a title that carries a count shows, with its count ("Files 12").
  const counted: Array<[string, RegExp]> = [
    ["src/components/learn/views/files-view.tsx", /<h2 className="page-count"[^>]*>Files <span>\{files\.length\}<\/span><\/h2>/],
    ["src/components/learn/views/ecosystem-views.tsx", /<h2 className="page-count">Graph <span>\{nodes\.length\} topics<\/span><\/h2>/],
    ["src/components/learn/views/ecosystem-views.tsx", /<h2 ref=\{browseHeading\} tabIndex=\{-1\} className="page-count mr-auto">\{title\} <span>\{items\.length\}<\/span><\/h2>/],
  ]
  for (const [file, title] of counted) assert.match(readSource(file), title, `${file} shows its title with the count`)

  const css = readSource("src/app/globals.css")
  assert.doesNotMatch(css, /h2 \{ ?display: ?none;? ?\}/, "a page title is never display:none; that would hide it from screen readers too")
  assert.match(css, /\.workspace-header:not\(:has\(> :not\(\.sr-only\)\)\) \{ display: contents; \}/, "a header left with only its title draws no box but keeps the title")
})

test("small screens: no lone buttons, short previews or lists, and 36px taps", () => {
  const ecosystem = readSource("src/components/learn/views/ecosystem-views.tsx")
  assert.match(ecosystem, /<h3 className="min-w-0 truncate font-semibold">\{targetNoteTitle\}<\/h3><button onClick=\{[^}]*\} className="editor-primary shrink-0" aria-label="Open notes"/, "Vault opens the note from the note's own title row")
  assert.match(ecosystem, /<h2 className="page-count">Graph [^\n]*?<\/h2><div className="flex min-w-0 flex-1 flex-wrap gap-1 max-sm:order-last max-sm:basis-full">/, "Graph's count, filters and Notes button share one header; phones give the filters their own line")
  assert.match(ecosystem, /<h2 className="sr-only">Feed<\/h2><div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">/, "Feed's topics and Refresh share one row")

  const files = readSource("src/components/learn/views/files-view.tsx")
  assert.doesNotMatch(files, /<header className="workspace-header">/, "Files has no row of its own for Upload")
  assert.match(files, /<div className="flex rounded-md border border-border bg-card p-0\.5 sm:ml-auto"><button type="button" aria-label="List view"/, "the owner keeps the list and grid switch at every width")
  assert.match(files, /workspace-search flex-1 max-sm:order-last max-sm:basis-full/, "on phones the title and actions share a row, and search gets the next one")
  assert.match(files, /layout === "grid" && !detailsOpen \? <div className="grid grid-cols-2 /, "a phone's file grid is two short columns")

  const secondary = readSource("src/components/learn/views/secondary-views.tsx")
  assert.match(secondary, /<div className="settings-save"><ControlButton onClick=\{saveProfile\}/, "Save sits at the end of the profile form")
  assert.doesNotMatch(secondary, /<header className="workspace-header"><h2 className="sr-only">Progress/, "Progress's status line joins the overview")

  const picker = readSource("src/components/learn/views/studio-view.tsx")
  assert.match(picker, /<div className="grid grid-cols-2 gap-3 pb-4 sm:flex sm:gap-4 sm:overflow-x-auto">/, "the editors' project picker is a two-column grid on phones, not a strip that cuts a card off")
  assert.match(picker, /group-hover:opacity-100 \[@media\(pointer:coarse\)\]:opacity-100">\s*<ActionMenu compact label="Actions"/, "touch can reach a project's menu")

  const css = readSource("src/app/globals.css")
  assert.match(css, /\.studio-card-cover \{ aspect-ratio:2 \/ 1;/, "phones get short Studio covers")
  assert.match(css, /\.today-cover-art \{ aspect-ratio: 2 \/ 1; \}/, "phones get short Recent covers")
  assert.match(css, /\.calendar-filter \{ min-height: 36px; \}/, "chips are a 36px tap on phones")
  assert.match(css, /\.workspace-disclosure > summary \{ margin: -12px -14px; padding: 12px 14px; \}/, "a fold-out's whole row is the tap target")
  assert.match(css, /\.settings-save:has\(button:not\(:disabled\)\) \{ position: sticky;/, "unsaved changes keep Save in reach")

  const community = readSource("src/components/learn/views/social-community.module.css")
  assert.match(community, /\.card \{ flex-direction: row;/, "phones list groups, rooms and battles as rows")

  assert.match(css, /\.page-sections button \{ gap:5px; min-height:36px;/, "a page's own tabs are a 36px tap on phones")
  assert.match(css, /\.learning-page \{\s*grid-template-columns: minmax\(0, 1fr\);/, "a sideways chip row cannot widen the page and push its buttons off-screen")
  assert.doesNotMatch(ecosystem, /className="editor-command justify-self-start" aria-label="Open notes"/, "Feed's notes button sits in the toolbar, not alone under the list")

  const calendar = readSource("src/components/learn/views/calendar-view.tsx")
  assert.match(calendar, /className=\{`mb-1 flex h-9 w-full items-center justify-center rounded-lg text-xs transition sm:h-7 sm:w-7 sm:rounded-full/, "a phone's calendar day is a full-width 36px tap")

  assert.match(calendar, /calendar-day min-w-0 border-b border-r border-border\/70 p-0\.5 /, "a 320px screen still gets 36px-wide days")
  // The owner's date bar: « ‹ Sep 28, 2026 › », with the month, the day and the year each a picker.
  assert.match(calendar, /<CalendarDateBar dayKey=\{selectedDayKey\} step=\{mode\} onChange=\{goToDay\} \/>/, "the calendar uses the date bar")
  assert.match(calendar, /onClick=\{\(\) => goToDay\(day\.key\)\}/, "a tap on a day in the grid moves the date bar and the month with it")
  assert.doesNotMatch(calendar, /!hidden !px-1\.5 sm:!inline-flex/, "the year arrows show on phones too")
  const dateBar = readSource("src/components/learn/views/calendar-date-bar.tsx")
  for (const label of ["Previous year", "Next year"]) assert.match(dateBar, new RegExp(`aria-label="${label}"`), `${label} is a double arrow`)
  assert.match(dateBar, /aria-label=\{step === "week" \? "Previous week" : "Previous month"\}/, "the single arrows step a month (a week in the week view)")
  assert.equal(dateBar.match(/<DatePart label=/g)?.length, 3, "the month, the day and the year each open a picker")
  const games = readSource("src/components/learn/views/productivity-views.tsx")
  assert.match(games, /<div className="absolute right-0 top-10 z-40 grid w-48 sm:left-0 sm:right-auto/, "the Games setup menu opens leftward on phones, so it stays on screen")

  for (const file of ["ai-view.tsx", "calendar-view.tsx", "ecosystem-views.tsx", "secondary-views.tsx"]) {
    const source = readSource(`src/components/learn/views/${file}`)
    for (const [, classes] of source.matchAll(/<summary className="([^"]*cursor-pointer[^"]*)"/g)) {
      if (/(^| )h-\d/.test(classes)) continue
      assert.match(classes, /(^| )(-m-|-my-|p-|py-)\d/, `${file}: a fold-out row without a set height grows its tap area (${classes})`)
    }
  }
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
