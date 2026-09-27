// Profile, Settings and Admin regression audit. Chat and community have dedicated audits.
async (sourcePage) => {
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(sourcePage.url());
  try {
  const origin = page.url().match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)(?:\/|$)/)?.[1]
  if (!origin) throw new Error("Run this audit against the local demo only.")
  const results = []
  const errors = []
  const originalStorage = await page.evaluate(() => ({ ...localStorage }))
  const originalViewport = page.viewportSize()
  const collectError = error => errors.push(error.message)
  page.on("pageerror", collectError)
  const verify = (condition, label) => { if (!condition) throw new Error(label); results.push(label) }
  const open = async path => {
    await page.goto(`${origin}${path}`)
    await page.getByRole("button", { name: "Account: LEARN Admin", exact: true }).waitFor({ state: "attached" })
  }
  const summary = name => page.locator("summary").filter({ hasText: new RegExp(`^${name}$`) })
  const checkWidth = async label => {
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no horizontal overflow`)
  }
  const achievementsPath = "**/api/achievements"
  const providersPath = "**/api/ai/providers*"
  const providerFixture = { id: "qa-provider", name: "Audit provider", provider: "openai", provider_type: "chat", default_model: "qa-model", endpoint_override: "", notes: "", enabled: false, priority: 50, requests_per_minute: 10, max_input_chars: 1000, max_completion_tokens: 500, timeout_ms: 1000, cooldown_seconds: 10, last_status: "untested", last_error: "", has_key: false }
  let deleteRequests = 0
  let testRequests = 0
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route(achievementsPath, route => route.fulfill({ json: { items: [{ id: "qa-badge", name: "Curious mind", description: "Complete your first review.", icon: "star", xp_reward: 25, unlocked: false }] } }))
    await open("/profile")
    const profileSections = page.getByRole("navigation", { name: "Profile sections" })
    await profileSections.getByRole("button", { name: "Shared", exact: true }).waitFor()
    verify(!await page.getByText("Portrait signals", { exact: true }).isVisible(), "Profile has one set of summary stats")
    await profileSections.getByRole("button", { name: /Achievements/ }).click()
    await page.getByRole("heading", { name: "Achievements", exact: true }).waitFor()
    const unlock = page.locator("summary").filter({ hasText: /^To unlock/ })
    await unlock.click()
    const badge = page.locator("details[open] details summary").first()
    await badge.click()
    verify(await page.locator("details[open] details[open] p").first().isVisible(), "Badge requirements available on demand")
    await page.screenshot({ path: "output/playwright/profile-achievements-desktop.png" })
    await open("/settings")
    await page.getByLabel("Name", { exact: true }).waitFor()
    verify(!await page.getByLabel("Website", { exact: true }).isVisible(), "Profile links are collapsed initially")
    await summary("Links").click()
    verify(await page.getByLabel("Website", { exact: true }).isVisible(), "Profile links remain editable")
    await summary("Account details").click()
    verify(await page.getByLabel("Daily goal minutes", { exact: true }).isVisible(), "Daily goal remains accessible")
    const settings = page.getByRole("navigation", { name: "Settings sections" })
    await settings.getByRole("button", { name: "Learning", exact: true }).click()
    verify(!await page.getByLabel("AI max tokens", { exact: true }).isVisible(), "Advanced learning settings collapsed initially")
    await summary("Calendar").click()
    verify(await page.getByLabel("Session · minutes", { exact: true }).isVisible(), "Calendar defaults remain accessible")
    await summary("Notes, AI & feed").click()
    verify(await page.getByLabel("AI max tokens", { exact: true }).isVisible(), "AI limits remain accessible")
    await settings.getByRole("button", { name: "Appearance", exact: true }).click()
    await page.getByRole("button", { name: "Iris accent", exact: true }).click()
    verify(await page.getByRole("button", { name: "Iris accent", exact: true }).getAttribute("aria-pressed") === "true", "Visual accent selection updates")
    await page.getByRole("button", { name: "Dark", exact: true }).click()
    verify(await page.locator("html").evaluate(element => element.classList.contains("dark")), "Dark appearance applies")
    await summary("Personalize").click()
    verify(await page.getByLabel("Workspace name", { exact: true }).isVisible(), "Personal workspace settings available")
    await page.screenshot({ path: "output/playwright/settings-appearance-dark.png" })
    await page.getByRole("button", { name: "Light", exact: true }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await checkWidth("Settings phone")
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route(providersPath, async route => {
      const request = route.request()
      if (request.method() === "GET") return route.fulfill({ json: { items: [providerFixture], presets: [], summary: { totalCount: 1, enabledCount: 0, readyCount: 0, hasDegradedProviders: false, routingOrder: [] } } })
      if (request.method() === "DELETE") { deleteRequests++; return route.fulfill({ status: 500, json: { error: "Audit deletion unavailable" } }) }
      if (request.postDataJSON()?.action === "test") { testRequests++; return route.fulfill({ json: { success: true, message: "Audit connection result preserved" } }) }
      return route.fulfill({ status: 500, json: { error: "Audit save unavailable" } })
    })
    await open("/admin")
    const adminSections = page.getByLabel("Admin sections", { exact: true })
    for (const name of ["Access", "Users", "Audit", "Moderation", "Automation"]) {
      await adminSections.getByRole("button", { name, exact: true }).click()
      await checkWidth(`Admin ${name}`)
    }
    await adminSections.getByRole("button", { name: "Providers", exact: true }).click()
    await page.getByText("Audit provider", { exact: true }).waitFor()
    await page.getByLabel("Actions for Audit provider", { exact: true }).click()
    await page.getByRole("button", { name: "Test", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "Audit connection result preserved" }).waitFor()
    verify(testRequests === 1, "Provider test result survives refresh")
    await page.getByRole("button", { name: "Delete", exact: true }).click()
    verify(deleteRequests === 0, "Provider deletion waits for confirmation")
    await page.getByRole("button", { name: "Confirm delete", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "Audit deletion unavailable" }).waitFor()
    verify(deleteRequests === 1, "Provider deletion errors stay visible")
    await page.getByRole("button", { name: "New", exact: true }).click()
    verify(!await page.getByLabel("Timeout ms", { exact: true }).isVisible(), "Provider limits collapsed initially")
    await summary("Routing & limits").click()
    verify(await page.getByLabel("Timeout ms", { exact: true }).isVisible(), "Provider limits remain editable")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await page.getByRole("status").filter({ hasText: "Audit save unavailable" }).waitFor()
    verify(await page.getByRole("button", { name: "Save", exact: true }).isEnabled(), "Provider save errors release pending state")
    await page.setViewportSize({ width: 390, height: 844 })
    await checkWidth("Provider editor phone")
    await page.screenshot({ path: "output/playwright/admin-provider-phone.png" })
    verify(errors.length === 0, "No uncaught page errors")
    return { passed: results.length, checks: results, pageErrors: errors, mutations: "Provider writes intercepted locally; no account changes saved" }
  } finally {
    await page.unroute(achievementsPath)
    await page.unroute(providersPath)
    page.off("pageerror", collectError)
    await page.evaluate(saved => { localStorage.clear(); Object.entries(saved).forEach(([key, value]) => localStorage.setItem(key, value)) }, originalStorage)
    if (originalViewport) await page.setViewportSize(originalViewport)
  }
  } finally { await context.close(); }
}
