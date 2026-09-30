/** Read-only migration QA. Auth state and fixtures stay outside Git; every API write is mocked. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium, type BrowserContext, type Page } from "playwright-core"
import type { DesignDoc } from "../../../src/lib/design/document"

const [width = "1280", height = "800", scope = "all"] = process.argv.slice(2)
const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
const fixtures = process.env.LEARN_QA_FIXTURES
const storageState = process.env.LEARN_QA_STORAGE_STATE
assert.ok(fixtures && storageState, "Set LEARN_QA_FIXTURES and LEARN_QA_STORAGE_STATE to private probe fixtures and browser auth state.")
const output = process.env.LEARN_QA_OUTPUT || path.resolve(".cache/design-review/takeover")
fs.mkdirSync(output, { recursive: true })
const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
const sharp = requireFromNext("sharp") as (input: Buffer) => { resize(options: { width: number; withoutEnlargement: boolean }): { jpeg(options: { quality: number }): { toFile(file: string): Promise<unknown> } } }
const wanted = (name: string) => scope === "all" || scope.split(",").includes(name)
const deckTitle = "Slides design review"
type SavedRecord = { id: string; title: string; content: DesignDoc }
type Result = { name: string; passed: boolean; error?: string; writes: string[]; pages?: number; format?: string }

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  const results: Result[] = []
  async function run(name: string, body: (page: Page, saved: Map<string, SavedRecord>) => Promise<void>, seed = false) {
    const context: BrowserContext = await browser.newContext({ viewport: { width: Number(width), height: Number(height) }, serviceWorkers: "block", storageState })
    const saved = new Map<string, SavedRecord>()
    const uploads = new Map<string, Buffer>()
    const writes: string[] = []
    const errors: string[] = []
    await context.route("**/api/**", async route => {
      const request = route.request()
      const url = new URL(request.url())
      const method = request.method()
      const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
      const download = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/)
      if (method === "GET" && download && uploads.has(download[1])) return route.fulfill({ status: 200, contentType: "image/png", body: uploads.get(download[1]) })
      const id = url.searchParams.get("id")
      if (method === "GET" && url.pathname === "/api/canvas" && id && saved.has(id)) return json({ item: saved.get(id) })
      if (method === "GET") return route.continue()
      writes.push(`${method} ${url.pathname}`)
      if (method === "POST" && url.pathname === "/api/files") {
        const id = `qa_file_${uploads.size + 1}`
        uploads.set(id, fs.readFileSync(path.join(fixtures!, "sample.png")))
        return json({ file: { id, filename: `${id}.png` } })
      }
      if ((method === "PUT" || method === "POST") && url.pathname === "/api/canvas") {
        const record = request.postDataJSON() as SavedRecord
        saved.set(record.id, record)
        return json({ item: record })
      }
      if (method === "PUT" && url.pathname === "/api/docs") return json({ item: request.postDataJSON() })
      return route.abort()
    })
    await context.addInitScript(seed => {
      localStorage.setItem("theme", "color")
      if (seed && !sessionStorage.getItem("qa-seeded")) {
        sessionStorage.setItem("qa-seeded", "1")
        localStorage.setItem("learn_studio_drafts_v1", JSON.stringify({ slides: { kind: "slides", title: "Probe deck", slides: [{ title: "Probe one", body: "First point" }, { title: "Probe two", body: "Second point" }], updatedAt: new Date().toISOString() } }))
      }
    }, seed)
    const page = await context.newPage()
    page.on("pageerror", error => errors.push(error.message))
    let failure: string | undefined
    try { await body(page, saved); assert.deepEqual(errors, [], "no uncaught page errors") }
    catch (error) { failure = error instanceof Error ? error.message : String(error) }
    const last = [...saved.values()].at(-1)
    const result = { name, passed: !failure, ...(failure ? { error: failure.slice(0, 700) } : {}), writes, pages: last?.content.pages.length, format: last?.content.format }
    results.push(result)
    console.log(JSON.stringify(result))
    await context.close()
  }
  async function openDocs(page: Page) {
    await page.goto(`${base}/docs`, { waitUntil: "domcontentloaded" })
    await page.locator('section[aria-label="Project library"]').waitFor({ timeout: 60000 })
    await page.locator('.studio-card[data-project-kind="slides"]').first().waitFor({ timeout: 30000 })
  }
  async function landed(page: Page, name: string) {
    await page.waitForURL(/\/slides\?design=/, { timeout: 30000 })
    await page.locator("[data-design-stage]").waitFor({ timeout: 30000 })
    assert.ok(await page.getByRole("button", { name: "Present", exact: true }).isVisible())
    assert.equal(await page.getByText("Slide zoom", { exact: true }).count(), 0)
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no document overflow")
    await sharp(await page.screenshot()).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(output, `migration-${width}-${name}.jpg`))
  }
  const deckCard = (page: Page) => page.locator('.studio-card[data-project-kind="slides"]', { hasText: deckTitle }).first()
  try {
    if (wanted("deck")) await run("deck", async page => { await openDocs(page); await deckCard(page).click(); await landed(page, "deck") })
    if (wanted("draft")) await run("draft", async (page, saved) => {
      await openDocs(page)
      await page.waitForFunction(() => !JSON.parse(localStorage.getItem("learn_studio_drafts_v1") || "{}").slides)
      assert.equal(saved.size, 1, "one recovered design, including Strict Mode")
      assert.equal([...saved.values()][0].content.pages.length, 2)
      await page.getByRole("status").filter({ hasText: "Unsaved slides moved" }).waitFor({ state: "visible" })
    }, true)
    if (wanted("new")) await run("new", async (page, saved) => {
      await openDocs(page); await page.getByRole("button", { name: "New project" }).click()
      await page.getByRole("button", { name: /PPT classic 4:3/ }).click()
      await page.locator('section[aria-label="Project library"]').getByRole("button", { name: "Create", exact: true }).click()
      await landed(page, "new"); assert.equal([...saved.values()].at(-1)?.content.format, "presentation-4-3")
    })
    if (wanted("template")) await run("template", async (page, saved) => {
      await openDocs(page); await page.getByRole("button", { name: "All designs" }).click()
      await page.getByRole("menuitem", { name: /^PPT . Slides/ }).first().click()
      await page.locator("button", { hasText: "Lesson" }).first().click()
      await landed(page, "template"); assert.equal([...saved.values()].at(-1)?.content.pages.length, 4)
    })
    if (wanted("copy")) await run("copy", async page => {
      await openDocs(page); await deckCard(page).locator("xpath=..").getByRole("button", { name: "Actions" }).click()
      await page.getByRole("menuitem", { name: "Duplicate", exact: true }).click(); await landed(page, "copy")
    })
    if (wanted("pptx")) await run("pptx", async (page, saved) => {
      await openDocs(page)
      const chooser = page.waitForEvent("filechooser")
      await page.getByText("Import PPTX or PDF", { exact: true }).click()
      await (await chooser).setFiles(path.join(fixtures!, "sample.pptx"))
      await landed(page, "pptx"); assert.equal([...saved.values()].at(-1)?.content.pages.length, 2)
    })
    if (wanted("library")) await run("library", async page => {
      await openDocs(page); await page.locator('.studio-card[data-project-kind="docs"]').first().click()
      await page.getByRole("button", { name: "Library", exact: true }).click()
      await page.getByRole("button", { name: "Projects", exact: true }).click()
      await page.locator(".studio-library-panel button", { hasText: deckTitle }).first().click()
      await landed(page, "library")
    })
  } finally { await browser.close() }
  fs.writeFileSync(path.join(output, `migration-${width}-${scope}.json`), JSON.stringify({ viewport: [Number(width), Number(height)], results }, null, 2))
  assert.ok(results.length > 0, "at least one path checked")
  assert.ok(results.every(result => result.passed), "all migration paths must pass")
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
