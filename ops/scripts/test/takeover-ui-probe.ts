/** Local fixture UI QA: API traffic is intercepted; no workspace data is read or written. */
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { chromium, type Page } from "playwright-core"
import type { User } from "../../../src/components/learn/types"

const base = process.env.LEARN_QA_BASE_URL || "http://localhost:3000"
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Run only against a local preview.")
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
      const context = await browser.newContext({ viewport: { width, height }, serviceWorkers: "block" })
      await context.addCookies([{ name: "learn_sidebar", value: "expanded", url: base }])
      await context.addInitScript(mode => localStorage.setItem("theme", mode), mode)
      let savedUser: User = { id: "qa_local", username: "qa", name: "QA Learner", email: "qa@learn.local", role: "admin", profileVisibility: "private", metrics: { xpTotal: 0, streakCurrent: 0, streakLongest: 0, streakFreezesAvailable: 0 }, preferences: { dailyReviewCap: 0, restDay: "monday", workspaceOptions: { dailyReviewCap: 0, restDay: "monday", workspaceName: "QA Studio" } } }
      let lastProfilePayload: Record<string, unknown> | undefined
      let failProfileSave = false
      let holdProfileSave = false
      let releaseProfileSave: (() => void) | undefined
      let holdPublicProfile = false
      let releasePublicProfile: (() => void) | undefined
      let holdCreation = false
      let releaseCreation: (() => void) | undefined
      const projects: Record<string, Record<string, unknown>[]> = { notes: [], docs: [], sheets: [], canvas: [] }
      const report = { width, mode, routes: 0, interactions: 0, writes: [] as string[], errors: [] as string[] }
      reports.push(report)
      const check = (condition: unknown, message: string) => { assert.ok(condition, message); report.interactions++ }
      await context.route("**/api/**", async route => {
        const request = route.request()
        const url = new URL(request.url())
        const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) })
        if (request.method() === "GET") {
          if (url.pathname === "/api/auth/session") return json({ user: savedUser, databaseConfigured: true })
          if (url.pathname === "/api/today") return json({ firstName: "QA", today: "2026-10-01", streak: { streak: 0, studiedToday: false, week: Array.from({ length: 7 }, (_, index) => ({ day: new Date(Date.UTC(2026, 8, 25 + index)).toISOString().slice(0, 10), active: false })) }, reviewsDue: 0, restDay: false, projects: [], liveGame: null })
          const projectKind = url.pathname.split("/").at(-1) || ""
          if (Object.hasOwn(projects, projectKind)) return json({ items: projects[projectKind], item: projects[projectKind].find(item => item.id === url.searchParams.get("id")) })
          if (url.pathname === "/api/quizzes") return json({ items: [{ id: "qa_quiz", title: "Visual practice", topic: "Design", question_count: 1 }] })
          if (url.pathname === "/api/quizzes/qa_quiz") return json({ item: { id: "qa_quiz", title: "Visual practice", topic: "Design", questions: [{ id: "qa_question", question: "Pick a colour", choices: [{ id: "a", text: "Blue" }, { id: "b", text: "Red" }], correctAnswerId: "a", type: "mcq" }] } })
          if (url.pathname === "/api/dashboard") return json({ user: savedUser, snapshot: { weakTopics: [], recommendedFocus: [], recentNotes: [], goalCompletion: 0 }, notes: [], goals: [], chats: [], attempts: [], files: [] })
          if (url.pathname === "/api/profile/public") {
            const item = { id: savedUser.id, username: savedUser.username, name: savedUser.name, bio: savedUser.bio || "", avatar_url: savedUser.avatarUrl || "", profile_visibility: savedUser.profileVisibility, viewer: "owner", metrics: { xp: 0, streak: 0, longestStreak: 0, reputation: 0 }, artifacts: [] }
            if (holdPublicProfile) { holdPublicProfile = false; await new Promise<void>(resolve => { releasePublicProfile = resolve }) }
            return json({ item })
          }
          if (url.pathname === "/api/calendar/connected-events") return json({ results: [], checkedAt: new Date().toISOString() })
          if (url.pathname === "/api/vault/graph" || url.pathname === "/api/knowledge/graph") return json({ nodes: [], edges: [], orphanNodes: [] })
          if (url.pathname === "/api/admin") return json({ users: [], providers: [], audit: [], counters: {} })
          if (url.pathname === "/api/automation") return json({ jobs: [], prompts: [] })
          if (url.pathname === "/api/ai/providers") return json({ items: [], catalog: [], presets: [] })
          return json({ items: [], files: [], connections: [], notifications: [], stories: [], groups: [], nodes: [], edges: [], orphanNodes: [], remainingDueCount: 0, unreadCount: 0 })
        }
        report.writes.push(`${request.method()} ${url.pathname}`)
        const projectKind = url.pathname.split("/").at(-1) || ""
        if (request.method() === "POST" && Object.hasOwn(projects, projectKind)) {
          if (holdCreation) { holdCreation = false; await new Promise<void>(resolve => { releaseCreation = resolve }) }
          const item = { id: `qa_${projectKind}_${projects[projectKind].length}`, ...request.postDataJSON(), updated_at: "2026-10-01T00:00:00Z" }
          projects[projectKind].push(item)
          return json({ item })
        }
        if (url.pathname === "/api/profile" && request.method() === "PUT") {
          if (holdProfileSave) {
            holdProfileSave = false
            await new Promise<void>(resolve => { releaseProfileSave = resolve })
          }
          if (failProfileSave) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "QA save failed" }) })
          const body = request.postDataJSON() as Partial<User> & { profileVisibility: User["profileVisibility"] }
          lastProfilePayload = body
          savedUser = { ...savedUser, ...body, preferences: { ...savedUser.preferences, ...body.preferences } }
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ user: savedUser }) })
        }
        report.errors.push(`Unexpected mutation blocked: ${request.method()} ${url.pathname}`)
        return route.abort()
      })
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      page.on("pageerror", error => report.errors.push(error.message))
      page.on("console", message => { if (message.type() === "error" && /Route error:|hydration|Minified React error|TypeError|ReferenceError/i.test(message.text())) report.errors.push(message.text()) })
      const open = async (route: string) => {
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded" })
        await page.locator(".learn-app").waitFor({ timeout: 60000 })
        await page.locator('.account-profile-link').first().waitFor({ state: "visible" })
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached" })
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
      await open("/practice")
      check(await page.getByRole("button", { name: "Review", exact: true }).count() === 1, "one compact Review shortcut")
      check(await page.getByRole("button", { name: "Sprint", exact: true }).count() === 0, "Sprint uses its section tab")
      await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
      const create = page.getByRole("menu", { name: "Create something new", exact: true })
      await create.waitFor()
      check(await create.count() === 1, "launcher opens one Add menu")
      await create.getByRole("menuitem", { name: "Note", exact: true }).focus()
      await page.keyboard.press("Tab")
      check(await create.getByRole("menuitem", { name: "Doc", exact: true }).evaluate(node => node === document.activeElement), "Tab follows the focused Add entry")
      await page.keyboard.press("Enter")
      await page.getByRole("textbox", { name: "Project title", exact: true }).waitFor()
      check(report.writes.filter(write => write === "POST /api/docs").length === 1 && !report.writes.includes("POST /api/notes"), "Enter creates only the focused Doc")
      const createdWrites = report.writes.length
      await page.reload({ waitUntil: "domcontentloaded" })
      await page.getByRole("textbox", { name: "Project title", exact: true }).waitFor()
      check(report.writes.length === createdWrites, "refresh does not recreate a project")
      await fit("Created Doc")
      for (const [label, endpoint, pathname] of [["Note", "notes", "/notes"], ["Sheet", "sheets", "/sheets"], ["Deck", "canvas", "/slides"]] as const) {
        await open("/practice")
        const previous = report.writes.length
        await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
        await create.getByRole("menuitem", { name: label, exact: true }).click()
        await page.waitForURL(url => url.pathname === pathname && /(?:item|design)=/.test(url.search))
        await page.locator('.account-controls[aria-busy="false"]').waitFor({ state: "attached" })
        check(report.writes.slice(previous).filter(write => write === `POST /api/${endpoint}`).length === 1, `${label} creates once through its real creator`)
        await fit(`Created ${label}`)
      }
      await open("/practice")
      let beforeSetup = report.writes.length
      await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
      await create.getByRole("menuitem", { name: "Canvas", exact: true }).click()
      await page.getByRole("heading", { name: "New canvas", exact: true }).waitFor()
      check(report.writes.length === beforeSetup, "Canvas opens a size picker without creating prematurely")
      await fit("Canvas picker")
      await open("/ai")
      await page.getByRole("textbox", { name: "AI prompt", exact: true }).fill("Previous prompt")
      await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
      await create.getByRole("menuitem", { name: "Quiz", exact: true }).click()
      await page.waitForFunction(() => (document.querySelector('textarea[aria-label="AI prompt"]') as HTMLTextAreaElement | null)?.value.startsWith("Generate a mixed practice set"))
      check(report.writes.length === beforeSetup, "Quiz refreshes setup while already in AI without a generation request")
      await fit("Quiz setup")
      await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
      await create.getByRole("menuitem", { name: "Host live game", exact: true }).click()
      await page.getByRole("heading", { name: "Host", exact: true }).waitFor()
      check(report.writes.length === beforeSetup, "Live opens host setup without starting or joining a game")
      await fit("Live setup")
      await open("/practice")
      beforeSetup = report.writes.length
      holdCreation = true
      await page.evaluate(() => window.dispatchEvent(new Event("learn:create-menu")))
      await create.getByRole("menuitem", { name: "Doc", exact: true }).click()
      await page.waitForURL(url => url.pathname === "/studio")
      await page.locator('.page-sections button[data-section="files"]').click()
      await page.waitForURL(url => url.pathname === "/files")
      check(releaseCreation, "pending creator request is held")
      releaseCreation?.()
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)))
      check(new URL(page.url()).pathname === "/files", "late creation does not pull users back from Files")
      await page.goBack({ waitUntil: "domcontentloaded" })
      await page.locator('.learn-app').waitFor()
      check(report.writes.length === beforeSetup + 1, "Back does not replay the Add intent")
      await open("/settings?section=learning")
      const settings = page.locator(".settings-content")
      check(await settings.getByLabel("Daily review cap", { exact: true }).inputValue() === "0", "fresh browser loads the saved zero review cap")
      check(await settings.getByRole("combobox", { name: /^Rest day/ }).inputValue() === "monday", "fresh browser loads the saved rest day")
      await settings.getByLabel("Daily review cap", { exact: true }).fill("2")
      await settings.getByRole("combobox", { name: /^Rest day/ }).selectOption("friday")
      await settings.getByRole("button", { name: "Save settings", exact: true }).click()
      await settings.getByRole("status").filter({ hasText: "Settings saved" }).waitFor()
      check(savedUser.preferences.dailyReviewCap === 2 && savedUser.preferences.restDay === "friday", "Learning changes persist the server review policy")
      check(lastProfilePayload && !Object.hasOwn(lastProfilePayload, "name") && !Object.hasOwn(lastProfilePayload, "avatarUrl"), "Settings saves do not send copied identity fields")
      check(await settings.getByRole("button", { name: "Save settings", exact: true }).isDisabled(), "saved settings become clean")
      const help = page.getByRole("button", { name: "About Practice", exact: true })
      await help.click()
      const helpPanel = page.getByRole("dialog", { name: "About Practice", exact: true })
      await helpPanel.waitFor()
      const helpBox = await helpPanel.boundingBox()
      check(helpBox && helpBox.x >= 0 && helpBox.x + helpBox.width <= width && helpBox.y >= 0 && helpBox.y + helpBox.height <= height, "section help fits viewport")
      await page.keyboard.press("Escape")
      check(await helpPanel.count() === 0 && await help.evaluate(node => node === document.activeElement), "help closes with Escape and returns focus")
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
      check(await page.getByRole("button", { name: "Account options", exact: true }).count() === 0, "no repeated account ellipsis")
      check(await page.getByRole("button", { name: "Your account", exact: true }).count() === 1, "one avatar trigger")
      const options = page.getByRole("button", { name: "Your account", exact: true })
      if (width >= 1024) { await options.focus(); await page.keyboard.press("Enter") }
      else { await options.click() }
      const popup = page.getByRole("dialog", { name: "Account and preferences", exact: true })
      try { await popup.waitFor() } catch (error) {
        console.log(JSON.stringify({ optionsExpanded: await options.getAttribute("aria-expanded"), popups: await page.locator('[role="dialog"]').evaluateAll(nodes => nodes.map(node => ({ label: node.getAttribute("aria-label"), style: node.getAttribute("style") }))) }))
        throw error
      }
      const box = await popup.boundingBox()
      check(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1, "account popup fits viewport")
      await sharp(await page.screenshot()).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(output, `account-${width}-${mode}.jpg`))
      await page.waitForFunction(() => document.activeElement?.closest('[role="dialog"]')?.getAttribute("aria-label") === "Account and preferences")
      report.interactions++
      await page.keyboard.press("Escape")
      check(await popup.count() === 0, "Escape closes options")
      check(await options.evaluate(node => node === document.activeElement), "Escape returns focus to options")
      await options.click()
      await popup.getByRole("button", { name: "Edit profile", exact: true }).click()
      const inlineForm = popup.getByRole("form", { name: "Edit profile", exact: true })
      await inlineForm.getByLabel("Name", { exact: true }).fill("QA inline identity")
      failProfileSave = true
      await inlineForm.getByRole("button", { name: "Save", exact: true }).click()
      await inlineForm.getByRole("status").filter({ hasText: "QA save failed" }).waitFor()
      await page.keyboard.press("Escape")
      await options.click()
      check(await inlineForm.getByLabel("Name", { exact: true }).inputValue() === "QA inline identity", "failed inline draft survives closing account")
      await page.waitForFunction(() => Boolean(document.activeElement?.closest('form[aria-label="Edit profile"]')))
      check(true, "reopened draft receives keyboard focus")
      await sharp(await page.screenshot()).resize({ width: 720, withoutEnlargement: true }).jpeg({ quality: 72 }).toFile(path.join(output, `account-edit-${width}-${mode}.jpg`))
      if (width === 1280) {
        await page.setViewportSize({ width: 390, height: 844 })
        await page.getByRole("button", { name: "Your account", exact: true }).click()
        check(await inlineForm.getByLabel("Name", { exact: true }).inputValue() === "QA inline identity", "draft survives account relocation to phone header")
        await page.setViewportSize({ width, height })
        await page.getByRole("button", { name: "Your account", exact: true }).click()
        check(await inlineForm.getByLabel("Name", { exact: true }).inputValue() === "QA inline identity", "draft survives account relocation to sidebar")
      }
      failProfileSave = false
      await inlineForm.getByRole("button", { name: "Save", exact: true }).click()
      await popup.getByRole("status").filter({ hasText: "Profile saved" }).waitFor()
      check(await popup.getByText("QA inline identity", { exact: true }).count() === 1, "inline save updates account")
      check(await popup.getByRole("button", { name: "Edit profile", exact: true }).evaluate(node => node === document.activeElement), "inline save returns focus to edit")
      await page.keyboard.press("Escape")
      await open("/settings?section=profile")
      await settings.getByRole("button", { name: "Edit profile", exact: true }).click()
      const settingsForm = settings.getByRole("form", { name: "Edit profile", exact: true })
      await settingsForm.getByLabel("Name", { exact: true }).fill("QA Settings identity")
      await settingsForm.getByRole("button", { name: "Save", exact: true }).click()
      await settings.getByRole("status").filter({ hasText: "Profile saved" }).waitFor()
      await page.getByRole("button", { name: "Your account", exact: true }).click()
      check(await popup.getByText("QA Settings identity", { exact: true }).count() === 1, "Settings shared editor updates the account identity")
      await page.keyboard.press("Escape")
      holdPublicProfile = true
      await open("/profile")
      await page.getByRole("region", { name: "Your profile", exact: true }).waitFor()
      check(new URL(page.url()).pathname === "/profile", "direct profile remains reachable")
      const profile = page.getByRole("region", { name: "Your profile", exact: true })
      await page.getByRole("button", { name: "Your account", exact: true }).click()
      await popup.getByRole("button", { name: "Edit profile", exact: true }).click()
      await inlineForm.getByLabel("Name", { exact: true }).fill("QA after delayed fetch")
      await inlineForm.getByRole("button", { name: "Save", exact: true }).click()
      await popup.getByRole("status").filter({ hasText: "Profile saved" }).waitFor()
      check(releasePublicProfile, "old public profile response is held")
      releasePublicProfile?.()
      await page.keyboard.press("Escape")
      await profile.getByRole("heading", { name: "QA after delayed fetch", exact: true }).waitFor()
      check(true, "late public profile response preserves the newer saved identity")
      check(await profile.getByText("0 XP", { exact: true }).count() === 1, "zero profile metrics finish loading without inventing progress")
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
      await page.getByRole("button", { name: "Your account", exact: true }).click()
      check(await page.getByRole("dialog", { name: "Account and preferences" }).getByText("QA profile preview", { exact: true }).count() === 1, "saved identity updates account immediately")
      await page.keyboard.press("Escape")
      await profile.getByRole("button", { name: "Edit profile", exact: true }).click()
      await form.getByLabel("Name", { exact: true }).fill("QA pending save")
      const priorSaveCount = report.writes.filter(write => write === "PUT /api/profile").length
      holdProfileSave = true
      await form.getByRole("button", { name: "Save", exact: true }).click()
      await page.waitForFunction(() => document.querySelector('section[aria-label="Your profile"] fieldset:disabled') !== null)
      await page.getByRole("button", { name: "Your account", exact: true }).click()
      await popup.getByRole("button", { name: "Edit profile", exact: true }).click()
      await inlineForm.getByLabel("Name", { exact: true }).fill("QA latest identity")
      await inlineForm.getByRole("button", { name: "Save", exact: true }).click()
      await inlineForm.getByRole("status").filter({ hasText: /saving|progress/i }).waitFor()
      check(report.writes.filter(write => write === "PUT /api/profile").length === priorSaveCount + 1, "two editors cannot send overlapping profile writes")
      check(await inlineForm.getByLabel("Name", { exact: true }).inputValue() === "QA latest identity", "blocked overlapping save retains draft")
      check(releaseProfileSave, "first profile request is held")
      releaseProfileSave?.()
      await profile.getByRole("heading", { name: "QA pending save", exact: true }).waitFor()
      await inlineForm.getByRole("button", { name: "Save", exact: true }).click()
      await popup.getByRole("status").filter({ hasText: "Profile saved" }).waitFor()
      check(await profile.getByRole("heading", { name: "QA latest identity", exact: true }).count() === 1, "next save updates profile and account consistently")
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
