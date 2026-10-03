import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
import { chromium } from "playwright-core"

const DEFAULT_BASE_URL = "https://learn.pagna.workers.dev"
const OUTPUT = path.resolve(".cache/release/browser")
const VIEWPORTS = [
  { width: 1280, height: 800, mode: "Color" },
  { width: 390, height: 844, mode: "Light" },
  { width: 320, height: 700, mode: "Dark" },
]
const report = {
  sourceSha: process.env.GITHUB_SHA || null,
  startedAt: new Date().toISOString(),
  baseUrl: null,
  status: "running",
  testedUrls: [],
  checks: [],
  layouts: [],
  screenshots: [],
  pageErrors: [],
  consoleErrors: [],
  requestFailures: [],
  httpFailures: [],
  blockedWrites: [],
}

function publicUrl(value) {
  try {
    const url = new URL(value)
    return `${url.origin}${url.pathname}`
  } catch {
    return "[invalid URL]"
  }
}

function baseUrl() {
  const url = new URL(process.env.LEARN_SMOKE_BASE_URL || DEFAULT_BASE_URL)
  assert.equal(url.protocol, "https:", "LEARN_SMOKE_BASE_URL must use HTTPS")
  assert(!url.username && !url.password && !url.search && !url.hash, "Base URL must not contain credentials, query, or fragment")
  assert(url.pathname === "/", "LEARN_SMOKE_BASE_URL must be the site origin")
  return url.origin
}

function browserExecutable() {
  const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/google-chrome"
  assert(existsSync(executable), "Chromium is missing: set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to an existing browser executable")
  return executable
}

async function visible(locator) {
  await locator.waitFor({ state: "visible" })
  assert(await locator.isVisible(), "Expected a visible UI control")
}

async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
}

async function layout(page, viewport, surface) {
  await settle(page)
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }))
  report.layouts.push({ viewport, surface, ...dimensions })
  assert(dimensions.documentWidth <= dimensions.viewportWidth + 1, `${surface} overflows horizontally at ${viewport.width}px`)
}

async function screenshot(page, sharp, name) {
  const destination = path.join(OUTPUT, `${name}.jpg`)
  // Capture the fixed viewport only; never allocate a full-page screenshot.
  await sharp(await page.screenshot({ fullPage: false, animations: "disabled" }))
    .resize({ width: 640, withoutEnlargement: true })
    .jpeg({ quality: 65 })
    .toFile(destination)
  report.screenshots.push(`${name}.jpg`)
}

async function appearance(page, mode) {
  const button = page.getByRole("group", { name: "Appearance", exact: true })
    .getByRole("button", { name: mode, exact: true })
  await button.click()
  await page.waitForFunction(value => document.documentElement.classList.contains(value)
    && localStorage.getItem("theme") === value, mode.toLowerCase())
  assert.equal(await button.getAttribute("aria-pressed"), "true")
}

async function editorFlows(page, editor) {
  await editor.getByRole("button", { name: "Open Canvas demo project", exact: true }).click()
  const stage = editor.locator("[data-design-stage]")
  const elements = stage.locator("[data-design-element]")
  const before = await elements.count()
  assert(before > 0, "Canvas must contain real editable elements")
  await editor.getByRole("button", { name: "Add text", exact: true }).click()
  await page.waitForFunction(count => document.querySelectorAll("[data-demo-editor] [data-design-stage] [data-design-element]").length === count, before + 1)
  const textEditor = stage.getByRole("textbox", { name: "Text", exact: true })
  await visible(textEditor)
  assert.equal(await textEditor.inputValue(), "Your next idea", "Inserted text must open in the real editor")
  await editor.getByRole("button", { name: "Undo", exact: true }).click()
  await page.waitForFunction(count => document.querySelectorAll("[data-demo-editor] [data-design-stage] [data-design-element]").length === count, before)
  assert.equal(await stage.locator('[data-design-element^="demo-text"]').count(), 0, "Undo must remove the inserted text")
  report.checks.push("canvas: add text and undo")

  await editor.getByRole("button", { name: "Open Slides demo project", exact: true }).click()
  const secondPage = editor.getByRole("button", { name: "Page 2", exact: true })
  await secondPage.click()
  await visible(editor.getByRole("application", { name: "Design page 2", exact: true }))
  await visible(stage.getByText("An idea takes shape.", { exact: true }))
  assert.equal(await secondPage.getAttribute("aria-current"), "page")
  await editor.getByRole("button", { name: "Page 1", exact: true }).click()
  await visible(editor.getByRole("application", { name: "Design page 1", exact: true }))
  assert.equal(await editor.getByRole("button", { name: "Page 1", exact: true }).getAttribute("aria-current"), "page")
  report.checks.push("slides: switch page 1 to 2 and back")
}

async function authFlow(page, origin, viewport, sharp) {
  await page.goto(`${origin}/login`, { waitUntil: "load" })
  report.testedUrls.push({ viewport: viewport.width, url: `${origin}/login` })
  await visible(page.getByRole("heading", { name: "Welcome back.", exact: true }))
  await visible(page.getByLabel("Username or email", { exact: true }))
  await visible(page.getByLabel("Password", { exact: true }))
  assert(await page.getByRole("button", { name: "Sign in", exact: true }).isDisabled(), "Empty sign-in form must remain disabled")
  await layout(page, viewport, "sign in")
  await page.getByRole("button", { name: "Request access", exact: true }).click()
  await visible(page.getByRole("heading", { name: "Start something good.", exact: true }))
  report.testedUrls.push({ viewport: viewport.width, url: `${origin}/login?mode=request` })
  for (const label of ["Name", "Email"]) await visible(page.getByLabel(label, { exact: true }))
  await visible(page.getByRole("textbox", { name: /^What’s on your mind\?/ }))
  await visible(page.getByRole("radio", { name: "Learner", exact: true }))
  assert(await page.getByRole("button", { name: "Request an invite", exact: true }).isDisabled(), "Empty access request must remain disabled")
  await layout(page, viewport, "request access")
  await screenshot(page, sharp, `request-access-${viewport.width}`)
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await visible(page.getByRole("heading", { name: "Welcome back.", exact: true }))
  report.checks.push(`anonymous auth view switches and labels: ${viewport.width}px`)
}

async function viewportFlow(browser, origin, viewport, sharp) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: "light", serviceWorkers: "block", acceptDownloads: false })
  let collecting = true
  await context.route("**/*", async route => {
    const request = route.request()
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      report.blockedWrites.push({ viewport: viewport.width, method: request.method(), url: publicUrl(request.url()) })
      await route.abort("blockedbyclient")
    } else await route.continue()
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15_000)
  page.setDefaultNavigationTimeout(45_000)
  page.on("pageerror", error => { if (collecting) report.pageErrors.push({ viewport: viewport.width, message: error.message }) })
  page.on("console", message => { if (collecting && message.type() === "error") report.consoleErrors.push({ viewport: viewport.width, message: message.text() }) })
  page.on("requestfailed", request => { if (collecting) report.requestFailures.push({ viewport: viewport.width, url: publicUrl(request.url()), error: request.failure()?.errorText }) })
  page.on("response", response => { if (collecting && response.status() >= 400) report.httpFailures.push({ viewport: viewport.width, url: publicUrl(response.url()), status: response.status() }) })
  try {
    assert.equal((await context.cookies()).length, 0, "Smoke must start anonymously")
    await page.goto(origin, { waitUntil: "load" })
    report.testedUrls.push({ viewport: viewport.width, url: `${origin}/` })
    await visible(page.getByRole("heading", { name: "Learn it. Make it yours.", exact: true }))
    await visible(page.getByRole("navigation", { name: "Public navigation", exact: true }))
    const editor = page.locator("[data-demo-editor]")
    await visible(editor)
    await visible(editor.locator("[data-design-stage]"))
    report.checks.push(`public landing and real editor: ${viewport.width}px`)
    for (const mode of viewport.width === 1280 ? ["Light", "Dark", "Color"] : [viewport.mode]) await appearance(page, mode)
    report.checks.push(`appearance modes: ${viewport.width === 1280 ? "Light, Dark, Color" : viewport.mode} at ${viewport.width}px`)
    if (viewport.width === 1280) await editorFlows(page, editor)
    await layout(page, viewport, "public landing and demo")
    await editor.scrollIntoViewIfNeeded()
    const bounds = await editor.locator("[data-design-stage]").boundingBox()
    assert(bounds && bounds.width > 120 && bounds.height > 80, "Demo stage must remain usable")
    await screenshot(page, sharp, `demo-${viewport.width}`)
    report.checks.push(`responsive landing and editor: ${viewport.width}px`)
    await authFlow(page, origin, viewport, sharp)
  } finally {
    // Our own teardown cancels in-flight requests; do not count those as app failures.
    collecting = false
    await context.close()
  }
}

async function main() {
  await mkdir(OUTPUT, { recursive: true })
  let browser
  try {
    const origin = baseUrl()
    report.baseUrl = origin
    const executablePath = browserExecutable()
    const require = createRequire(import.meta.url)
    const sharp = createRequire(require.resolve("next/package.json"))("sharp")
    browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
    for (const viewport of VIEWPORTS) await viewportFlow(browser, origin, viewport, sharp)
    for (const key of ["pageErrors", "consoleErrors", "requestFailures", "httpFailures", "blockedWrites"]) assert.equal(report[key].length, 0, `${key} recorded: inspect browser/results.json`)
    report.status = "passed"
  } catch (error) {
    report.status = "failed"
    report.failure = error instanceof Error ? error.message : "Browser smoke failed"
    process.exitCode = 1
  } finally {
    if (browser) await browser.close()
    report.completedAt = new Date().toISOString()
    await writeFile(path.join(OUTPUT, "results.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8")
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, report: ".cache/release/browser/results.json", failure: report.failure || null }))
  }
}

await main()
