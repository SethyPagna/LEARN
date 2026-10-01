/** Compiled local UI. All API traffic is intercepted; no data/provider writes escape. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium, type Locator } from "playwright-core"

const base = process.env.LEARN_QA_BASE_URL || "http://127.0.0.1:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "local QA only")
const output = path.resolve(".cache/design-review/ai-workspace")
fs.mkdirSync(output, { recursive: true })
const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
const sharp = requireFromNext("sharp")
const initialDraft = {
  message: "KEEP_MY_EDITED_PROMPT", reply: "KEEP_MY_ORIGINAL_RESULT", sourceTitle: "My source", sourceContent: "Only my selected words", sourceScope: "Active Studio item",
  difficulty: "Exam prep", tone: "Socratic", language: "Khmer", outputLength: "Balanced", providerFamily: "auto", insertTarget: "ai-note", activeTaskKey: "answer_explanation",
  targetAudience: "My class", requiredOutput: "Use simple examples", updatedAt: "2026-10-01T00:00:00Z",
}
const reports: Array<{ width: number; mode: string; checks: string[]; writes: string[]; errors: string[] }> = []

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const [width, height] of [[1280, 800], [390, 844], [320, 700]] as const) {
      if (process.env.LEARN_QA_WIDTH && Number(process.env.LEARN_QA_WIDTH) !== width) continue
      for (const mode of ["color", "light", "dark"]) {
        if (process.env.LEARN_QA_MODE && process.env.LEARN_QA_MODE !== mode) continue
        const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })
        const report = { width, mode, checks: [] as string[], writes: [] as string[], errors: [] as string[] }
        reports.push(report)
        const check = (condition: unknown, label: string) => { assert.ok(condition, label); report.checks.push(label) }
        await context.addInitScript(({ mode, draft }) => {
          localStorage.setItem("theme", mode)
          if (!sessionStorage.getItem("qa_ai_seeded")) {
            localStorage.setItem("learn_ai_tutor_draft_v1", JSON.stringify(draft))
            sessionStorage.setItem("qa_ai_seeded", "true")
          }
        }, { mode, draft: initialDraft })
        await context.addCookies([{ name: "learn_sidebar", value: "expanded", url: base }])
        const user = { id: "qa_ai", name: "QA Learner", username: "qa", email: "qa@learn.local", role: "admin", profileVisibility: "private", preferences: {}, metrics: { xpTotal: 0, streakCurrent: 0, streakLongest: 0, streakFreezesAvailable: 0 } }
        let heldChat = false
        let releaseChat: (() => void) | undefined
        let chatBody: Record<string, unknown> | null = null
        await context.route("**/api/**", async route => {
          const request = route.request()
          const url = new URL(request.url())
          const json = (body: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify(body) })
          if (request.method() === "GET") {
            if (url.pathname === "/api/auth/session") return json({ user, databaseConfigured: true })
            if (url.pathname === "/api/dashboard") return json({ user, notes: [], goals: [], attempts: [], chats: [], files: [], snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 } })
            if (url.pathname === "/api/ai/providers") return json({ items: [{ id: "qa_provider", provider: "groq", enabled: true, has_key: true, last_status: "untested" }], runtimeItems: [], catalog: [{ id: "groq", provider: "groq", label: "Groq" }], presets: [] })
            return json({ items: [], files: [], connections: [], notifications: [], groups: [], nodes: [], edges: [], orphanNodes: [], unreadCount: 0 })
          }
          report.writes.push(`${request.method()} ${url.pathname}`)
          if (url.pathname === "/api/ai/chat") {
            chatBody = request.postDataJSON() as Record<string, unknown>
            if (heldChat) await new Promise<void>(resolve => { releaseChat = resolve })
            return json({ status: "ok", text: "FRESH_FIXTURE_RESULT" })
          }
          report.errors.push(`Unexpected mutation blocked: ${request.method()} ${url.pathname}`)
          return route.abort()
        })
        const page = await context.newPage()
        page.setDefaultTimeout(15000)
        page.on("pageerror", error => report.errors.push(error.message))
        const prompt = page.getByRole("textbox", { name: "AI prompt", exact: true })
        const open = async () => {
          await page.goto(`${base}/ai`, { waitUntil: "domcontentloaded" })
          await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached", timeout: 60000 })
          await prompt.waitFor()
        }
        const withinViewport = async (locator: Locator, label: string) => {
          await page.waitForTimeout(75)
          check(await locator.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && rect.top >= 0 && rect.bottom <= innerHeight + 1 }), `${label} bounded at ${width}px`)
        }
        const screenshot = async (name: string) => sharp(await page.screenshot()).resize({ width: Math.min(width, 720), withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(output, `${name}-${width}-${mode}.jpg`))
        const openDraft = async () => {
          await page.getByRole("button", { name: "Draft actions", exact: true }).click()
          const menu = page.getByRole("dialog", { name: "Draft actions", exact: true })
          await menu.waitFor()
          return menu
        }
        const chooseTask = async (label: string) => {
          await page.getByRole("button", { name: /^Task:/ }).click()
          const menu = page.getByRole("dialog", { name: /^Task:/ })
          await menu.getByRole("button", { name: label, exact: true }).click()
        }
        const blockStorage = async (key: string) => page.evaluate(blockedKey => {
          const fixtureWindow = window as unknown as { qaBlockedDraftKey?: string; qaStorageHooked?: boolean }
          fixtureWindow.qaBlockedDraftKey = blockedKey
          if (fixtureWindow.qaStorageHooked) return
          fixtureWindow.qaStorageHooked = true
          const original = Storage.prototype.setItem
          Storage.prototype.setItem = function(key, value) {
            if (key === fixtureWindow.qaBlockedDraftKey) throw new DOMException("QA storage refused", "QuotaExceededError")
            return original.call(this, key, value)
          }
        }, key)
        await open()
        check(await prompt.inputValue() === initialDraft.message, "current draft hydrated")
        check(await page.getByRole("button", { name: "Save as note", exact: true }).isVisible(), "current reply hydrated")
        check(await page.getByRole("button", { name: "Filters", exact: true }).count() === 0 && await page.locator('.ai-workspace').getByRole("button", { name: "Gateway", exact: true }).count() === 0, "advanced controls have one entry")
        check(await page.getByRole("button", { name: "Reset draft", exact: true }).count() === 0, "draft commands collapsed")
        check((await page.getByRole("button", { name: /^Task:/ }).innerText()).includes("Task"), "task picker has a visible section label")
        if (width < 640) {
          const rectangles = await Promise.all([page.getByRole("button", { name: /^Task:/ }), page.getByRole("button", { name: "AI options", exact: true }), page.locator('.ai-workspace').getByRole("button", { name: "Tools", exact: true }), page.getByRole("button", { name: "Draft actions", exact: true })].map(button => button.boundingBox()))
          check(rectangles.every(Boolean) && Math.abs(rectangles[0]!.y - rectangles[1]!.y) < 2 && Math.abs(rectangles[2]!.y - rectangles[3]!.y) < 2 && rectangles[2]!.y > rectangles[0]!.y, "phone controls form two balanced rows")
        }
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "workspace fits viewport")
        await screenshot("workspace")
        const optionsButton = page.getByRole("button", { name: "AI options", exact: true })
        await optionsButton.focus()
        await page.keyboard.press("Enter")
        const options = page.getByRole("dialog", { name: "AI options", exact: true })
        await options.waitFor()
        await withinViewport(options, "options")
        check(await options.evaluate(node => node.contains(document.activeElement)), "keyboard enters options")
        check(await options.getByRole("combobox", { name: "Tone", exact: true }).inputValue() === "Socratic", "saved options visible")
        await options.getByRole("combobox", { name: "Language", exact: true }).selectOption("French")
        await options.getByRole("combobox", { name: "Provider family", exact: true }).selectOption("groq")
        await options.getByRole("textbox", { name: "Audience", exact: true }).fill("")
        await options.getByRole("textbox", { name: "Requirements", exact: true }).fill("")
        await options.getByRole("button", { name: "2048", exact: true }).click()
        await options.getByRole("slider", { name: /^Creativity/ }).fill("0.65")
        await screenshot("options")
        await page.keyboard.press("Escape")
        await options.waitFor({ state: "hidden" })
        check(await optionsButton.evaluate(node => node === document.activeElement), "Escape returns options focus")
        await optionsButton.click()
        await page.mouse.click(2, 2)
        await options.waitFor({ state: "hidden" })
        check(true, "outside click closes options")
        await page.getByRole("button", { name: /^Task:/ }).click()
        const taskMenu = page.getByRole("dialog", { name: /^Task:/ })
        await taskMenu.waitFor()
        await withinViewport(taskMenu, "tasks")
        await screenshot("tasks")
        await taskMenu.getByRole("button", { name: "Quiz", exact: true }).click()
        await taskMenu.waitFor({ state: "hidden" })
        check((await prompt.inputValue()).startsWith("Generate a mixed quiz"), "task preset applied")
        check(await page.getByRole("button", { name: "Save as note", exact: true }).count() === 0, "outgoing reply not mixed with changed task")
        check(await page.evaluate(() => JSON.parse(localStorage.getItem("learn_ai_tutor_draft_history_v1") || "[]").some((item: { message: string; reply: string }) => item.message === "KEEP_MY_EDITED_PROMPT" && item.reply === "KEEP_MY_ORIGINAL_RESULT")), "edited prompt and reply archived")
        await page.reload({ waitUntil: "domcontentloaded" })
        await prompt.waitFor()
        const draftMenu = await openDraft()
        await withinViewport(draftMenu, "draft actions")
        await draftMenu.getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
        check(await prompt.inputValue() === initialDraft.message, "previous draft restores after reload")
        await page.getByRole("button", { name: "Save as note", exact: true }).waitFor()
        await optionsButton.click()
        check(await options.getByRole("combobox", { name: "Language", exact: true }).inputValue() === "French" && await options.getByRole("combobox", { name: "Source", exact: true }).inputValue() === "Active Studio item", "recovery retains changed options and source")
        check(await options.getByRole("textbox", { name: "Audience", exact: true }).inputValue() === "" && await options.getByRole("textbox", { name: "Requirements", exact: true }).inputValue() === "", "task transitions preserve intentionally empty options")
        await options.getByRole("textbox", { name: "Audience", exact: true }).fill("My class")
        await options.getByRole("textbox", { name: "Requirements", exact: true }).fill("Use simple examples")
        await page.keyboard.press("Escape")
        // Both failure points must preserve the current edited text and visible reply.
        for (const storageKey of ["learn_ai_tutor_draft_history_v1", "learn_ai_tutor_draft_v1"]) {
          await prompt.fill(`RECOVER_${storageKey}`)
          await blockStorage(storageKey)
          await chooseTask("Rewrite")
          check(await prompt.inputValue() === `RECOVER_${storageKey}` && await page.getByRole("button", { name: "Save as note", exact: true }).isVisible(), `${storageKey} failure refuses replacement`)
          await page.keyboard.press("Escape")
          await blockStorage("")
        }
        await page.getByRole("button", { name: "Insert result", exact: true }).click()
        await page.getByRole("button", { name: "Create result", exact: true }).focus()
        await page.keyboard.press("Enter")
        const createMenu = page.getByRole("dialog", { name: "Create result", exact: true })
        await createMenu.waitFor()
        check(await page.getByRole("dialog").count() === 1, "keyboard menu switching leaves one dialog")
        await withinViewport(createMenu, "result create")
        await screenshot("result-menu")
        await page.keyboard.press("Escape")
        check(await page.getByRole("button", { name: "Create result", exact: true }).evaluate(node => node === document.activeElement), "result Escape restores focus")
        await page.getByRole("button", { name: "Create result", exact: true }).click()
        await createMenu.getByRole("button", { name: "Flashcards", exact: true }).click()
        check((await prompt.inputValue()).includes(initialDraft.reply), "result becomes follow-up source")
        check(await page.getByRole("button", { name: "Save as note", exact: true }).count() === 0, "follow-up clears obsolete result")
        await (await openDraft()).getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
        await page.getByRole("button", { name: "Insert result", exact: true }).click()
        const insertMenu = page.getByRole("dialog", { name: "Insert result", exact: true })
        await insertMenu.waitFor()
        await withinViewport(insertMenu, "result insert")
        await page.mouse.click(2, 2)
        await insertMenu.waitFor({ state: "hidden" })
        check(true, "result menu outside click closes")
        await (await openDraft()).getByRole("button", { name: "Reset draft", exact: true }).click()
        check(await prompt.inputValue() === "Create a study plan from my recent notes.", "reset remains reachable")
        await (await openDraft()).getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
        check(await prompt.inputValue() === "RECOVER_learn_ai_tutor_draft_v1", "reset preserves recoverable outgoing draft")
        // Old async protections must remain true while the compact menus are available.
        heldChat = true
        await page.getByRole("button", { name: "Run tutor", exact: true }).click()
        for (let attempt = 0; !releaseChat && attempt < 100; attempt++) await page.waitForTimeout(50)
        assert.ok(releaseChat, "AI fixture reached hold")
        check(!!chatBody && (chatBody as Record<string, unknown>).provider === "groq", "provider configuration reaches request")
        await prompt.fill("NEWER_CONTEXT")
        releaseChat()
        await page.getByRole("button", { name: "Run tutor", exact: true }).waitFor()
        await page.waitForTimeout(150)
        check(await prompt.inputValue() === "NEWER_CONTEXT" && await page.getByRole("button", { name: "Save as note", exact: true }).count() === 0, "late generation cannot mix contexts")
        await prompt.fill("")
        await chooseTask("Rewrite")
        await (await openDraft()).getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
        check(await prompt.inputValue() === "", "intentionally blank prompt restores exactly")
        await screenshot("final")
        check(report.errors.length === 0, `no page errors/unexpected writes: ${report.errors.join(", ")}`)
        await context.close()
        console.log(`${width}/${mode}: ${report.checks.length} checks passed`)
      }
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(reports, null, 2) + "\n")
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
