/** Compiled local UI with isolated API fixtures. No real data or AI requests. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium } from "playwright-core"

const base = process.env.LEARN_QA_BASE_URL || "http://127.0.0.1:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname))
const output = path.resolve(".cache/design-review/learning-workflow")
fs.mkdirSync(output, { recursive: true })
const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
const sharp = requireFromNext("sharp")
const pairs = ["Mitochondria: makes energy for the cell", "Ribosome: builds proteins", "Nucleus: holds DNA", "Membrane: controls entry"]
const notes = [
  { id: "qa_cells", title: "Cell biology", content: `${pairs.map(pair => `<p>${pair}</p>`).join("")}<p>UNSELECTED_SENTINEL is outside this passage.</p>`, user_id: "qa_local", tags: [], updated_at: "2026-10-01T00:00:00Z" },
  { id: "qa_prose", title: "A different source", content: "<p>Cells convert nutrients into energy and coordinate their internal activities.</p>", user_id: "qa_local", tags: [], updated_at: "2026-10-01T00:00:00Z" },
  { id: "qa_twin", title: "Same passage elsewhere", content: `${pairs.map(pair => `<p>${pair}</p>`).join("")}<p>UNSELECTED_SENTINEL is outside this passage.</p>`, user_id: "qa_local", tags: [], updated_at: "2026-10-01T00:00:00Z" },
]
const reports: Array<{ width: number; mode: string; checks: string[]; writes: string[]; errors: string[] }> = []

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    for (const [width, height, mode] of [[1280, 800, "color"], [390, 844, "light"], [320, 700, "dark"]] as const) {
      if (process.env.LEARN_QA_WIDTH && Number(process.env.LEARN_QA_WIDTH) !== width) continue
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })
      await context.addInitScript(mode => localStorage.setItem("theme", mode), mode)
      await context.addCookies([{ name: "learn_sidebar", value: "expanded", url: base }])
      const report = { width, mode, checks: [] as string[], writes: [] as string[], errors: [] as string[] }
      reports.push(report)
      const check = (condition: unknown, message: string) => { assert.ok(condition, message); report.checks.push(message) }
      const quizzes: Array<Record<string, unknown>> = []
      const designs: Array<Record<string, unknown>> = []
      let cards: Array<Record<string, unknown>> = []
      let holdPath = ""
      let heldBody: Record<string, unknown> | null = null
      let releaseHeld: (() => void) | undefined
      let rejectHost = true
      let rejectBlock = true
      const user = { id: "qa_local", username: "qa", name: "QA Learner", email: "qa@learn.local", role: "admin", profileVisibility: "private", preferences: {}, metrics: { xpTotal: 0, streakCurrent: 0, streakLongest: 0, streakFreezesAvailable: 0 } }
      const initialNotes = JSON.stringify(notes)
      await context.route("**/api/**", async route => {
        const request = route.request()
        const url = new URL(request.url())
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
        if (request.method() === "GET") {
          if (url.pathname === "/api/auth/session") return json({ user, databaseConfigured: true })
          if (url.pathname === "/api/dashboard") return json({ user, snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 }, notes, goals: [], chats: [], attempts: [], files: [] })
          if (url.pathname === "/api/notes") return json({ items: notes })
          if (url.pathname === "/api/quizzes") return json({ items: quizzes })
          if (url.pathname.startsWith("/api/quizzes/")) return json({ item: quizzes.find(item => item.id === url.pathname.split("/").at(-1)) })
          if (url.pathname === "/api/canvas") return json({ items: designs, item: designs.find(item => item.id === url.searchParams.get("id")) })
          if (url.pathname === "/api/reviews") return json({ items: cards, remainingDueCount: cards.length, isRestDay: false })
          if (url.pathname === "/api/vault/blocks") return json({ items: [{ id: "qa_block", blockType: "text", content: { text: "<p>Gravity: attraction between masses</p><p>Friction: resistance to motion</p><p>Inertia: resistance to acceleration</p>" } }] })
          if (url.pathname === "/api/ai/providers") return json({ items: [{ id: "qa_provider", provider: "groq", enabled: true, has_key: true, last_status: "untested" }], runtimeItems: [], catalog: [], presets: [] })
          if (url.pathname === "/api/chat") return json({ items: [{ id: "qa_chat", title: "#general - Study", dm_peer_id: "qa_friend", dm_peer_name: "Study friend" }] })
          if (url.pathname === "/api/vault/graph") return json({ nodes: [], edges: [], orphanNodes: [] })
          return json({ items: [], files: [], connections: [], notifications: [], groups: [], nodes: [], edges: [], orphanNodes: [], unreadCount: 0 })
        }
        report.writes.push(`${request.method()} ${url.pathname}`)
        const body = request.postDataJSON() as Record<string, unknown>
        if (url.pathname === holdPath) {
          holdPath = ""
          heldBody = body
          await new Promise<void>(resolve => { releaseHeld = resolve })
        }
        if (url.pathname === "/api/quizzes") {
          const item = { ...body, id: `qa_quiz_${quizzes.length}`, question_count: (body.questions as unknown[])?.length || 0 }
          quizzes.push(item)
          return json({ item })
        }
        if (url.pathname === "/api/notes") return json({ item: { ...body, id: typeof body.id === "string" ? body.id : "qa_saved_note" } })
        if (request.method() === "PUT" && url.pathname.startsWith("/api/notes/")) {
          const id = url.pathname.split("/").at(-1)
          const original = notes.find(note => note.id === id)
          assert.ok(original, "only an isolated source note can be saved")
          return json({ item: { ...original, ...body, id } })
        }
        if (url.pathname === "/api/reviews") {
          cards = (body.items as Record<string, unknown>[]).map((card, index) => ({ ...card, id: `qa_review_${index}`, source_type: "practice_mistake", due_at: "2026-10-01T00:00:00Z", retrievability: 0.5, difficulty: 0.7, stability: 1.5 }))
          return json({ item: { count: cards.length } })
        }
        if (url.pathname === "/api/canvas") { designs.push(body); return json({ item: body }) }
        if (url.pathname === "/api/ai/chat") return json({ status: "ok", text: JSON.stringify({ title: "Cells", questions: [{ question: "What makes energy?", choices: [{ id: "a", text: "Mitochondria" }, { id: "b", text: "Ribosome" }], correct_answer_id: "a" }] }) })
        if (url.pathname === "/api/live-sessions") {
          if (rejectHost) { rejectHost = false; return json({ error: "Host fixture failure" }, 503) }
          return json({ item: { code: "QA1234" } })
        }
        if (url.pathname === "/api/vault/blocks") {
          if (rejectBlock) { rejectBlock = false; return json({ error: "Block fixture failure" }, 503) }
          return json({ item: { id: "qa_saved_block", ...body } })
        }
        report.errors.push(`Unexpected mutation blocked: ${request.method()} ${url.pathname}`)
        return route.abort()
      })
      const page = await context.newPage()
      page.setDefaultTimeout(15000)
      page.on("pageerror", error => report.errors.push(error.message))
      const open = async (pathname: string) => {
        await page.goto(`${base}${pathname}`, { waitUntil: "domcontentloaded" })
        await page.locator(".learn-app").waitFor({ timeout: 60000 })
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached" })
      }
      const fit = async (label: string) => check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${label} fits ${width}px`)
      const chooseVaultNote = async (id: string) => {
        if (width < 768) await page.getByRole("combobox", { name: "Vault note", exact: true }).selectOption(id)
        else await page.locator(".vault-workbench aside").getByRole("button", { name: notes.find(note => note.id === id)!.title, exact: true }).click()
        await page.locator(`.vault-blocks [data-source-id="${id}"]`).waitFor()
      }
      const selectPassage = async (selector: string, paragraphs = 4) => {
        const root = page.locator(selector).first()
        await root.scrollIntoViewIfNeeded()
        await root.evaluate((node, count) => {
          const elements = node.querySelectorAll("p")
          const range = document.createRange()
          if (elements.length >= count) { range.setStartBefore(elements[0]); range.setEndAfter(elements[count - 1]) }
          else range.selectNodeContents(node)
          const selection = getSelection()!
          selection.removeAllRanges()
          selection.addRange(range)
          document.dispatchEvent(new Event("selectionchange"))
        }, paragraphs)
        await page.getByRole("toolbar", { name: "Use selection" }).waitFor()
      }
      const dock = page.getByRole("toolbar", { name: "Use selection" })
      const navigateToStudio = async () => {
        for (const button of await page.locator('nav li[data-tab="studio"] > button').all()) {
          if (await button.isVisible()) { await button.click(); return }
        }
        throw new Error(`Visible Studio navigation missing: ${JSON.stringify(await page.evaluate(() => ({ url: location.href, sidebar: document.querySelector(".learn-app")?.getAttribute("data-sidebar"), buttons: Array.from(document.querySelectorAll("nav button")).map(node => ({ text: node.textContent, label: node.getAttribute("aria-label"), rect: node.getBoundingClientRect().toJSON() })) })))}`)
      }
      const blockDraftStorage = async (blocked: boolean) => page.evaluate(value => {
        const qaWindow = window as unknown as { qaDraftStorageBlocked?: boolean; qaDraftStorageInstalled?: boolean }
        qaWindow.qaDraftStorageBlocked = value
        if (qaWindow.qaDraftStorageInstalled) return
        qaWindow.qaDraftStorageInstalled = true
        const original = Storage.prototype.setItem
        Storage.prototype.setItem = function(key, content) {
          if (qaWindow.qaDraftStorageBlocked && /^learn_(?:vault_block_draft|ai_tutor_draft)/.test(key)) throw new DOMException("Fixture blocked storage", "QuotaExceededError")
          return original.call(this, key, content)
        }
      }, blocked)
      const waitForHeld = async () => {
        for (let attempt = 0; !releaseHeld && attempt < 50; attempt++) await new Promise(resolve => setTimeout(resolve, 50))
        assert.ok(releaseHeld, "fixture request reached its hold")
      }
      const releaseFixtureRequest = () => {
        assert.ok(releaseHeld, "fixture hold exists before release")
        releaseHeld()
        releaseHeld = undefined
      }
      await open("/vault")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      check(await dock.getByRole("button", { name: "Quiz me", exact: true }).isVisible(), "Vault offers local selection quiz")
      check(await dock.evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight }), "selection tools stay within the visible viewport")
      await sharp(await page.screenshot()).resize({ width: Math.min(width, 720), withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(output, `selection-${width}-${mode}.jpg`))
      await page.keyboard.press("Shift+F10")
      check(await dock.evaluate(node => node.contains(document.activeElement)), "keyboard enters contextual toolbar")
      await page.keyboard.press("Escape")
      await dock.waitFor({ state: "hidden" })
      check(await page.locator('[data-source-id="qa_cells"]').evaluate(node => node === document.activeElement), "Escape restores Vault focus")
      if (width < 768) await page.getByRole("combobox", { name: "Vault note", exact: true }).selectOption("qa_twin")
      else {
        await page.locator(".vault-workbench aside").getByRole("button", { name: "Same passage elsewhere", exact: true }).focus()
        await page.keyboard.press("Space")
      }
      await page.locator('.vault-blocks [data-source-id="qa_twin"]').waitFor()
      await selectPassage('.vault-blocks [data-source-id="qa_twin"]')
      check(await dock.isVisible(), "keyboard source switch offers identical text from another note")
      await page.keyboard.press("Escape")
      await chooseVaultNote("qa_cells")
      // A fresh pointer gesture re-enables the same selected text after dismissal.
      await page.locator('.vault-blocks [data-source-id="qa_cells"]').click({ position: { x: 2, y: 2 } })
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      await page.locator('.vault-blocks [data-source-id="qa_cells"]').evaluate(node => node.closest(".vault-workbench")!.remove())
      await dock.waitFor({ state: "hidden" })
      check(true, "removing a containing source pane closes its selection tools")
      await open("/vault")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      await dock.getByRole("button", { name: "Quiz me", exact: true }).evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click() })
      await page.waitForURL(url => url.pathname.startsWith("/quiz/"))
      check(quizzes.length === 1 && (quizzes[0].questions as unknown[]).length === 4, "selected quiz doubleclick saves once and opens")
      check(!JSON.stringify(quizzes[0]).includes("UNSELECTED_SENTINEL"), "quiz excludes unselected source")
      await fit("Quiz destination")
      await open("/vault")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      await dock.getByRole("button", { name: "Make review cards", exact: true }).click()
      await dock.getByRole("button", { name: "Review", exact: true }).waitFor()
      check(cards.length === 4, "selected cards saved")
      await dock.getByRole("button", { name: "Review", exact: true }).click()
      await page.getByRole("article", { name: "Current review" }).waitFor()
      await fit("Review destination")
      await open("/vault")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      await dock.getByRole("button", { name: "Make slides", exact: true }).click()
      await page.waitForURL(url => url.pathname === "/slides" && url.searchParams.has("design"))
      check(designs.length === 1 && !JSON.stringify(designs[0]).includes("UNSELECTED_SENTINEL"), "selected slides saved without unselected content")
      await fit("Slides destination")
      await open("/vault")
      await selectPassage('.vault-blocks [data-source-id="qa_cells:qa_block"]', 3)
      check(await dock.getByRole("button", { name: "Quiz me", exact: true }).isVisible(), "saved Vault blocks also offer local quiz")
      await page.keyboard.press("Escape")
      await chooseVaultNote("qa_prose")
      await selectPassage('.vault-blocks [data-source-id="qa_prose"]', 1)
      await dock.getByRole("button", { name: "Quiz me with AI", exact: true }).waitFor()
      holdPath = "/api/ai/chat"
      await dock.getByRole("button", { name: "Quiz me with AI", exact: true }).click()
      await dock.getByRole("button", { name: "Cancel action", exact: true }).waitFor()
      await waitForHeld()
      await page.waitForFunction(() => !!document.querySelector('.select-dock[data-stage="working"]'))
      await page.keyboard.press("Escape")
      await dock.waitFor({ state: "hidden" })
      const savesBeforeCancel = quizzes.length
      releaseFixtureRequest()
      await page.waitForTimeout(250)
      check(quizzes.length === savesBeforeCancel && new URL(page.url()).pathname === "/vault", "cancelled AI never starts a save or navigation")
      check(!!heldBody, "held AI request was exercised")
      await chooseVaultNote("qa_cells")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      holdPath = "/api/quizzes"
      releaseHeld = undefined
      await dock.getByRole("button", { name: "Quiz me", exact: true }).click()
      await dock.getByRole("button", { name: "Cancel action", exact: true }).waitFor()
      await waitForHeld()
      await chooseVaultNote("qa_prose")
      await dock.waitFor({ state: "hidden" })
      releaseFixtureRequest()
      await page.waitForTimeout(250)
      check(new URL(page.url()).pathname === "/vault", "a started quiz save cannot redirect after source switch")
      await chooseVaultNote("qa_cells")
      await selectPassage('.vault-blocks [data-source-id="qa_cells"]')
      const beforePlay = quizzes.length
      await dock.getByRole("button", { name: "Play a live quiz with a chat", exact: true }).click()
      await dock.getByRole("button", { name: "Study friend", exact: true }).click()
      await dock.getByRole("alert").filter({ hasText: "Host fixture failure" }).waitFor()
      await dock.getByRole("button", { name: "Back", exact: true }).click()
      await dock.getByRole("button", { name: "Play a live quiz with a chat", exact: true }).click()
      await dock.getByRole("button", { name: "Study friend", exact: true }).click()
      await page.waitForURL(url => url.pathname === "/live")
      check(quizzes.length === beforePlay + 1, "host retry reuses one saved quiz")
      await open("/vault")
      await page.getByText("Add a block", { exact: true }).click()
      const composer = page.getByRole("textbox", { name: "Block content", exact: true })
      await composer.fill("KEEP_MY_VAULT_DRAFT")
      await page.getByRole("button", { name: "Add", exact: true }).click()
      await page.getByRole("status").filter({ hasText: "Block fixture failure" }).waitFor()
      check(await composer.inputValue() === "KEEP_MY_VAULT_DRAFT", "failed block save preserves draft")
      await open("/ai")
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).fill("KEEP_MY_AI_DRAFT")
      await open("/vault")
      await page.getByText("Add a block", { exact: true }).click()
      check(await composer.inputValue() === "KEEP_MY_VAULT_DRAFT", "Vault draft survives page round trip")
      await blockDraftStorage(true)
      await composer.fill("RECOVER_STORAGE_VAULT_DRAFT")
      const launchBeforeDenied = await page.evaluate(() => localStorage.getItem("learn_ai_tutor_launch_v1"))
      await page.getByRole("button", { name: "Ask AI about this note", exact: true }).click()
      await page.getByRole("dialog", { name: "Ask AI about this note", exact: true }).getByRole("button", { name: "Explain", exact: true }).click()
      await page.getByText(/Browser storage is unavailable/).first().waitFor()
      check(new URL(page.url()).pathname === "/vault" && await page.evaluate(() => localStorage.getItem("learn_ai_tutor_launch_v1")) === launchBeforeDenied, "blocked AI handoff never queues a source preset")
      await navigateToStudio()
      await page.getByText(/Browser storage is unavailable/).first().waitFor()
      check(new URL(page.url()).pathname === "/vault" && await composer.inputValue() === "RECOVER_STORAGE_VAULT_DRAFT", "failed Vault draft storage blocks departure without losing text")
      await blockDraftStorage(false)
      await navigateToStudio()
      await page.waitForURL(url => url.pathname === "/studio")
      await open("/vault")
      await page.getByText("Add a block", { exact: true }).click()
      check(await composer.inputValue() === "RECOVER_STORAGE_VAULT_DRAFT", "Vault navigation recovers when storage works")
      await page.getByRole("button", { name: "Ask AI about this note", exact: true }).click()
      const aiMenu = page.getByRole("dialog", { name: "Ask AI about this note", exact: true })
      await aiMenu.getByRole("button", { name: "Explain", exact: true }).click()
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).waitFor()
      check((await page.getByRole("textbox", { name: "AI prompt", exact: true }).inputValue()).startsWith("Explain the key ideas"), "Vault AI handoff loads a source prompt")
      await page.getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
      check(await page.getByRole("textbox", { name: "AI prompt", exact: true }).inputValue() === "KEEP_MY_AI_DRAFT", "source handoff retains a reachable previous AI draft")
      await blockDraftStorage(true)
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).fill("RECOVER_STORAGE_AI_DRAFT")
      await navigateToStudio()
      await page.getByText(/Browser storage is unavailable/).first().waitFor()
      check(new URL(page.url()).pathname === "/ai", "failed AI draft storage blocks departure")
      await blockDraftStorage(false)
      await navigateToStudio()
      await page.waitForURL(url => url.pathname === "/studio")
      await open("/ai")
      check(await page.getByRole("textbox", { name: "AI prompt", exact: true }).inputValue() === "RECOVER_STORAGE_AI_DRAFT", "AI navigation recovers with preserved prompt")
      await open("/vault")
      await page.getByText("Add a block", { exact: true }).click()
      await fit("Vault draft")
      const screenshot = await page.screenshot()
      await sharp(screenshot).resize({ width: Math.min(width, 720), withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(output, `vault-${width}-${mode}.jpg`))
      await page.evaluate(() => localStorage.setItem("learn_ai_tutor_draft_v1", JSON.stringify({ message: "Retained prompt", reply: "RETAIN_MY_PREVIOUS_REPLY", sourceTitle: "Prior source", sourceContent: "Prior selected content" })))
      await open("/ai")
      await page.getByRole("button", { name: "Save as note", exact: true }).waitFor()
      holdPath = "/api/notes"
      releaseHeld = undefined
      const beforeInsert = report.writes.filter(write => write === "POST /api/notes").length
      await page.getByRole("button", { name: "Save as note", exact: true }).evaluate(node => { (node as HTMLButtonElement).click(); (node as HTMLButtonElement).click() })
      await waitForHeld()
      check(report.writes.filter(write => write === "POST /api/notes").length === beforeInsert + 1, "synchronous AI insert doubleclick saves once")
      await page.evaluate(() => { history.pushState({}, "", "/vault"); dispatchEvent(new PopStateEvent("popstate")) })
      await page.locator(".vault-blocks").waitFor()
      releaseFixtureRequest()
      await page.waitForTimeout(250)
      check(new URL(page.url()).pathname === "/vault", "late AI insert cannot redirect after leaving")
      await page.getByRole("button", { name: "Ask AI about this note", exact: true }).click()
      await aiMenu.getByRole("button", { name: "Explain", exact: true }).click()
      await page.getByRole("button", { name: "Restore previous AI draft", exact: true }).click()
      await page.locator(".learn-block__paragraph").filter({ hasText: "RETAIN_MY_PREVIOUS_REPLY" }).waitFor()
      check(true, "previous AI reply remains recoverable after source handoff")
      await open("/notes?item=notes:qa_cells")
      await page.locator('.studio-writing-scroll [contenteditable="true"]').waitFor()
      await selectPassage('.studio-writing-scroll', 4)
      await page.getByRole("button", { name: "Ask AI", exact: true }).click()
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).waitFor()
      await page.waitForFunction(() => {
        const draft = JSON.parse(localStorage.getItem("learn_ai_tutor_draft_v1") || "{}")
        return draft.sourceTitle === "Cell biology" && draft.sourceContent?.includes("Mitochondria")
      })
      const activeSource = await page.evaluate(() => JSON.parse(localStorage.getItem("learn_ai_tutor_draft_v1") || "{}").sourceContent as string)
      check(!!activeSource && !activeSource.includes("UNSELECTED_SENTINEL"), "Studio Ask AI uses the selected excerpt")
      holdPath = "/api/ai/chat"
      releaseHeld = undefined
      await page.getByRole("button", { name: "Run tutor", exact: true }).click()
      await waitForHeld()
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).fill("NEW_CONTEXT_WHILE_GENERATING")
      releaseFixtureRequest()
      await page.getByRole("button", { name: "Run tutor", exact: true }).waitFor()
      await page.waitForTimeout(250)
      check(await page.getByRole("button", { name: "Save as note", exact: true }).count() === 0 && await page.getByRole("textbox", { name: "AI prompt", exact: true }).inputValue() === "NEW_CONTEXT_WHILE_GENERATING", "held generation never mixes its reply into a newer prompt")
      await open("/vault")
      await chooseVaultNote("qa_prose")
      await page.locator('.vault-blocks [data-source-id="qa_prose"]').evaluate(node => {
        const paragraph = document.createElement("p")
        paragraph.textContent = "Boundaryword ".repeat(700)
        const pageTitle = document.createElement("h2")
        pageTitle.textContent = "First page"
        const tailTitle = document.createElement("h2")
        tailTitle.textContent = "Second page"
        const tail = document.createElement("p")
        tail.textContent = "TAILMUSTNOTLEAK"
        node.replaceChildren(pageTitle, paragraph, document.createElement("hr"), tailTitle, tail)
      })
      await selectPassage('.vault-blocks [data-source-id="qa_prose"]', 3)
      await dock.getByRole("button", { name: "Make slides", exact: true }).click()
      await page.waitForURL(url => url.pathname === "/slides" && url.searchParams.has("design"))
      const longDesign = JSON.stringify(designs.at(-1))
      check(longDesign.includes("Boundaryword") && !longDesign.includes("TAILMUSTNOTLEAK"), "oversized selection cannot leak its uncapped HTML tail into slides")
      check(JSON.stringify(notes) === initialNotes, "source notes remain unchanged")
      check(report.errors.length === 0, `no page errors or unexpected writes: ${report.errors.join(", ")}`)
      await context.close()
      console.log(`${width}/${mode}: ${report.checks.length} checks passed`)
    }
  } finally {
    await browser.close()
    fs.writeFileSync(path.join(output, "results.json"), JSON.stringify(reports, null, 2) + "\n")
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
