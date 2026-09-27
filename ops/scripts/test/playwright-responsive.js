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
    for (const [path, label, count] of [["/calendar", "Learning sections", 5], ["/practice", "Practice sections", 4]]) {
      await open(path)
      const buttons = page.getByRole("navigation", { name: label }).getByRole("button")
      verify(await buttons.count() === count, `${label} includes every subpage`)
      for (const button of await buttons.all()) verify(await fits(button), `${label}: ${await button.innerText()} fits at320`)
    }
    await open("/settings")
    const more = page.getByRole("navigation", { name: "Main", exact: true }).getByRole("button", { name: "More", exact: true })
    const dialog = page.getByRole("dialog", { name: "Everything in LEARN" })
    await more.click()
    verify(await dialog.getByRole("button", { name: "Close", exact: true }).evaluate(element => element === document.activeElement), "More puts focus inside the panel")
    verify(await page.evaluate(() => document.body.style.overflow === "hidden"), "More locks the page behind the panel")
    await page.keyboard.press("Shift+Tab")
    verify(await dialog.getByRole("button").last().evaluate(element => element === document.activeElement), "Shift+Tab wraps to the last panel control")
    await page.keyboard.press("Tab")
    verify(await dialog.getByRole("button", { name: "Close", exact: true }).evaluate(element => element === document.activeElement), "Tab wraps to the first panel control")
    await page.keyboard.press("Escape")
    verify(!await dialog.isVisible() && await more.evaluate(element => element === document.activeElement), "Escape closes More and restores trigger focus")
    verify(await page.evaluate(() => document.body.style.overflow !== "hidden"), "Closing More unlocks page scrolling")
    await more.click()
    await page.setViewportSize({ width: 1024, height: 768 })
    await dialog.waitFor({ state: "detached" })
    verify(await page.evaluate(() => document.body.style.overflow !== "hidden"), "Resizing to desktop closes More and unlocks scrolling")
    await page.setViewportSize({ width: 740, height: 320 })
    await more.click()
    verify(await dialog.locator(".learn-pop-in").evaluate(element => element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto"), "More remains scrollable in short landscape windows")
    await page.screenshot({ path: "output/playwright/responsive/more-landscape.png" })
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
