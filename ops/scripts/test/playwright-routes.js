// Run in an authenticated local Playwright CLI session with run-code --filename.
async (sourcePage) => {
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(sourcePage.url());
  try {
  const { origin, hostname } = await page.evaluate(() => ({ origin: location.origin, hostname: location.hostname }));
  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error('Run this audit against the local development server.');
  }
  const routes = ['dashboard', 'studio', 'canvas', 'notes', 'docs', 'sheets', 'slides', 'files', 'ai', 'calendar', 'vault', 'progress', 'graph', 'feed', 'discover', 'practice', 'quizzes', 'live', 'games', 'reviews', 'social', 'chat', 'spaces', 'groups', 'rooms', 'battles', 'profile', 'settings', 'admin'];
  const reports = [];
  const shellChecks = [];
  const checkShell = (condition, message) => { if (!condition) throw new Error(message); shellChecks.push(message); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/dashboard`);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'Add a project' });
  checkShell(await menu.getByRole('menuitem').count() === 5, 'Add exposes all five project types');
  for (const label of ['Canvas', 'Note', 'Document', 'Slides', 'Sheet']) {
    checkShell(await menu.getByRole('menuitem', { name: label, exact: true }).count() === 1, `Add has an accessible ${label} choice`);
  }
  await page.keyboard.press('ArrowDown');
  checkShell(await menu.getByRole('menuitem', { name: 'Note', exact: true }).evaluate(element => element === document.activeElement), 'Add supports arrow-key navigation');
  await page.keyboard.press('Escape');
  checkShell(await page.getByRole('button', { name: 'Add', exact: true }).evaluate(element => element === document.activeElement), 'Add restores focus after Escape');
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search and jump' }).waitFor();
  await page.getByRole('textbox', { name: 'Search pages, notes, quizzes and actions' }).fill('Calendar');
  checkShell(await page.getByRole('listbox', { name: 'Results' }).innerText().then(text => text.includes('Calendar')), 'Global search finds a nested learning page');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.getByRole('dialog', { name: 'Notifications' }).waitFor();
  await page.keyboard.press('Escape');
  checkShell(!await page.getByRole('dialog', { name: 'Notifications' }).isVisible(), 'Notifications dismiss with Escape');
  const sidebarMode = await page.locator('.learn-app').getAttribute('data-sidebar');
  await page.keyboard.press('Control+Backslash');
  await page.goto(`${origin}/calendar`);
  checkShell(await page.getByRole('navigation', { name: 'Learning sections' }).getByRole('button').count() === 5, 'Nested sections remain available with the sidebar minimized');
  for (let tries = 0; tries < 3 && await page.locator('.learn-app').getAttribute('data-sidebar') !== sidebarMode; tries++) await page.keyboard.press('Control+Backslash');
  const errors = [];
  const recordError = error => errors.push(error.message);
  page.on('pageerror', recordError);
  for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      const errorStart = errors.length;
      const response = await page.goto(`${origin}/${route}`);
      await page.locator('#learn-main-content').waitFor();
      await page.getByRole('button', { name: /^Account: LEARN Admin$/ }).first().waitFor();
      await page.waitForFunction(() => !/Loading (workspace|projects|saved blocks)/.test(document.querySelector('main')?.innerText || ''));
      // Allow data-driven children and their layout to settle after hydration.
      await page.waitForTimeout(650);
      const layout = await page.evaluate(() => {
        const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
        const main = document.querySelector('main');
        const controls = [...main.querySelectorAll('button, input:not([type=hidden]), select, textarea, [role=button]')].filter(visible);
        const clippedLabels = controls.filter(element => element.matches('button, [role=button]')).filter(element => [...element.childNodes].some(node => {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
          const range = document.createRange();
          range.selectNodeContents(node);
          const text = range.getBoundingClientRect();
          const box = element.getBoundingClientRect();
          return text.left < box.left - 1 || text.right > box.right + 1;
        })).map(element => element.textContent.trim().slice(0, 80));
        return {
          overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
          headings: [...main.querySelectorAll('h1,h2,h3')].filter(visible).map(element => element.textContent.trim()),
          controls: controls.length,
          clippedLabels,
          outsideContent: [...controls, ...main.querySelectorAll('h1,h2,h3')].filter(visible).filter(element => {
            if (element.matches('input[type=file], .sr-only') || element.closest('.sr-only')) return false;
            for (let ancestor = element.parentElement; ancestor && ancestor !== main; ancestor = ancestor.parentElement) {
              const style = getComputedStyle(ancestor);
              if (['auto', 'scroll'].includes(style.overflowX) && ancestor.scrollWidth > ancestor.clientWidth) return false;
            }
            const rect = element.getBoundingClientRect();
            return rect.left < main.getBoundingClientRect().left - 1 || rect.right > innerWidth + 1;
          }).map(element => element.getAttribute('aria-label') || element.textContent.trim().slice(0, 80) || element.tagName),
          mainLandmarks: document.querySelectorAll('main').length,
          unnamed: controls.filter(element => !element.textContent.trim() && !element.getAttribute('aria-label') && !element.getAttribute('title') && !element.getAttribute('aria-labelledby') && !element.labels?.length).map(element => element.outerHTML.slice(0, 240)),
          applicationError: /Application error:|Internal Server Error/.test(main.innerText),
        };
      });
      const report = { route, width: viewport.width, status: response.status(), ...layout, pageErrors: errors.slice(errorStart) };
      reports.push(report);
      await page.screenshot({ path: `output/playwright/routes/${viewport.width}-${route}.png`, fullPage: false });
      console.log(JSON.stringify(report));
    }
  }
  page.off('pageerror', recordError);
  const failures = reports.filter(report => report.status >= 400 || report.overflow > 1 || report.applicationError || report.pageErrors.length || report.unnamed.length || report.clippedLabels.length || report.outsideContent.length || report.mainLandmarks !== 1);
  console.log(JSON.stringify({ total: reports.length, failed: failures.length, failures }));
  return { total: reports.length, failed: failures.length, shellChecks, reports };
  } finally { await context.close(); }
}
