/** Run the checked-in anonymous public audit with the existing browser runtime. */
import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { chromium, type Page } from "playwright-core"

interface PublicReport {
  layoutsPassed: number
  interactionChecks: number
  reports: Record<string, unknown>
}

const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
const output = path.resolve(process.env.LEARN_QA_OUTPUT || ".cache/design-review/takeover")
const blockedWrites: { method: string; url: string }[] = []
let report: PublicReport | undefined

function saveReport(value: unknown) {
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, "public-results.json"), JSON.stringify(value, null, 2))
}

async function main() {
  // The shared audit navigates this exact origin internally.
  if (!/^http:\/\/localhost:3000\/?$/.test(base)) throw new Error("Use the local preview at http://localhost:3000; the public audit uses that origin.")
  const browser = await chromium.launch({ channel: "chrome", headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" })
    // The audit's page routes fulfill fixture writes first; unmatched writes never reach a server.
    await context.route("**/*", route => {
      const request = route.request()
      if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return route.continue()
      blockedWrites.push({ method: request.method(), url: request.url() })
      return route.abort()
    })
    const page = await context.newPage()
    const screenshot = page.screenshot.bind(page)
    page.screenshot = async (options = {}) => {
      if (process.env.LEARN_QA_SHOTS !== "1") return Buffer.alloc(0)
      return screenshot({ ...options, path: path.join(output, "screenshots", path.basename(options.path || "public.png")) })
    }
    await page.goto(base)
    // Only the repository's trusted test function is evaluated, never page or remote content.
    const audit = vm.runInThisContext(`(${fs.readFileSync(path.resolve("ops/scripts/test/playwright-public.js"), "utf8")})`) as (page: Page) => Promise<PublicReport>
    report = await audit(page)
    if (blockedWrites.length) throw new Error("The public audit attempted an unmatched write; see blockedWrites in public-results.json.")
    saveReport({ ...report, blockedWrites })
    console.log(JSON.stringify({ layoutsPassed: report.layoutsPassed, interactionChecks: report.interactionChecks, blockedWrites }))
  } finally { await browser.close() }
}

main().catch(error => {
  const message = error instanceof Error ? error.message : String(error)
  saveReport({ ...report, error: message, blockedWrites })
  console.error(message)
  process.exitCode = 1
})
