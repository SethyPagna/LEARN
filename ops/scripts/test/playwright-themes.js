// Run through Playwright CLI in a local, authenticated session. No server data is changed.
async (sourcePage) => {
  const origin = 'http://localhost:3000';
  if (!sourcePage.url().startsWith(origin)) throw new Error('Use the local development server.');
  const browser = sourcePage.context().browser();
  const publicContext = await browser.newContext({ serviceWorkers: 'block', colorScheme: 'dark' });
  const appContext = await browser.newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const report = { checks: [], layouts: [], errors: [] };
  const check = (condition, message) => { if (!condition) throw new Error(message); report.checks.push(message); };
  const observe = page => page.on('pageerror', error => report.errors.push(error.message));
  const waitMode = async (page, mode) => {
    await page.waitForFunction(mode => document.documentElement.classList.contains(mode) && localStorage.getItem('theme') === mode, mode);
    check(await page.evaluate(mode => localStorage.getItem('theme') === mode, mode), `${mode} persists in storage`);
  };
  const publicMode = async (page, mode) => {
    await page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('button', { name: mode, exact: true }).click();
    await waitMode(page, mode.toLowerCase());
    const outline = await page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('button', { name: mode, exact: true }).evaluate(element => getComputedStyle(element).boxShadow);
    check(outline !== 'none', `${mode} has a visible selected-mode outline`);
  };
  const snapshot = async (page, path, mode, width) => {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(mode => document.documentElement.dataset.learnAccent && document.querySelector('meta[name=theme-color]')?.content === (mode === 'dark' ? '#212121' : '#ffffff'), mode);
    const metrics = await page.evaluate(() => {
      const root = document.documentElement;
      const tokens = getComputedStyle(root);
      const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const controls = [...document.querySelectorAll('button,input:not([type=hidden]),select,textarea')].filter(visible);
      return {
        overflow: Math.max(root.scrollWidth, document.body.scrollWidth) - innerWidth,
        active: ['light', 'dark', 'color'].filter(mode => root.classList.contains(mode)),
        scheme: tokens.colorScheme,
        primary: tokens.getPropertyValue('--primary').trim(),
        decorative: tokens.getPropertyValue('--decor-violet-ink').trim(),
        foreground: tokens.getPropertyValue('--foreground').trim(),
        chrome: document.querySelector('meta[name=theme-color]')?.content,
        unnamed: controls.filter(element => !element.textContent.trim() && !element.getAttribute('aria-label') && !element.getAttribute('title') && !element.getAttribute('aria-labelledby') && !element.labels?.length).map(element => element.outerHTML.slice(0, 100)),
      };
    });
    report.layouts.push({ path, mode, width, ...metrics });
    check(metrics.overflow <= 1, `${path} ${mode} ${width}px has no document overflow`);
    check(metrics.active.length === 1 && metrics.active[0] === mode, `${path} has one selected mode`);
    check(metrics.scheme === (mode === 'dark' ? 'dark' : 'light'), `${path} native controls follow ${mode}`);
    check(!metrics.unnamed.length, `${path} controls have accessible names`);
    check(mode === 'color' || metrics.decorative === metrics.foreground, `${path} ${mode} has the shared decorative palette`);
    check(metrics.chrome === (mode === 'dark' ? '#212121' : '#ffffff'), `${path} browser chrome follows ${mode}`);
    if (['/', '/login', '/settings', '/dashboard', '/social', '/practice'].includes(path.split('?')[0])) {
      const name = path.includes('mode=request') ? 'request' : path.split('?')[0].replaceAll('/', '') || 'home';
      await page.screenshot({ path: `output/playwright/themes/${mode}-${width}-${name}.png`, fullPage: true });
    }
  };
  try {
    const page = await publicContext.newPage(); observe(page);
    await page.goto(origin);
    await page.getByRole('button', { name: 'Color', exact: true }).waitFor();
    check(await page.locator('html').evaluate(element => element.classList.contains('color')), 'First visit defaults to Color even when the OS uses dark');
    await page.getByRole('button', { name: 'Apricot', exact: true }).click();
    const artwork = page.locator('div[data-palette="1"]');
    await artwork.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished)); });
    const artColor = await artwork.evaluate(element => getComputedStyle(element).backgroundColor);
    for (const mode of ['Dark', 'Light', 'Color']) {
      await publicMode(page, mode);
      check(await artwork.evaluate(element => getComputedStyle(element).backgroundColor) === artColor, `${mode} preserves the chosen canvas artwork color`);
    }
    await publicMode(page, 'Dark');
    await page.getByRole('link', { name: 'Take a look', exact: true }).click();
    await waitMode(page, 'dark');
    await page.waitForFunction(() => document.querySelector('meta[name=theme-color]')?.content === '#212121');
    check(true, 'Client navigation preserves dark browser chrome');
    await page.getByRole('link', { name: 'Sign in', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    await waitMode(page, 'dark');
    await page.getByRole('textbox').first().fill('theme-preview');
    await publicMode(page, 'Light');
    check(await page.getByRole('textbox').first().inputValue() === 'theme-preview', 'Switching appearance preserves the sign-in form');
    await page.reload();
    await waitMode(page, 'light');
    for (const mode of ['Color', 'Dark', 'Light']) {
      await publicMode(page, mode);
      for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['/', '/showcase', '/login', '/login?mode=request']) {
          const response = await page.goto(`${origin}${path}`);
          check(response.status() === 200, `${path} responds successfully`);
          await page.getByRole('button', { name: mode, exact: true }).waitFor();
          await snapshot(page, path, mode.toLowerCase(), width);
        }
      }
    }
    await page.evaluate(() => localStorage.setItem('theme', 'system'));
    await page.reload(); await waitMode(page, 'dark');
    check(true, 'Legacy System preference migrates using the OS appearance');

    const app = await appContext.newPage(); observe(app);
    await app.goto(`${origin}/settings?section=experience`);
    const select = app.getByRole('combobox', { name: 'Appearance', exact: true });
    await select.waitFor({ state: 'attached' });
    for (const mode of ['color', 'light', 'dark']) {
      await select.selectOption(mode); await waitMode(app, mode);
      for (const width of [320, 768, 1440]) {
        await app.setViewportSize({ width, height: 900 });
        for (const path of ['/settings?section=experience', '/dashboard', '/practice', '/social', '/chat', '/groups', '/calendar', '/files']) {
          const response = await app.goto(`${origin}${path}`);
          check(response.status() === 200, `${path} responds successfully`);
          await app.getByRole('combobox', { name: 'Appearance', exact: true }).waitFor({ state: 'attached' });
          await app.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).waitFor();
          await app.waitForFunction(() => !/Loading (workspace|projects|saved blocks)/.test(document.querySelector('main')?.innerText || ''));
          await snapshot(app, path, mode, width);
        }
      }
    }
    await app.setViewportSize({ width: 1440, height: 900 });
    await app.goto(`${origin}/settings?section=experience`);
    await select.selectOption('color');
    await app.getByRole('button', { name: 'Ocean accent', exact: true }).click();
    const second = await appContext.newPage(); observe(second);
    await second.goto(`${origin}/settings?section=experience`);
    await second.getByRole('button', { name: 'Ocean accent', exact: true }).waitFor();
    await app.getByRole('button', { name: 'Rose accent', exact: true }).click();
    await second.waitForFunction(() => [...document.querySelectorAll('button')].some(element => element.getAttribute('aria-label') === 'Rose accent' && element.getAttribute('aria-pressed') === 'true'));
    check(true, 'Accent choices update both document colors and Settings state in another tab');
    await second.getByText('Personalize', { exact: true }).click();
    await second.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Theme check');
    check(await second.evaluate(() => JSON.parse(localStorage.getItem('learn_workspace_options')).appAccent === 'rose'), 'An unrelated edit in another tab preserves the latest accent');
    await second.evaluate(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'learn_workspace_options') throw new DOMException('Fixture quota limit', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      window.restoreThemeAuditStorage = () => { Storage.prototype.setItem = original; };
    });
    await second.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Unsaved choice');
    await second.getByRole('button', { name: 'Ocean accent', exact: true }).click();
    check(await second.getByRole('textbox', { name: 'Workspace name', exact: true }).inputValue() === 'Unsaved choice', 'A storage quota error preserves earlier in-memory edits');
    await second.evaluate(() => window.restoreThemeAuditStorage());
    await second.getByRole('textbox', { name: 'Workspace name', exact: true }).fill('Recovered choice');
    check(await second.evaluate(() => JSON.parse(localStorage.getItem('learn_workspace_options')).appAccent === 'sky'), 'Recovered storage includes the pending accent choice');
    await second.getByRole('button', { name: 'Rose accent', exact: true }).click();
    await app.getByRole('button', { name: 'Dark', exact: true }).click();
    await waitMode(second, 'dark');
    check(await second.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed') === 'true', 'Explicit mode buttons track changes across tabs');
    await app.getByRole('button', { name: 'Color', exact: true }).click();
    check(await app.getByRole('button', { name: 'Rose accent', exact: true }).getAttribute('aria-pressed') === 'true', 'Returning to Color restores the saved accent');
    await app.goto(`${origin}/showcase`);
    await app.waitForFunction(() => document.documentElement.dataset.learnAccent === 'rose');
    check(await app.evaluate(() => document.documentElement.dataset.learnAccent) === 'rose', 'Landing tour uses the saved workspace accent');
    await app.goto(`${origin}/dashboard`);
    await app.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).waitFor();
    await app.getByRole('button', { name: /^Account:/ }).first().click();
    await app.getByRole('dialog', { name: 'Account and preferences' }).getByRole('button', { name: 'Light', exact: true }).click();
    await waitMode(app, 'light');
    await app.keyboard.press('Escape');
    await app.keyboard.press('Control+k');
    await app.getByRole('textbox', { name: 'Search pages, notes, quizzes and actions' }).fill('Dark mode');
    await app.getByRole('option', { name: /Dark mode/ }).click();
    await waitMode(app, 'dark');
    await app.goto(`${origin}/practice`);
    await app.getByLabel('Practice design', { exact: true }).click();
    await app.getByRole('button', { name: 'Use Color mode', exact: true }).waitFor();
    check(await app.getByRole('button', { name: 'Ocean', exact: true }).isDisabled(), 'Practice styles cannot silently change the global appearance');
    await app.getByRole('button', { name: 'Use Color mode', exact: true }).click();
    await waitMode(app, 'color');
    await app.getByRole('button', { name: 'Ocean', exact: true }).click();
    check(await app.locator('.practice-design').getAttribute('data-design') === 'ocean', 'Practice styles apply after explicitly choosing Color');
    check(report.errors.length === 0, `No uncaught browser errors: ${report.errors.join('; ')}`);
    return report;
  } finally {
    await publicContext.close();
    await appContext.close();
  }
}
