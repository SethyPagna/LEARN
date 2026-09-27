/**
 * Visual tour of a LOCAL LEARN: signs in with the starter admin account, opens
 * every page at desktop and phone size, clicks through each page's tabs, and
 * saves a screenshot and layout numbers for every view. Saved projects of each
 * kind are opened too, once as loaded and once with something selected.
 *
 *   pnpm test:tour                 finds LEARN on ports 3000-3009 (run.bat first)
 *   AUDIT_BASE_URL=http://localhost:3001 pnpm test:tour
 *   TOUR_ONLY=studio,chat pnpm test:tour      a few pages only
 *
 * Output: output/visual-tour/<size>/<page>[--<tab>].png and report.json.
 * Exit code 1 on page crashes, server errors, sideways scrolling or a page that
 * never renders; 2 when no local LEARN answers.
 */
import fs from "node:fs"
import path from "node:path"
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright-core"
import { starterAccounts } from "../../../src/lib/starter-accounts"

const sizes = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
} as const
type SizeName = keyof typeof sizes

const publicRoutes = ["/", "/login", "/showcase"]
const appRoutes = [
  "/dashboard", "/learn", "/studio", "/canvas", "/notes", "/docs", "/sheets", "/slides", "/files",
  "/ai", "/calendar", "/vault", "/progress", "/graph", "/feed", "/discover", "/practice", "/quizzes",
  "/live", "/games", "/reviews", "/social", "/chat", "/spaces", "/groups", "/rooms", "/battles",
  "/profile", "/settings", "/admin",
]
// Projects open inside their page (/canvas?design=…, /docs?item=docs:…), so
// each kind's list API supplies what to open. `select` is clicked afterwards
// to show the tools that appear for a selection.
const projectViews = [
  { from: "/canvas", list: "/api/canvas?view=summary", limit: 3, href: (id: string) => `/canvas?design=${encodeURIComponent(id)}`, select: "[data-design-element]", clicks: 1 },
  { from: "/docs", list: "/api/docs", limit: 2, href: (id: string) => `/docs?item=${encodeURIComponent(`docs:${id}`)}`, select: ".ProseMirror p", clicks: 3 },
  { from: "/slides", list: "/api/slides", limit: 1, href: (id: string) => `/slides?item=${encodeURIComponent(`slides:${id}`)}`, select: "[data-design-element], .ProseMirror p, [contenteditable=true]", clicks: 1 },
  { from: "/sheets", list: "/api/sheets", limit: 1, href: (id: string) => `/sheets?item=${encodeURIComponent(`sheets:${id}`)}`, select: "[role=gridcell], td", clicks: 1 },
  { from: "/notes", list: "/api/notes", limit: 1, href: (id: string) => `/notes/${encodeURIComponent(id)}`, select: "", clicks: 0 },
  { from: "/quizzes", list: "/api/quizzes", limit: 1, href: (id: string) => `/quiz/${encodeURIComponent(id)}`, select: "", clicks: 0 },
]
const maxTabsPerPage = 6

interface ViewMetrics {
  title: string
  words: number
  wordsAboveFold: number
  longTexts: number
  smallTexts: number
  headings: number
  controls: number
  unnamedControls: number
  icons: number
  images: number
  screens: number
  overflowX: boolean
}

interface ViewReport {
  size: SizeName
  route: string
  tab?: string
  file: string
  status: number | null
  ms: number
  metrics?: ViewMetrics
  errors: string[]
}

const outDir = path.resolve(process.env.TOUR_OUT || "output/visual-tour")
const only = (process.env.TOUR_ONLY || "").split(",").map((entry) => entry.trim().replace(/^\/?/, "/")).filter((entry) => entry !== "/")

function slug(value: string) {
  return value.replace(/^\//, "").replace(/\[|\]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "home"
}

async function isLearn(base: string) {
  try {
    const response = await fetch(`${base}/login`, { signal: AbortSignal.timeout(60_000) })
    return /<title>[^<]*LEARN/.test(await response.text())
  } catch {
    return false
  }
}

async function findLearn() {
  if (process.env.AUDIT_BASE_URL) {
    const base = process.env.AUDIT_BASE_URL.replace(/\/$/, "")
    return (await isLearn(base)) ? base : null
  }
  const first = Number(process.env.PORT || 3000)
  for (let port = first; port < first + 10; port++) {
    if (await isLearn(`http://localhost:${port}`)) return `http://localhost:${port}`
  }
  return null
}

async function launchBrowser(): Promise<Browser> {
  const attempts: Array<Parameters<typeof chromium.launch>[0]> = [
    { channel: "chrome" },
    { channel: "msedge" },
    {},
  ]
  let lastError: unknown
  for (const options of attempts) {
    try {
      return await chromium.launch({ ...options, headless: true })
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

/** Waits until the page stops loading data and its layout settles. */
async function settle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined)
  await page.waitForFunction(
    () => !/\bLoading\b/i.test(document.querySelector("main")?.innerText.slice(0, 400) || ""),
    undefined,
    { timeout: 15_000 },
  ).catch(() => undefined)
  await page.waitForTimeout(600)
}

function measure(page: Page): Promise<ViewMetrics> {
  return page.evaluate(() => {
    const visible = (element: Element) => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    const main = document.querySelector("main") || document.body
    const word = new RegExp("[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*", "gu")
    const countWords = (text: string) => (text.match(word) || []).length
    const controls = [...main.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=switch]")].filter(visible)
    const unnamedControls = controls.filter((element) =>
      !(element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || element.getAttribute("title") || element.textContent?.trim() || (element as HTMLInputElement).labels?.length || element.getAttribute("placeholder")))
    let wordsAboveFold = 0
    let longTexts = 0
    let smallTexts = 0
    const counted = new Set<Element>()
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode
      const parent = node.parentElement
      if (!parent || counted.has(parent) || !node.textContent?.trim() || !visible(parent)) continue
      counted.add(parent)
      const own = [...parent.childNodes].filter((child) => child.nodeType === Node.TEXT_NODE).map((child) => child.textContent).join(" ").trim()
      const rect = parent.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      if (rect.top < innerHeight && rect.bottom > 0) wordsAboveFold += countWords(own)
      if (own.length > 90) longTexts++
      if (parseFloat(getComputedStyle(parent).fontSize) < 12) smallTexts++
    }
    const scroller = document.scrollingElement || document.documentElement
    return {
      title: document.title,
      words: countWords((main as HTMLElement).innerText || ""),
      wordsAboveFold,
      longTexts,
      smallTexts,
      headings: main.querySelectorAll("h1, h2, h3").length,
      controls: controls.length,
      unnamedControls: unnamedControls.length,
      icons: [...main.querySelectorAll("svg")].filter(visible).length,
      images: [...main.querySelectorAll("img, canvas, video")].filter(visible).length,
      screens: Math.round((scroller.scrollHeight / innerHeight) * 10) / 10,
      overflowX: scroller.scrollWidth > innerWidth + 1,
    }
  })
}

async function capture(page: Page, report: ViewReport[], entry: Omit<ViewReport, "file" | "metrics" | "errors" | "ms" | "status">, status: number | null, started: number, errors: string[]) {
  const file = path.join(entry.size, `${slug(entry.route)}${entry.tab ? `--${slug(entry.tab)}` : ""}.png`)
  await page.screenshot({ path: path.join(outDir, file), animations: "disabled" })
  const metrics = await measure(page).catch(() => undefined)
  report.push({ ...entry, file, status, ms: Date.now() - started, metrics, errors: [...errors] })
  errors.length = 0
}

/**
 * The middle of the part of an element a person can see, or null when none of
 * it shows. Clicking there mimics a real click: Playwright's own click scrolls
 * the element into view first, which moves clipped canvases no user can scroll.
 */
function visibleCenter(target: Locator) {
  return target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    let left = Math.max(box.left, 0), top = Math.max(box.top, 0), right = Math.min(box.right, innerWidth), bottom = Math.min(box.bottom, innerHeight)
    for (let node = element.parentElement; node; node = node.parentElement) {
      if (getComputedStyle(node).overflow === "visible") continue
      const clip = node.getBoundingClientRect()
      left = Math.max(left, clip.left); top = Math.max(top, clip.top); right = Math.min(right, clip.right); bottom = Math.min(bottom, clip.bottom)
    }
    return right - left > 2 && bottom - top > 2 ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  }).catch(() => null)
}

async function visit(page: Page, base: string, route: string, size: SizeName, report: ViewReport[], errors: string[], label = route, selection?: { select: string; clicks: number }) {
  const started = Date.now()
  let status: number | null = null
  try {
    const response = await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 90_000 })
    status = response?.status() ?? null
    await page.locator("main").first().waitFor({ timeout: 60_000 })
    await settle(page)
  } catch (error) {
    errors.push(`render: ${(error as Error).message.split("\n")[0]}`)
  }
  await capture(page, report, { size, route: label }, status, started, errors)

  if (selection?.select) {
    const target = page.locator(selection.select).filter({ visible: true }).first()
    if (await target.count().catch(() => 0)) {
      const selectStarted = Date.now()
      try {
        const point = await visibleCenter(target)
        if (point) await page.mouse.click(point.x, point.y, { clickCount: selection.clicks })
        else await target.click({ clickCount: selection.clicks, timeout: 10_000 })
        await page.waitForTimeout(700)
      } catch (error) {
        errors.push(`select: ${(error as Error).message.split("\n")[0]}`)
      }
      await capture(page, report, { size, route: label, tab: "selected" }, status, selectStarted, errors)
      await page.keyboard.press("Escape").catch(() => undefined)
    }
  }

  // Tabs come before their panels, so clicking one never shifts the others.
  const tabs = page.locator("main [role=tab]")
  const pending: Array<{ index: number; name: string }> = []
  const count = await tabs.count().catch(() => 0)
  for (let index = 0; index < count && pending.length < maxTabsPerPage; index++) {
    const tab = tabs.nth(index)
    if (!(await tab.isVisible().catch(() => false)) || (await tab.getAttribute("aria-selected")) === "true") continue
    const name = (await tab.getAttribute("aria-label")) || (await tab.innerText()).split("\n")[0].trim() || `tab ${index + 1}`
    pending.push({ index, name: name.slice(0, 40) })
  }
  for (const { index, name } of pending) {
    const tabStarted = Date.now()
    try {
      await tabs.nth(index).click({ timeout: 10_000 })
      await settle(page)
    } catch (error) {
      errors.push(`tab ${name}: ${(error as Error).message.split("\n")[0]}`)
    }
    await capture(page, report, { size, route: label, tab: name }, status, tabStarted, errors)
  }
}

async function tour(browser: Browser, base: string, size: SizeName, signedIn: boolean, routes: string[], report: ViewReport[]) {
  const context: BrowserContext = await browser.newContext({ viewport: sizes[size], serviceWorkers: "block", reducedMotion: "reduce" })
  const page = await context.newPage()
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(`page error: ${error.message.split("\n")[0]}`))
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text().split("\n")[0].slice(0, 200)}`)
  })
  page.on("response", (response) => {
    if (response.status() >= 500) errors.push(`HTTP ${response.status()}: ${response.url().replace(base, "")}`)
  })
  if (signedIn) {
    const admin = starterAccounts[0]
    const login = await context.request.post(`${base}/api/auth/login`, { data: { identifier: admin.username, password: admin.password } })
    if (!login.ok()) throw new Error(`Signing in with the starter admin account failed (HTTP ${login.status()}). Was the local database reset or the password changed?`)
  }
  fs.mkdirSync(path.join(outDir, size), { recursive: true })
  for (const route of routes) {
    process.stdout.write(`  ${size.padEnd(7)} ${route}\n`)
    await visit(page, base, route, size, report, errors)
  }
  if (signedIn) {
    for (const view of projectViews) {
      if (only.length && !only.includes(view.from)) continue
      const response = await context.request.get(`${base}${view.list}`).catch(() => null)
      const items = response?.ok() ? ((await response.json()) as { items?: Array<{ id: string; title?: string }> }).items || [] : []
      for (const item of items.slice(0, view.limit)) {
        const label = `${view.from} › ${(item.title || item.id).slice(0, 40)}`
        process.stdout.write(`  ${size.padEnd(7)} ${label}\n`)
        await visit(page, base, view.href(item.id), size, report, errors, label, view)
      }
    }
  }
  await context.close()
}

function flag(view: ViewReport) {
  const problems: string[] = []
  if (view.status !== null && view.status >= 500) problems.push(`HTTP ${view.status}`)
  if (view.errors.some((error) => error.startsWith("page error") || error.startsWith("render") || error.startsWith("HTTP 5"))) problems.push(...view.errors.filter((error) => !error.startsWith("console")))
  if (view.metrics?.overflowX) problems.push("scrolls sideways")
  return problems
}

async function main() {
  const base = await findLearn()
  if (!base) {
    console.error("  No local LEARN answers. Start it with run.bat, then run this again (or set AUDIT_BASE_URL).")
    process.exit(2)
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(base).hostname)) {
    console.error("  The visual tour signs in with the starter account, so it only runs against a local LEARN.")
    process.exit(2)
  }
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.mkdirSync(outDir, { recursive: true })
  console.log(`  Visual tour of ${base} -> ${path.relative(process.cwd(), outDir)}`)

  const pick = (routes: string[]) => (only.length ? routes.filter((route) => only.includes(route)) : routes)
  const browser = await launchBrowser()
  const report: ViewReport[] = []
  try {
    for (const size of Object.keys(sizes) as SizeName[]) {
      await tour(browser, base, size, false, pick(publicRoutes), report)
      await tour(browser, base, size, true, pick(appRoutes), report)
    }
  } finally {
    await browser.close()
  }

  fs.writeFileSync(path.join(outDir, "report.json"), `${JSON.stringify({ base, createdAt: new Date().toISOString(), sizes, views: report }, null, 2)}\n`)
  const failures = report.map((view) => ({ view, problems: flag(view) })).filter((entry) => entry.problems.length)
  const desktop = report.filter((view) => view.size === "desktop" && view.metrics)
  const wordiest = [...desktop].sort((a, b) => (b.metrics?.wordsAboveFold || 0) - (a.metrics?.wordsAboveFold || 0)).slice(0, 8)
  console.log(`\n  ${report.length} views. Most words on the first screen (desktop):`)
  for (const view of wordiest) console.log(`    ${String(view.metrics?.wordsAboveFold).padStart(4)}  ${view.route}${view.tab ? ` > ${view.tab}` : ""}`)
  if (failures.length) {
    console.log(`\n  ${failures.length} views with problems:`)
    for (const { view, problems } of failures) console.log(`    ${view.size} ${view.route}${view.tab ? ` > ${view.tab}` : ""}: ${problems.join("; ")}`)
    process.exit(1)
  }
  console.log("\n  No crashes, server errors or sideways scrolling.")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
