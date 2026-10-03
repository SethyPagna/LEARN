/** Compiled local navigation; every API response is an isolated fixture. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const base = process.env.LEARN_QA_BASE_URL || "http://127.0.0.1:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "local preview only")
const output = path.resolve(".cache/design-review/navigation-polish")
fs.mkdirSync(output, { recursive: true })
const reports: Array<{ width: number; theme: string; mode: string; checks: string[]; errors: string[]; writes: string[] }> = []
const user = { id: "qa_navigation", name: "QA Learner", username: "qa", email: "qa@learn.local", role: "admin", preferences: {}, metrics: { xpTotal: 0, streakCurrent: 0, streakLongest: 0, streakFreezesAvailable: 0 } }

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const [width, height, theme] of [[1280, 800, "color"], [390, 844, "light"], [320, 700, "dark"], [740, 320, "dark"]] as const) {
      if (process.env.LEARN_QA_WIDTH && Number(process.env.LEARN_QA_WIDTH) !== width) continue
      for (const mode of width === 1280 ? ["expanded", "rail", "hidden"] : ["expanded"]) {
        const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })
        await context.routeWebSocket("**/api/realtime/**", () => {})
        await context.addCookies([{ name: "learn_sidebar", value: mode, url: base }])
        await context.addInitScript(value => localStorage.setItem("theme", value), theme)
        const report = { width, theme, mode, checks: [] as string[], errors: [] as string[], writes: [] as string[] }
        reports.push(report)
        const check = (condition: unknown, label: string) => { assert.ok(condition, label); report.checks.push(label) }
        await context.route("**/api/**", route => {
          const request = route.request()
          const url = new URL(request.url())
          if (request.method() !== "GET") { report.writes.push(`${request.method()} ${url.pathname}`); return route.abort() }
          const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
          if (url.pathname === "/api/auth/session") return json({ user, databaseConfigured: true })
          if (url.pathname === "/api/dashboard") return json({ user, notes: [], goals: [], attempts: [], chats: [], files: [], snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 } })
          if (url.pathname === "/api/calendar/connected-events") return json({ results: [], checkedAt: new Date().toISOString() })
          if (url.pathname === "/api/calendar/connections") return json({ providers: [], connections: [] })
          return json({ items: [], notifications: [], unreadCount: 0, connections: [], files: [], groups: [], nodes: [], edges: [], orphanNodes: [], user })
        })
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        page.on("pageerror", error => report.errors.push(error.message))
        page.on("console", entry => { if (entry.type() === "error") report.errors.push(entry.text()) })
        await page.goto(`${base}/profile`, { waitUntil: "domcontentloaded" })
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached", timeout: 60000 })
        const account = page.getByRole("button", { name: "Your account", exact: true }).filter({ visible: true })
        const help = page.getByRole("button", { name: "What's where?", exact: true }).filter({ visible: true })
        const guide = page.getByRole("dialog", { name: "What's where", exact: true })
        check(await account.count() === 1, "one visible account trigger")
        check(await help.count() === 0, "no duplicated navigation Help outside account")
        await account.focus()
        await page.keyboard.press("Enter")
        const panel = page.getByRole("dialog", { name: "Account and preferences", exact: true })
        await panel.waitFor()
        check(await help.count() === 1, "one account-menu guide entry")
        await help.focus()
        await page.keyboard.press("Enter")
        await guide.waitFor()
        check(await guide.evaluate(element => element.contains(document.activeElement)), "guide receives keyboard focus")
        check(await panel.count() === 0, "guide replaces account popover")
        await page.keyboard.press("ArrowDown")
        check(await guide.evaluate(element => element.contains(document.activeElement)), "guide arrow navigation retains focus")
        await page.evaluate(() => dispatchEvent(new Event("learn:place-guide")))
        await page.keyboard.press("Escape")
        await guide.waitFor({ state: "detached" })
        check(true, "guide closes with Escape")
        check(await account.evaluate(element => element === document.activeElement), "guide returns focus to account trigger")
        await account.click()
        await help.click()
        await guide.waitFor()
        await guide.getByRole("button", { name: "Close the guide", exact: true }).click()
        await guide.waitFor({ state: "detached" })
        check(await account.evaluate(element => element === document.activeElement), "guide close button also restores focus")
        if (width === 1280 && mode === "expanded") {
          const links = page.getByRole("list", { name: "Me pages", exact: true })
          check(await links.isVisible() && await links.getByRole("button").count() === 3, "expanded Me footer retains section links")
          await links.getByRole("button", { name: "Settings", exact: true }).click()
          await page.locator('.learn-app[data-view="settings"]').waitFor()
          const route = page.url()
          await page.getByRole("button", { name: "Collapse sidebar to icons", exact: true }).click()
          await page.locator('.learn-app[data-sidebar="rail"]').waitFor()
          check(await page.getByRole("list", { name: "Me pages", exact: true }).count() === 0, "rail omits extra footer")
          await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
          await page.locator('.learn-app[data-sidebar="expanded"]').waitFor()
          check(page.url() === route && await page.locator('.learn-app[data-view="settings"]').count() === 1, "brand expansion preserves current page")
          check(await page.getByRole("list", { name: "Me pages", exact: true }).isVisible(), "expansion restores Me links")
        }
        await account.click()
        await help.click()
        await guide.waitFor()
        await guide.locator('a[href="/calendar"]').click()
        await page.waitForTimeout(200)
        await page.locator('.learn-app[data-view="calendar"]').waitFor()
        check(await guide.count() === 0 && new URL(page.url()).pathname === "/calendar", "guide opens the chosen page")
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "navigation fits viewport")
        check(report.errors.length === 0 && report.writes.length === 0, "no page errors or API writes")
        await context.close()
        console.log(`${width}/${theme}/${mode}: ${report.checks.length} checks passed`)
      }
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(reports, null, 2) + "\n")
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
