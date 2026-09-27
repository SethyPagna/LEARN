// Run in an authenticated local Playwright CLI session with run-code --filename.
async (sourcePage) => {
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(sourcePage.url());
  try {
  const origin = page.url().match(/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/|$)/)?.[0]
  if (!origin) throw new Error("Local demo only")
  const results = []
  const originalViewport = page.viewportSize()
  const verify = (condition, message) => { if (!condition) throw new Error(message); results.push(message) }
  const open = async path => {
    await page.goto(`${origin}${path}`)
    await page.getByRole("button", { name: "Account: LEARN Admin", exact: true }).waitFor({ state: "attached" })
  }
  const fits = async locator => locator.evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.left >= 0 && box.right <= innerWidth && box.width > 0
  })
  try {
    await page.setViewportSize({ width: 320, height: 740 })
    await open("/settings")
    const sections = page.getByRole("navigation", { name: "Settings sections" })
    for (const name of ["Profile", "Appearance", "Learning", "Privacy"]) {
      const button = sections.getByRole("button", { name, exact: true })
      verify(await fits(button), `Settings ${name} is visible without sideways scrolling at320`)
      await button.click()
      verify(await button.getAttribute("aria-current") === "page", `Settings ${name} opens`)
      verify(await page.locator(".settings-content").evaluate(element => element.scrollWidth <= element.clientWidth), `Settings ${name} content fits`)
    }
    await page.screenshot({ path: "output/playwright/responsive/settings-320.png", fullPage: true })
    // One tab row per place (the admin sees Admin under Me).
    for (const [path, label, count] of [["/calendar", "Today sections", 4], ["/vault", "Create sections", 3], ["/practice", "Practice sections", 5], ["/chat", "Friends sections", 5], ["/settings", "Me sections", 3]]) {
      await open(path)
      const buttons = page.getByRole("navigation", { name: label }).getByRole("button")
      verify(await buttons.count() === count, `${label} includes every subpage`)
      for (const button of await buttons.all()) verify(await fits(button), `${label}: ${await button.innerText()} fits at320`)
    }
    // The phone dock holds the five places and nothing else; "What's where?" lives in the account menu.
    await open("/settings")
    const dock = page.getByRole("navigation", { name: "Main", exact: true })
    verify(JSON.stringify(await dock.getByRole("button").allInnerTexts()) === JSON.stringify(["Today", "Create", "Practice", "Friends", "Me"]), "The dock lists the five places")
    verify(await dock.getByRole("button", { name: "Me", exact: true }).getAttribute("aria-current") === "true", "Settings lights up Me in the dock")
    for (const button of await dock.getByRole("button").all()) verify(await fits(button), `Dock: ${await button.innerText()} fits at320`)
    const account = page.getByRole("button", { name: "Account: LEARN Admin", exact: true }).filter({ visible: true })
    await account.click()
    await page.getByRole("dialog", { name: "Account and preferences" }).getByRole("button", { name: "What's where?", exact: true }).click()
    const guide = page.getByRole("dialog", { name: "What's where" })
    verify(await guide.evaluate(element => element.contains(document.activeElement)), "What's where puts focus inside the guide")
    await page.keyboard.press("Escape")
    await guide.waitFor({ state: "detached" })
    verify(true, "Escape closes What's where")
    await page.setViewportSize({ width: 740, height: 320 })
    await account.click()
    await page.getByRole("dialog", { name: "Account and preferences" }).getByRole("button", { name: "What's where?", exact: true }).click()
    verify(await guide.locator("xpath=..").evaluate(element => element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto"), "What's where scrolls in short landscape windows")
    await page.screenshot({ path: "output/playwright/responsive/guide-landscape.png" })
    await page.keyboard.press("Escape")
    await page.setViewportSize({ width: 390, height: 844 })
    await open("/settings")
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.getByRole("navigation", { name: "Main", exact: true }).getByRole("button", { name: "Practice", exact: true }).click()
    await page.waitForURL("**/practice")
    verify(await page.evaluate(() => window.scrollY === 0), "Changing pages resets the previous page scroll position")
    return { passed: results.length, checks: results }
  } finally {
    await page.keyboard.press("Escape")
    if (originalViewport) await page.setViewportSize(originalViewport)
  }
  } finally { await context.close(); }
}
