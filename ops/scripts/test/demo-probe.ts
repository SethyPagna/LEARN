/** Run the shared CLI probe without installing an additional browser runner. */
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { createRequire } from "node:module"
import { chromium, type Page } from "playwright-core"

interface DemoReport {
  checks: string[]
  layouts: unknown[]
  downloads: unknown[]
  errors: string[]
  apiWrites: unknown[]
}

const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
const output = process.env.LEARN_QA_OUTPUT || path.resolve(".cache/design-review/takeover")

async function main() {
  if (!/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?$/.test(base)) throw new Error("Use a local development server.")
  fs.mkdirSync(output, { recursive: true })
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" })
    await context.route("**/api/**", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method()) ? route.continue() : route.abort())
    const page = await context.newPage()
    await page.goto(base)
    // This is our checked-in test function, never page content or a remote script.
    const probe = vm.runInThisContext(`(${fs.readFileSync(path.resolve("ops/scripts/test/playwright-demo.js"), "utf8")})`) as (page: Page) => Promise<DemoReport>
    const report = await probe(page)
    fs.writeFileSync(path.join(output, "demo-results.json"), JSON.stringify(report, null, 2))
    if (process.env.LEARN_QA_SHOTS === "1") {
      const requireFromNext = createRequire(createRequire(path.resolve("package.json")).resolve("next/package.json"))
      const sharp = requireFromNext("sharp") as (input: Buffer) => { resize(options: { width: number; withoutEnlargement: boolean }): { jpeg(options: { quality: number }): { toFile(file: string): Promise<unknown> } } }
      for (const [width, height, mode] of [[1280, 800, "color"], [390, 844, "light"], [320, 700, "dark"]] as const) {
        await page.setViewportSize({ width, height })
        await page.getByRole("group", { name: "Appearance", exact: true }).getByRole("button", { name: new RegExp(`^${mode}$`, "i") }).click()
        await page.locator('[data-demo-editor] [data-design-stage]').waitFor()
        await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))) })
        await sharp(await page.locator("[data-demo-editor]").screenshot()).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 75 }).toFile(path.join(output, `demo-${width}-${mode}.jpg`))
      }
    }
    console.log(JSON.stringify({ checks: report.checks.length, layouts: report.layouts.length, downloads: report.downloads, errors: report.errors, writes: report.apiWrites }))
  } finally { await browser.close() }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
