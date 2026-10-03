/** Local compiled browser recovery cases. Every API read/write is an isolated fixture. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { chromium } from "playwright-core"

const base = process.env.LEARN_QA_BASE_URL || "http://127.0.0.1:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "local fixtures only")
const output = path.resolve(".cache/design-review/ai-result-recovery")
fs.mkdirSync(output, { recursive: true })
const seed = { message: "ORIGINAL_PROMPT", reply: "ORIGINAL_RESULT", sourceScope: "Manual only", activeTaskKey: "answer_explanation", sourceTitle: "Original source", sourceContent: "Original selected words" }
const reports: Array<{ width: number; theme: string; checks: string[]; writes: string[]; errors: string[] }> = []

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const [width, height, theme] of [[1280, 800, "color"], [390, 844, "light"], [320, 700, "dark"]] as const) {
      if (process.env.LEARN_QA_WIDTH && Number(process.env.LEARN_QA_WIDTH) !== width) continue
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })
      await context.addInitScript(theme => localStorage.setItem("theme", theme), theme)
      const report = { width, theme, checks: [] as string[], writes: [] as string[], errors: [] as string[] }
      reports.push(report)
      const check = (condition: unknown, label: string) => { assert.ok(condition, label); report.checks.push(label) }
      const user = { id: "qa_recovery", name: "QA Learner", username: "qa", email: "qa@learn.local", role: "admin", preferences: {}, metrics: { xpTotal: 0, streakCurrent: 0, streakLongest: 0, streakFreezesAvailable: 0 } }
      let responseStatus = "ok"
      let responseText: unknown = "NEW_SUCCESSFUL_RESULT"
      let httpStatus = 200
      let hold = false
      let release: (() => void) | undefined
      let requests = 0
      await context.route("**/api/**", async route => {
        const request = route.request()
        const url = new URL(request.url())
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
        if (request.method() === "GET") {
          if (url.pathname === "/api/auth/session") return json({ user, databaseConfigured: true })
          if (url.pathname === "/api/dashboard") return json({ user, notes: [], goals: [], attempts: [], chats: [], files: [], snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 } })
          if (url.pathname === "/api/ai/providers") return json({ items: [{ id: "qa_provider", provider: "groq", enabled: true, has_key: true, last_status: "untested" }], catalog: [], runtimeItems: [], presets: [] })
          return json({ items: [], notifications: [], unreadCount: 0, connections: [], files: [], groups: [], nodes: [], edges: [], orphanNodes: [] })
        }
        report.writes.push(`${request.method()} ${url.pathname}`)
        if (url.pathname !== "/api/ai/chat") { report.errors.push(`Unexpected write blocked: ${request.method()} ${url.pathname}`); return route.abort() }
        requests++
        const status = responseStatus
        const result = responseText
        const code = httpStatus
        if (hold) await new Promise<void>(resolve => { release = resolve })
        return code === 200 ? json({ status, text: status === "ok" ? result : "SETUP_FIXTURE_REQUIRED" }) : json({ error: "NETWORK_FIXTURE_FAILURE" }, code)
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on("pageerror", error => report.errors.push(error.message))
      const prompt = page.getByRole("textbox", { name: "AI prompt", exact: true })
      const paragraphs = page.locator(".learn-block__paragraph")
      const oldResult = paragraphs.filter({ hasText: "ORIGINAL_RESULT" })
      const freshResult = paragraphs.filter({ hasText: "NEW_SUCCESSFUL_RESULT" })
      const blockStorage = async (blockedKey: string) => page.evaluate(value => {
        const fixtureWindow = window as unknown as { qaBlockedKey?: string; qaStorageInstalled?: boolean }
        fixtureWindow.qaBlockedKey = value
        if (fixtureWindow.qaStorageInstalled) return
        fixtureWindow.qaStorageInstalled = true
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function(key, content) {
          if (key === fixtureWindow.qaBlockedKey) throw new DOMException("QA quota", "QuotaExceededError")
          return original.call(this, key, content)
        }
      }, blockedKey)
      const reset = async () => {
        await blockStorage("")
        responseStatus = "ok"; responseText = "NEW_SUCCESSFUL_RESULT"; httpStatus = 200; hold = false; release = undefined
        await page.goto(`${base}/studio`, { waitUntil: "domcontentloaded" })
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached", timeout: 60000 })
        await page.evaluate(draft => { localStorage.setItem("learn_ai_tutor_draft_v1", JSON.stringify(draft)); localStorage.removeItem("learn_ai_tutor_draft_history_v1"); localStorage.removeItem("learn_ai_tutor_launch_v1") }, seed)
        await page.goto(`${base}/ai`, { waitUntil: "domcontentloaded" })
        await oldResult.waitFor()
      }
      const run = async () => {
        await page.getByRole("button", { name: "Run tutor", exact: true }).click()
        if (hold) {
          for (let attempt = 0; !release && attempt < 100; attempt++) await page.waitForTimeout(40)
          assert.ok(release, "fixture reaches held request")
        }
      }
      const finish = async () => { assert.ok(release); release(); release = undefined; await page.getByRole("button", { name: "Run tutor", exact: true }).waitFor(); await page.waitForTimeout(100) }
      const draftReply = async () => page.evaluate(() => JSON.parse(localStorage.getItem("learn_ai_tutor_draft_v1") || "{}").reply as string)
      const history = async () => page.evaluate(() => JSON.parse(localStorage.getItem("learn_ai_tutor_draft_history_v1") || "[]") as Array<{ message: string; reply: string }>)
      const restore = async () => { await page.getByRole("button", { name: "Draft actions", exact: true }).click(); await page.getByRole("button", { name: "Restore previous AI draft", exact: true }).click() }
      await page.goto(`${base}/studio`, { waitUntil: "domcontentloaded" })
      await reset()
      hold = true
      await run()
      check(await oldResult.isVisible(), "pending request keeps previous result visible")
      check(await page.getByRole("button", { name: "Save as note", exact: true }).isDisabled(), "pending previous result actions disabled")
      check(await page.getByRole("group", { name: "AI result actions", exact: true }).getAttribute("aria-busy") === "true", "pending result actions announced")
      await prompt.fill("NEWER_PROMPT")
      await finish()
      check(await prompt.inputValue() === "NEWER_PROMPT" && await oldResult.isVisible() && await freshResult.count() === 0, "stale result cannot replace previous output or newer prompt")
      check((await history()).length === 0, "stale request creates no history")
      await reset()
      responseStatus = "setup_required"
      await run()
      await page.getByText("SETUP_FIXTURE_REQUIRED", { exact: true }).waitFor()
      check(await oldResult.isVisible() && await prompt.inputValue() === seed.message, "non-ok provider response keeps original draft/result")
      check((await history()).length === 0, "non-ok response creates no history")
      await reset()
      httpStatus = 503
      await run()
      await page.getByText("NETWORK_FIXTURE_FAILURE", { exact: true }).waitFor()
      check(await oldResult.isVisible() && await draftReply() === seed.reply, "network failure keeps displayed and persisted result")
      await reset()
      for (const value of ["", "   ", undefined, 42]) {
        responseText = value
        hold = true
        await run()
        await finish()
        await page.getByRole("status").filter({ hasText: "No usable result came back" }).waitFor()
        check(await oldResult.isVisible() && await freshResult.count() === 0 && await draftReply() === seed.reply && (await history()).length === 0, `invalid success text ${JSON.stringify(value)} preserves result without history`)
        await reset()
      }
      await blockStorage("learn_ai_tutor_draft_v1")
      const before = requests
      await run()
      await page.getByText(/Browser storage is unavailable/).first().waitFor()
      check(requests === before && await oldResult.isVisible(), "known blocked storage prevents provider request")
      await reset()
      for (const key of ["learn_ai_tutor_draft_history_v1", "learn_ai_tutor_draft_v1"]) {
        hold = true
        await run()
        await blockStorage(key)
        await finish()
        await page.getByText(/new result could not be saved/).waitFor()
        check(await oldResult.isVisible() && await freshResult.count() === 0 && await draftReply() === seed.reply, `${key} failure refuses result replacement`)
        await reset()
      }
      await prompt.fill("IMMEDIATE_EDIT_BEFORE_RUN")
      hold = true
      await run()
      await finish()
      await freshResult.waitFor()
      check(await draftReply() === "NEW_SUCCESSFUL_RESULT", "successful result persisted before display")
      check((await history()).some(draft => draft.message === "IMMEDIATE_EDIT_BEFORE_RUN" && draft.reply === seed.reply), "success archives exact outgoing prompt/result")
      await page.reload({ waitUntil: "domcontentloaded" })
      await freshResult.waitFor()
      check(await prompt.inputValue() === "IMMEDIATE_EDIT_BEFORE_RUN", "successful replacement survives reload with prompt")
      await restore()
      await oldResult.waitFor()
      check(await prompt.inputValue() === "IMMEDIATE_EDIT_BEFORE_RUN", "previous restores immediate edit and prior reply")
      check((await history()).some(draft => draft.reply === "NEW_SUCCESSFUL_RESULT"), "restoring previous also preserves new result")
      await reset()
      hold = true
      await run()
      await page.evaluate(() => { window.history.pushState({}, "", "/studio"); dispatchEvent(new PopStateEvent("popstate")) })
      await prompt.waitFor({ state: "hidden" })
      assert.ok(release); release(); release = undefined
      await page.waitForTimeout(200)
      check(new URL(page.url()).pathname === "/studio" && await draftReply() === seed.reply && (await history()).length === 0, "unmounted reply creates no storage/history/navigation side effects")
      check(report.errors.length === 0, `no page errors/unexpected writes: ${report.errors.join(", ")}`)
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "recovery flow fits viewport")
      await context.close()
      console.log(`${width}/${theme}: ${report.checks.length} checks passed`)
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(reports, null, 2) + "\n")
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
