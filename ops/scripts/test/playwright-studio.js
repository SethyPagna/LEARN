// Run in a dedicated local Playwright CLI session signed in as the demo Admin.
// Requires existing demo projects across all five formats and scrollable recents.
// Project creation is intercepted with a delayed 503; no project writes are sent.
// Local preferences, sidebar cookie and viewport are restored after the audit.
async (page) => {
  const origin = await page.evaluate(() => location.origin);
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin)) throw new Error('Use the local LEARN instance.');
  const originalStorage = await page.evaluate(() => ({ ...localStorage }));
  const originalSidebarCookie = await page.evaluate(() => document.cookie.split('; ').find(value => value.startsWith('learn_sidebar=')) || '');
  const originalViewport = page.viewportSize() || await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  const checks = [];
  const layouts = [];
  const errors = [];
  const recordError = error => errors.push(error.message);
  const verify = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  const studio = page.getByRole('region', { name: 'Your Studio home' });
  const add = studio.locator('button[aria-haspopup="menu"]');
  const search = studio.getByRole('textbox', { name: 'Find a project' });
  const menu = page.getByRole('menu', { name: 'Add a project' });
  const setSidebar = async mode => {
    for (let attempt = 0; attempt < 4 && await page.locator('.learn-app').getAttribute('data-sidebar') !== mode; attempt++) {
      await page.keyboard.press('Control+Backslash');
      await page.waitForTimeout(100);
    }
    verify(await page.locator('.learn-app').getAttribute('data-sidebar') === mode, `Sidebar can enter ${mode} mode`);
  };
  page.on('pageerror', recordError);
  try {
    await page.goto(`${origin}/dashboard`);
    await page.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).waitFor();
    await studio.getByRole('list', { name: 'Projects', exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });
    await setSidebar('expanded');
    for (const theme of ['light', 'dark', 'color']) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.locator('select[aria-label="Appearance"]:visible').selectOption(theme);
        await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
        await page.waitForTimeout(180);
        const layout = await studio.evaluate(element => {
          const box = selector => {
            const rect = element.querySelector(selector).getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, right: rect.right };
          };
          const search = box('[aria-label="Find a project"]');
          const appearance = box('[aria-label="Workspace appearance"]');
          const add = box('button[aria-haspopup="menu"]');
          const account = [...document.querySelectorAll('button[aria-label="Account: LEARN Admin"]')].find(button => button.checkVisibility());
          const notification = [...document.querySelectorAll('button')].find(button => button.checkVisibility() && /^Notifications/.test(button.getAttribute('aria-label') || ''));
          const theme = [...document.querySelectorAll('select[aria-label="Appearance"]')].find(select => select.checkVisibility());
          const visibleButtons = [...element.querySelectorAll('button')].filter(button => button.checkVisibility());
          return {
            search, appearance, add,
            sameRow: Math.abs(search.y + search.height / 2 - add.y - add.height / 2) <= 2 && Math.abs(appearance.y - add.y) <= 2,
            searchBeforeControls: search.right <= appearance.x && appearance.right <= add.x,
            accountAfterNotification: Boolean(account && notification && (notification.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING)),
            themeBeforeNotification: Boolean(theme && notification && (theme.compareDocumentPosition(notification) & Node.DOCUMENT_POSITION_FOLLOWING)),
            accountWidth: account.getBoundingClientRect().width,
            overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
            addSvgCount: element.querySelector('button[aria-haspopup="menu"]').querySelectorAll('svg').length,
            unnamed: visibleButtons.filter(button => !button.innerText.trim() && !button.getAttribute('aria-label') && !button.title).length,
          };
        });
        layouts.push({ theme, width, ...layout });
        verify(layout.sameRow && layout.searchBeforeControls, `${width}px ${theme}: Search, appearance and Add share one ordered row`);
        verify(layout.accountAfterNotification && layout.themeBeforeNotification, `${width}px ${theme}: account follows theme and notifications`);
        verify(layout.overflow <= 1 && layout.unnamed === 0 && layout.addSvgCount === 0, `${width}px ${theme}: compact named controls fit without Add icons`);
        await add.click();
        await menu.waitFor();
        const menuBox = await menu.boundingBox();
        verify(menuBox.x >= 0 && menuBox.x + menuBox.width <= width + 1, `${width}px ${theme}: Add menu stays inside viewport`);
        await page.keyboard.press('Escape');
        verify(await add.evaluate(element => element === document.activeElement), `${width}px ${theme}: Escape returns Add focus`);
        await page.screenshot({ path: `output/playwright/studio-home-${theme}-${width}.png`, fullPage: false });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await add.click();
    verify(await menu.getByRole('menuitem').count() === 5, 'Add retains five project types');
    verify(await menu.getByRole('menuitem', { name: 'Canvas', exact: true }).evaluate(element => element === document.activeElement), 'Add initially focuses Canvas');
    await page.keyboard.press('ArrowDown');
    verify(await menu.getByRole('menuitem', { name: 'Note', exact: true }).evaluate(element => element === document.activeElement), 'ArrowDown focuses Note');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    verify(await menu.getByRole('menuitem', { name: 'Sheet', exact: true }).evaluate(element => element === document.activeElement), 'ArrowUp wraps from Canvas to Sheet');
    await page.keyboard.press('Escape');
    await add.click();
    await search.click();
    verify(!await menu.isVisible(), 'Clicking outside closes Add menu');
    const initialCount = await studio.getByRole('list', { name: 'Projects', exact: true }).locator('li').count();
    await search.fill('not-a-real-project-73ac');
    await studio.getByText('No matching projects.', { exact: true }).waitFor();
    verify(await studio.getByRole('list', { name: 'Projects', exact: true }).count() === 0, 'Search filters the project list');
    verify(await studio.getByRole('region', { name: 'Recent projects' }).count() === 0, 'Search filters recent previews too');
    await search.fill('');
    verify(await studio.getByRole('list', { name: 'Projects', exact: true }).locator('li').count() === initialCount, 'Clearing search restores projects');
    for (const [label, kinds] of [['Canvas', ['canvas']], ['Writing', ['docs', 'notes']], ['Slides', ['slides']], ['Sheets', ['sheets']]]) {
      await studio.locator('[aria-label="Project filters"]').getByRole('button', { name: label, exact: true }).click();
      const visibleKinds = await studio.getByRole('list', { name: 'Projects', exact: true }).locator('[data-project-kind]').evaluateAll(elements => elements.map(element => element.getAttribute('data-project-kind')));
      verify(visibleKinds.every(kind => kinds.includes(kind)), `${label} filters only matching project kinds`);
    }
    await studio.locator('[aria-label="Project filters"]').getByRole('button', { name: 'All', exact: true }).click();
    const recentTrack = studio.getByRole('list', { name: 'Recent project previews, newest first' });
    await studio.getByRole('button', { name: 'Next recent projects' }).click();
    await page.waitForTimeout(500);
    verify(await recentTrack.evaluate(element => element.scrollLeft > 0), 'Recent previews scroll horizontally');
    await studio.getByRole('button', { name: 'Previous recent projects' }).click();
    await page.waitForTimeout(500);
    verify(await recentTrack.evaluate(element => element.scrollLeft < 5), 'Recent previews return to the newest project');
    await page.getByRole('button', { name: /^Notifications/ }).click();
    await page.getByRole('dialog', { name: 'Notifications' }).waitFor();
    await page.keyboard.press('Escape');
    verify(!await page.getByRole('dialog', { name: 'Notifications' }).isVisible(), 'Notifications still open and dismiss');
    await page.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).click();
    verify(await page.getByRole('dialog', { name: 'Account and preferences' }).isVisible(), 'Reordered account still opens');
    const mobileAccount = await page.getByRole('dialog', { name: 'Account and preferences' }).boundingBox();
    verify(mobileAccount.x >= 0 && mobileAccount.x + mobileAccount.width <= 390, 'Mobile account popover stays inside viewport');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const mode of ['rail', 'hidden', 'expanded']) {
      await setSidebar(mode);
      const visibleAccount = page.getByRole('button', { name: 'Account: LEARN Admin', exact: true });
      verify(await visibleAccount.isVisible(), `${mode}: account remains visible`);
      const accountBox = await visibleAccount.boundingBox();
      verify(accountBox.width >= 24 && accountBox.width <= 160 && accountBox.x >= 0 && accountBox.x + accountBox.width <= 1440, `${mode}: account dimensions stay usable`);
      await visibleAccount.click();
      verify(await page.getByRole('dialog', { name: 'Account and preferences' }).isVisible(), `${mode}: account menu opens`);
      await page.keyboard.press('Escape');
      await page.screenshot({ path: `output/playwright/studio-sidebar-${mode}.png`, fullPage: false });
    }
    let posts = 0;
    const createRoute = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posts++;
      await page.waitForTimeout(3000);
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Studio creation retry fixture' }) });
    };
    await page.route('**/api/canvas', createRoute);
    try {
      await add.click();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(180);
      verify(await add.isDisabled(), 'Add disables while a project is being created');
      verify(posts === 1, 'Rapid creation attempts produce only one request');
      await studio.getByRole('alert').waitFor();
      verify((await studio.getByRole('alert').innerText()).includes('Studio creation retry fixture'), 'Creation failure appears without leaving Studio');
      verify(!await add.isDisabled(), 'Add re-enables after a failed creation');
      await studio.getByRole('button', { name: 'Dismiss error' }).click();
      await add.click();
      verify(await menu.getByRole('menuitem').count() === 5, 'Failed creation can be retried');
      await page.keyboard.press('Escape');
    } finally {
      await page.waitForTimeout(3100);
      await page.unroute('**/api/canvas', createRoute);
    }
    await studio.getByRole('button', { name: 'Workspace appearance', exact: true }).click();
    await page.waitForURL('**/settings?section=experience');
    verify(page.url().endsWith('/settings?section=experience'), 'Appearance shortcut opens the intended settings section');
    const personalTitle = 'My studio for research, design and weekly practice';
    await page.evaluate(title => {
      const key = 'learn_workspace_options';
      const stored = JSON.parse(localStorage.getItem(key) || '{}');
      localStorage.setItem(key, JSON.stringify({ ...stored, workspaceName: title, dailyFocus: '' }));
    }, personalTitle);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/dashboard`);
    const personalHeading = studio.getByRole('heading', { name: personalTitle, exact: true });
    await personalHeading.waitFor();
    verify(await personalHeading.isVisible(), 'Personal workspace title remains visible on mobile without a daily focus');
    verify(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), 'Personal workspace title does not overflow a 390px viewport');
    await page.screenshot({ path: 'output/playwright/studio-personal-title-390.png', fullPage: false });
    verify(errors.length === 0, 'No browser page errors during Studio checks');
    return { checks: checks.length, passed: checks, layouts, errors };
  } finally {
    page.off('pageerror', recordError);
    await page.evaluate(storage => { localStorage.clear(); for (const [key, value] of Object.entries(storage)) localStorage.setItem(key, value); }, originalStorage);
    await page.evaluate(value => { document.cookie = value ? `${value}; Path=/; Max-Age=31536000; SameSite=Lax` : 'learn_sidebar=; Path=/; Max-Age=0; SameSite=Lax'; }, originalSidebarCookie);
    await page.setViewportSize(originalViewport);
    await page.goto(`${origin}/dashboard`);
  }
}
