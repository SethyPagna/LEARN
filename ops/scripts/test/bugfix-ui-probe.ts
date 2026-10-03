/** Local browser regression checks. Every API response is a fixture; no workspace writes leave the browser. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium, type BrowserContext, type Page } from "playwright-core"
import type { User, Note } from "../../../src/components/learn/types"
import { chatDestinationStorageKey } from "../../../src/lib/chat-destination"
import { createLiveSession, reduceSession } from "../../../src/lib/live/quiz-session"
import { buildXlsx } from "../../../src/lib/export/xlsx"

const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Run only against a local preview.")
const output = process.env.LEARN_QA_OUTPUT || path.resolve(".cache/design-review/bugfixes")
fs.mkdirSync(output, { recursive: true })
const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
const sharp = requireFromNext("sharp") as (input: Buffer) => { resize(options: { width: number; withoutEnlargement: boolean }): { jpeg(options: { quality: number }): { toFile(file: string): Promise<unknown> } } }
const user: User = { id: "qa_local", username: "qa", name: "QA Learner", email: "qa@learn.local", role: "learner", preferences: {} }
const note: Note = { id: "qa_note", title: "QA Markdown", content: "# Cells\n\nRead **carefully** and [Docs](https://example.com).\n\n- One\n- Two", icon: "", favorite: false, template: "blank", updated_at: "2026-10-01T00:00:00Z" }
const sheet = { id: "qa_sheet", title: "QA Formulas", cells: [["Amount", "Total"], ["2", "=SUM(A2:A5)"], ["4", "=AVERAGE(A2:A5)"], ["", "=COUNT(A2:A5)"], ["words", "=SUM(B2:B3)"]], updated_at: "2026-10-01T00:00:00Z" }
const thread = { id: "qa_thread", title: "#general - QA conversation", dm_peer_id: "qa_peer", dm_peer_name: "QA Friend", updated_at: "2026-10-01T00:00:00Z", last_message: "Remembered message" }
const layouts = [{ width: 1280, height: 800, theme: "color" }, { width: 390, height: 844, theme: "light" }, { width: 320, height: 700, theme: "dark" }].filter(layout => !process.env.LEARN_QA_WIDTH || layout.width === Number(process.env.LEARN_QA_WIDTH))
assert.ok(layouts.length, "LEARN_QA_WIDTH must select an existing layout.")
const reports: { width: number; theme: string; checks: string[]; writes: string[]; failures: string[] }[] = []

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const layout of layouts) {
      const report = { width: layout.width, theme: layout.theme, checks: [] as string[], writes: [] as string[], failures: [] as string[] }
      reports.push(report)
      const context: BrowserContext = await browser.newContext({ viewport: layout, serviceWorkers: "block" })
      const errors: string[] = []
      let isHost = false
      let failedJoin = false
      let authReady = false
      let joins = 0
      let live = createLiveSession({ code: "ABC234", quizId: "qa_quiz", quizTitle: "QA game", hostUserId: "qa_host", questions: [{ id: "qa_question", prompt: "Pick a number", choices: [{ id: "a", text: "One" }, { id: "b", text: "Two" }], correctChoiceId: "b", timeLimitSeconds: 30 }], createdAt: Date.now() })
      const liveItem = () => ({ code: live.code, serverNow: Date.now(), session: live, viewer: { isHost, isParticipant: !isHost, participantId: isHost ? "" : "lp_qa_local" } })
      await context.addInitScript(({ theme, key }) => { localStorage.setItem("theme", theme); localStorage.setItem(key, JSON.stringify({ kind: "thread", threadId: "qa_thread" })) }, { theme: layout.theme, key: chatDestinationStorageKey(user.id) })
      await context.route("**/api/**", async route => {
        const req = route.request()
        const url = new URL(req.url())
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
        if (req.method() !== "GET") {
          report.writes.push(`${req.method()} ${url.pathname}`)
          if (req.method() === "POST" && url.pathname === "/api/live-sessions/ABC234" && req.postDataJSON().action === "join") {
            assert.ok(authReady, "auto-join waits for the session")
            joins += 1
            if (failedJoin) return json({ error: "That game has finished." }, 400)
            if (!isHost) live = reduceSession(live, { type: "join", actorId: "qa_local", participantId: "lp_qa_local", name: "QA Learner" }, Date.now()).session
            return json({ item: liveItem() })
          }
          return route.abort()
        }
        if (url.pathname === "/api/auth/session") {
          await new Promise(resolve => setTimeout(resolve, 150))
          authReady = true
          return json({ user, databaseConfigured: true })
        }
        if (url.pathname === "/api/dashboard") return json({ user, snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 }, notes: [note], goals: [], chats: [], attempts: [], files: [] })
        if (url.pathname === "/api/notes") return json({ items: [note] })
        if (url.pathname === "/api/sheets") return json({ items: [sheet] })
        if (url.pathname === "/api/vault/blocks") return json({ items: [{ id: "qa_block", blockType: "text", content: { text: "## Recall\n\nUse `COUNT` on numbers.\n\n[Unsafe](javascript:alert(1))" } }] })
        if (url.pathname === "/api/vault/graph") return json({ nodes: [], edges: [], orphanNodes: [] })
        if (url.pathname === "/api/chat") return json(url.searchParams.has("threadId") ? { items: [{ id: "qa_message", body: "Remembered message", name: "QA Friend", user_id: "qa_peer", thread_id: "qa_thread", created_at: "2026-10-01T00:00:00Z" }], reactions: {} } : { items: [thread] })
        if (url.pathname === "/api/live-sessions/ABC234") return json({ item: liveItem() })
        if (url.pathname === "/api/ai/providers") return json({ items: [], catalog: [], presets: [] })
        if (url.pathname === "/api/reviews") return json({ items: [], isRestDay: false, remainingDueCount: 0 })
        if (url.pathname === "/api/calendar/connected-events") return json({ results: [], checkedAt: new Date().toISOString() })
        return json({ items: [], connections: [], notifications: [], stories: [], groups: [] })
      })
      const page = await context.newPage()
      page.on("pageerror", error => errors.push(error.message))
      page.on("console", message => {
        if (message.type() === "error" && /Route error:|hydration|Minified React error|TypeError|ReferenceError/i.test(message.text())) errors.push(message.text())
      })
      function check(value: unknown, name: string) { assert.ok(value, name); report.checks.push(name) }
      async function visit(href: string) {
        await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded" })
        // Focused editors hide the topbar on phones; session readiness is still
        // represented in the DOM. Each case separately waits for its visible UI.
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached", timeout: 30000 })
      }
      async function fits(name: string) { check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} fits viewport`) }
      async function picture(name: string) { await sharp(await page.screenshot()).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(output, `${name}-${layout.width}-${layout.theme}.jpg`)) }
      async function run(name: string, body: () => Promise<void>) {
        if (process.env.LEARN_QA_CASE && name !== process.env.LEARN_QA_CASE) return
        try { await body(); console.log(`${layout.width} ${name}: passed`) }
        catch (error) {
          report.failures.push(`${name} (${page.url()}): ${error instanceof Error ? error.message : String(error)}`)
          await picture(`failed-${name.toLowerCase().replaceAll(" ", "-")}`)
          console.log(`${layout.width} ${name}: failed`)
        }
      }
      try {
        await run("Vault", async () => {
          await visit("/vault")
          const saved = page.getByRole("region", { name: "Saved Vault blocks" })
          await saved.getByRole("heading", { name: "Recall", exact: true }).waitFor()
          check(await saved.getByRole("heading", { name: "Cells", exact: true }).isVisible(), "note Markdown heading rendered")
          check(await saved.locator("strong").filter({ hasText: "carefully" }).isVisible(), "Markdown bold rendered")
          check(await saved.getByRole("link", { name: "Docs", exact: true }).getAttribute("href") === "https://example.com", "safe Markdown link rendered")
          check(await saved.locator("a[href^='javascript:']").count() === 0, "unsafe Markdown link refused")
          check(await saved.locator("[draggable=true]").count() === 0, "read-only preview has no drag controls")
          await fits("Vault"); await picture("vault")
        })
        await run("Sheets", async () => {
          await visit("/sheets?item=sheets:qa_sheet")
          const sum = page.getByRole("textbox", { name: "Spreadsheet cell 2:2", exact: true })
          await sum.waitFor()
          await page.waitForFunction(() => (document.querySelector('[aria-label="Spreadsheet cell 2:2"]') as HTMLInputElement)?.value === "6")
          check(await page.getByRole("textbox", { name: "Spreadsheet cell 3:2", exact: true }).inputValue() === "3", "average ignores blanks and text")
          check(await page.getByRole("textbox", { name: "Spreadsheet cell 4:2", exact: true }).inputValue() === "2", "count ignores blanks and text")
          check(await page.getByRole("textbox", { name: "Spreadsheet cell 5:2", exact: true }).inputValue() === "9", "dependent formulas recalculate")
          await sum.focus()
          check(await sum.inputValue() === "=SUM(A2:A5)", "selecting a result exposes its source formula")
          await page.getByRole("textbox", { name: "Spreadsheet cell 2:1", exact: true }).fill("8")
          await page.getByRole("textbox", { name: "Project title" }).focus()
          check(await sum.inputValue() === "12", "edited source updates SUM")
          check(await page.getByRole("textbox", { name: "Spreadsheet cell 5:2", exact: true }).inputValue() === "18", "edited source updates dependent formulas")
          const disclosure = page.locator("details", { hasText: "CSV or XLSX import" })
          await disclosure.locator("summary").click()
          const importer = disclosure.locator('div[aria-busy]')
          const picker = importer.getByLabel("Import XLSX", { exact: true })
          check(await picker.evaluate(el => el.classList.contains("sr-only")), "file picker is one compact accessible pill")
          await picker.setInputFiles({ name: "invalid.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from("not a workbook") })
          await importer.getByRole("status").filter({ hasText: "Import failed:" }).waitFor()
          check(await sum.inputValue() === "12", "failed workbook import preserves edited cells")
          check(await picker.isEnabled(), "file picker recovers after failed import")
          await page.evaluate(() => {
            const original = File.prototype.arrayBuffer
            File.prototype.arrayBuffer = function () {
              if (this.name !== "delayed.xlsx") return original.call(this)
              return new Promise<ArrayBuffer>(resolve => {
                Object.assign(window, { releaseQaImport: async () => resolve(await original.call(this)) })
              })
            }
          })
          await picker.setInputFiles({ name: "delayed.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(buildXlsx({ title: "Replacement", cells: [["Would replace"], ["999"]] })) })
          await page.waitForFunction(() => "releaseQaImport" in window)
          check(await importer.getAttribute("aria-busy") === "true" && await picker.isDisabled(), "pending import is locked and announced")
          await page.getByRole("textbox", { name: "Spreadsheet cell 2:1", exact: true }).fill("42")
          await page.evaluate(() => (window as unknown as { releaseQaImport: () => void }).releaseQaImport())
          await importer.getByRole("status").filter({ hasText: "project changed" }).waitFor()
          check(await page.getByRole("textbox", { name: "Spreadsheet cell 2:1", exact: true }).inputValue() === "42", "delayed import cannot overwrite a newer edit")
          check(await picker.isEnabled(), "picker recovers after stale import")
          const inputVisible = await page.getByRole("textbox", { name: "Spreadsheet cell 2:1", exact: true }).evaluate(el => {
            const table = el.closest("table")!
            const scroller = table.parentElement!
            const rowNumbers = table.querySelector("tbody th")!
            return el.getBoundingClientRect().left >= scroller.getBoundingClientRect().left + rowNumbers.getBoundingClientRect().width - 1
          })
          check(inputVisible, "focused cell text clears the sticky row numbers")
          await fits("Sheets"); await picture("sheet")
        })
        await run("AI", async () => {
          await visit("/ai")
          const primary = page.locator(".ai-workspace button.bg-primary").first()
          check(Boolean((await primary.innerText()).trim()), "AI primary action has a visible label")
          check((await page.getByRole("button", { name: "Studio block", exact: true }).innerText()).includes("Studio block"), "AI Studio action has a visible label")
          await page.getByRole("button", { name: "Draft actions", exact: true }).click()
          check((await page.getByRole("button", { name: "Reset draft", exact: true }).innerText()).includes("Reset"), "AI reset has a visible label in draft actions")
          await page.keyboard.press("Escape")
          await fits("AI"); await picture("ai")
        })
        await run("Chat", async () => {
          await visit("/chat")
          const workspace = page.getByRole("region", { name: "Messages workspace" })
          await page.waitForFunction(() => document.querySelector('[aria-label="Messages workspace"]')?.getAttribute("data-conversation-open") === "true")
          check(await workspace.getByText("Remembered message", { exact: true }).last().isVisible(), "remembered chat opens its conversation")
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.waitForFunction(() => document.querySelector('[aria-label="Messages workspace"]')?.getAttribute("data-conversation-open") === "true")
          check(await workspace.getByText("Remembered message", { exact: true }).last().isVisible(), "remembered chat survives reload")
          await fits("Chat"); await picture("chat")
        })
        await run("Live player", async () => {
          isHost = false; joins = 0; authReady = false
          await visit("/live?code=ABC234")
          await page.getByText("You are in. Waiting for the host to start…", { exact: true }).waitFor()
          check(joins === 1, "direct live link joins once after authentication")
          await page.reload({ waitUntil: "domcontentloaded" })
          await page.getByText("You are in. Waiting for the host to start…", { exact: true }).waitFor()
          check(joins === 2 && live.participants.length === 1, "reload rejoins without duplicating player")
          await fits("Live player")
        })
        await run("Live host", async () => {
          isHost = true; joins = 0; authReady = false
          await visit("/live?code=ABC234")
          await page.getByRole("button", { name: "Start quiz", exact: true }).waitFor()
          check(joins === 1 && !(await page.getByText("You are in. Waiting for the host to start…", { exact: true }).isVisible()), "direct host link shows host controls")
          await fits("Live host"); await picture("live-host")
        })
        await run("Live stale link", async () => {
          failedJoin = true; joins = 0; authReady = false
          await visit("/live?code=ABC234")
          await page.getByText("That game has finished.", { exact: true }).waitFor()
          check(joins === 1, "failed autojoin stops and leaves a usable form")
          failedJoin = false
        })
        await run("Route titles", async () => {
          for (const [href, title] of [["/progress", "Progress"], ["/calendar", "Calendar"], ["/studio", "Studio"], ["/settings", "Settings"]]) {
            await visit(href)
            await page.waitForFunction(title => document.title === `${title} - LEARN`, title)
            const response = await context.request.get(`${base}${href}`)
            check((await response.text()).includes(`<title>${title} - LEARN</title>`), `${title} has correct server metadata`)
          }
          for (const [href, title] of [["/profile", "Profile"], ["/quiz/qa_quiz", "Quizzes"]]) {
            const response = await context.request.get(`${base}${href}`)
            check((await response.text()).includes(`<title>${title} - LEARN</title>`), `${title} matches its client section title`)
          }
        })
        check(errors.length === 0, `no page errors (${errors.join("; ")})`)
        check(report.writes.every(write => write === "POST /api/live-sessions/ABC234"), "only expected mocked joins attempted")
      } finally { await context.close() }
      console.log(JSON.stringify({ width: report.width, theme: report.theme, checks: report.checks.length, failures: report.failures }))
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(reports, null, 2))
  assert.equal(reports.flatMap(report => report.failures).length, 0, "all UI cases pass; see results.json")
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
