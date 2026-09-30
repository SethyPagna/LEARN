/** Safe signed-in UI QA: all mutation requests are mocked or aborted. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium, type Page } from "playwright-core"
import type { User } from "../../../src/components/learn/types"

const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
const storageState = process.env.LEARN_QA_STORAGE_STATE
assert.ok(storageState, "Set LEARN_QA_STORAGE_STATE to private auth state; it must never be committed.")
const output = process.env.LEARN_QA_OUTPUT || path.resolve(".cache/design-review/takeover")
fs.mkdirSync(output, { recursive: true })
const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
const sharp = requireFromNext("sharp") as (input: Buffer) => { resize(options: { width: number; withoutEnlargement: boolean }): { jpeg(options: { quality: number }): { toFile(file: string): Promise<unknown> } } }
const routes = ["/dashboard", "/studio", "/calendar", "/progress", "/reviews", "/vault", "/files", "/practice", "/quizzes", "/live", "/games", "/ai", "/graph", "/social", "/chat", "/groups", "/rooms", "/battles", "/feed", "/profile", "/settings", "/admin"]
const reports: { width: number; mode: string; routes: number; interactions: number; writes: string[]; errors: string[] }[] = []

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const [width, height, mode] of [[1280, 800, "color"], [390, 844, "light"], [320, 700, "dark"]] as const) {
      if (process.env.LEARN_QA_WIDTH && width !== Number(process.env.LEARN_QA_WIDTH)) continue
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block", storageState })
      await context.addCookies([{ name: "learn_sidebar", value: "expanded", url: base }])
      await context.addInitScript(mode => localStorage.setItem("theme", mode), mode)
      const session = await (await context.request.get(`${base}/api/auth/session`)).json() as { user: User }
      let savedUser = session.user
      let failProfileSave = false
      const report = { width, mode, routes: 0, interactions: 0, writes: [] as string[], errors: [] as string[] }
      reports.push(report)
      const check = (condition: unknown, message: string) => { assert.ok(condition, message); report.interactions++ }
      await context.route("**/api/**", async route => {
        const request = route.request()
        const url = new URL(request.url())
        if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue()
        report.writes.push(`${request.method()} ${url.pathname}`)
        if (url.pathname === "/api/profile" && request.method() === "PUT") {
          if (failProfileSave) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "QA save failed" }) })
          const body = request.postDataJSON() as Partial<User> & { profileVisibility: User["profileVisibility"] }
          savedUser = { ...savedUser, ...body, preferences: { ...savedUser.preferences, ...body.preferences } }
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: savedUser }) })
        }
        return route.abort()
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      page.on("pageerror", error => report.errors.push(error.message))
      const open = async (route: string) => {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" })
        await page.locator(".learn-app").waitFor({ timeout: 60000 })
        await page.locator('.account-profile-link').first().waitFor({ state: "visible" })
        await page.locator('.account-controls[aria-busy="false"]').waitFor()
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
      }
      async function fit(label: string) {
        const dimensions = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, main: document.querySelector("main")?.getBoundingClientRect().right ?? 0 }))
        check(dimensions.document <= dimensions.width + 1, `${label}: document overflow ${JSON.stringify(dimensions)}`)
        check(dimensions.main <= dimensions.width + 1, `${label}: main outside viewport`)
      }
      for (const route of routes) {
        await open(route)
        await fit(route)
        report.routes++
      }
      await open("/settings?section=experience")
      const current = page.url()
      if (width >= 1024) {
        await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
        check(await page.locator('.learn-app[data-sidebar="rail"]').count() === 1, "brand collapses sidebar")
        await page.getByRole("button", { name: "Expand sidebar", exact: true }).click()
        check(page.url() === current, "brand expansion preserves URL and page")
        check(await page.locator('.learn-app[data-sidebar="expanded"]').count() === 1, "brand expands sidebar")
        check(await page.locator('.sidebar-pages button').count() >= 2, "expanded sidebar keeps active section pages")
        const order = await page.locator("#sidebar-account .account-controls").evaluate(node => Array.from(node.children).map(child => child.className))
        check(order[0].includes("account-profile") && order[1].includes("account-appearance"), "profile appears before appearance and notifications")
        await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click()
        const boxes = await page.locator("#sidebar-account .account-controls").evaluate(node => Array.from(node.querySelectorAll<HTMLElement>("button,select")).filter(item => item.getBoundingClientRect().width).map(item => ({ name: item.getAttribute("aria-label"), left: item.getBoundingClientRect().left, right: item.getBoundingClientRect().right })))
        check(boxes.every(box => box.left >= 0 && box.right <= 64), "rail account controls stay within64px")
      }
      const options = page.getByRole("button", { name: "Account options", exact: true })
      if (width >= 1024) { await options.focus(); await page.keyboard.press("Enter") }
      else { await options.click() }
      const popup = page.getByRole("dialog", { name: "Account and preferences", exact: true })
      try { await popup.waitFor() } catch (error) {
        console.log(JSON.stringify({ optionsExpanded: await options.getAttribute("aria-expanded"), popups: await page.locator('[role="dialog"]').evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute("aria-label"), style: node.getAttribute("style") }))) }))
        throw error
      }
      const box = await popup.boundingBox()
      check(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1, "account popup fits viewport")
      await page.waitForFunction(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label") === "Account and preferences")
      report.interactions++
      await page.keyboard.press("Escape")
      check(await popup.count() === 0, "Escape closes options")
      check(await options.evaluate(node => node === document.activeElement), "Escape returns focus to options")
      await page.getByRole("button", { name: "Your profile", exact: true }).click()
      await page.getByRole("region", { name: "Your profile", exact: true }).waitFor()
      check(new URL(page.url()).pathname === "/profile", "footer profile opens Me")
      const profile = page.getByRole("region", { name: "Your profile", exact: true })
      await profile.getByRole("button", { name: "Edit profile", exact: true }).click()
      const form = profile.locator("form")
      await form.getByLabel("Name", { exact: true }).fill("")
      check(await form.getByRole("button", { name: "Save", exact: true }).isDisabled(), "empty name cannot save")
      await form.getByLabel("Name", { exact: true }).fill("QA profile preview")
      await form.getByLabel("About", { exact: true }).fill("Local browser preview")
      await profile.getByRole("button", { name: /^Profile visibility:/ }).click()
      check(await form.getByLabel("Name", { exact: true }).inputValue() === "QA profile preview", "visibility badge preserves unsaved edits")
      await form.getByRole("combobox", { name: /^Visibility/ }).selectOption("connections")
      failProfileSave = true
      await form.getByRole("button", { name: "Save", exact: true }).click()
      await profile.getByRole("status").filter({ hasText: "QA save failed" }).waitFor()
      check(await form.getByLabel("Name", { exact: true }).inputValue() === "QA profile preview", "failed save retains edits")
      failProfileSave = false
      await form.getByRole("button", { name: "Save", exact: true }).click()
      await profile.getByRole("status").filter({ hasText: "Profile saved" }).waitFor()
      check(await profile.getByRole("heading", { name: "QA profile preview", exact: true }).count() === 1, "successful profile save updates identity")
      await page.getByRole("button", { name: "Account options", exact: true }).click()
      check(await page.getByRole("dialog", { name: "Account and preferences" }).getByText("QA profile preview", { exact: true }).count() === 1, "saved identity updates account immediately")
      await page.keyboard.press("Escape")
      for (const name of ["Shared", "Badges", "Overview"]) { await profile.getByRole("navigation", { name: "Profile sections" }).getByRole("button", { name: new RegExp(`^${name}`) }).click(); await fit(`Profile${name}`) }
      if (width === 1280) {
        await profile.getByRole("button", { name: "Edit profile", exact: true }).click()
        const photo = form.locator('input[type="file"]')
        await photo.setInputFiles({ name: "invalid.txt", mimeType: "text/plain", buffer: Buffer.from("QA") })
        await profile.getByRole("status").filter({ hasText: "Choose an image file" }).waitFor()
        check(true, "non-image avatars are rejected")
        await photo.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(256 * 1024 + 1) })
        await profile.getByRole("status").filter({ hasText: "under 256 KB" }).waitFor()
        check(true, "oversized avatars are rejected")
        await photo.setInputFiles({ name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64") })
        await form.locator('img[src^="data:image/png"]').waitFor()
        check(true, "valid avatar previews locally")
        const links = form.locator("details")
        await links.locator("summary").click()
        await form.getByLabel("Website", { exact: true }).fill("not-a-url")
        await links.locator("summary").click()
        const writesBefore = report.writes.length
        await form.getByRole("button", { name: "Save", exact: true }).click()
        check(await links.getAttribute("open") !== null && report.writes.length === writesBefore, "invalid hidden link opens its field without a save request")
        await form.getByRole("button", { name: "Cancel", exact: true }).click()
        check(await form.count() === 0 && await profile.locator('header img[src^="data:"]').count() === 0, "cancel discards avatar and link edits")
      }
      await sharp(await page.screenshot()).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(output, `profile-${width}-${mode}.jpg`))
      check(report.errors.length === 0, `no uncaught page errors: ${report.errors.join(";")}`)
      console.log(JSON.stringify(report))
      await context.close()
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(output, "takeover-ui-results.json"), JSON.stringify(reports, null, 2))
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
