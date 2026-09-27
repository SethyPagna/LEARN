// Local browser audit. Community reads and all mutations use isolated fixtures.
async (sourcePage) => {
  const origin = await sourcePage.evaluate(() => location.origin);
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin)) throw new Error('Local instance only');
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${origin}/dashboard`);
  const checks = [];
  const layouts = [];
  const pageErrors = [];
  const onError = error => pageErrors.push(error.message);
  const verify = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const records = {
    spaces: [
      { id: 'audit-space-1', name: 'Design circle', description: 'A place to share ideas and learn by making.', visibility: 'public', topic_tags: ['design', 'creative practice'], member_count: 4 },
      { id: 'audit-space-2', name: 'Weekend readers', description: 'Small chapters. New perspectives.', visibility: 'private', topic_tags: ['books'], member_count: 2 },
      { id: 'audit-space-3', name: 'The interdisciplinary curiosity and collaborative learning community', description: 'Science, technology and everything in between.', visibility: 'connections', topic_tags: ['science'], member_count: 7 },
    ],
    rooms: [
      { id: 'audit-room-1', name: 'Morning focus', mode: 'focus', status: 'open', pomodoro_minutes: 25, break_minutes: 5 },
      { id: 'audit-room-2', name: 'Big questions', mode: 'discussion', status: 'active', pomodoro_minutes: 50, break_minutes: 10 },
      { id: 'audit-room-3', name: 'Reading hour', mode: 'focus', status: 'closed', pomodoro_minutes: 45, break_minutes: 15 },
    ],
    battles: [
      { id: 'audit-battle-1', title: 'A little friendly competition', topic: 'Science & nature', mode: 'team', status: 'waiting' },
      { id: 'audit-battle-2', title: 'Quick recall', topic: 'World history', mode: 'solo', status: 'active' },
      { id: 'audit-battle-3', title: 'Code club challenge', topic: 'Programming', mode: 'team', status: 'completed' },
    ],
  };
  const configs = [
    { kind: 'spaces', path: '/api/learning-spaces', title: 'Groups', noun: 'group', field: 'Group name' },
    { kind: 'rooms', path: '/api/study-rooms', title: 'Rooms', noun: 'room', field: 'Room name' },
    { kind: 'battles', path: '/api/study-battles', title: 'Battles', noun: 'battle', field: 'Title' },
  ];
  let mutationCount = 0;
  let failNextSave = false;
  let failNextLoad = false;
  const handler = async route => {
    const request = route.request();
    const path = request.url().split(origin)[1].split('?')[0];
    const config = configs.find(item => item.path === path);
    if (config && request.method() === 'GET') {
      if (failNextLoad) { failNextLoad = false; await route.fulfill({ status: 503, json: { error: 'Community temporarily unavailable.' } }); return; }
      await route.fulfill({ json: { items: records[config.kind] } }); return;
    }
    if (request.method() === 'GET') { await route.continue(); return; }
    mutationCount++;
    if (!config) { await route.fulfill({ status: 503, json: { error: 'Audit prevents external changes.' } }); return; }
    await page.waitForTimeout(450);
    if (failNextSave) { failNextSave = false; await route.fulfill({ status: 503, json: { error: 'Could not save. Please try again.' } }); return; }
    const body = request.postDataJSON();
    const item = { ...body, id: body.id || `audit-created-${config.kind}`, topic_tags: body.topicTags || [], pomodoro_minutes: body.pomodoroMinutes || 25, break_minutes: body.breakMinutes || 5 };
    records[config.kind] = [...records[config.kind].filter(record => record.id !== item.id), item];
    await route.fulfill({ json: { item } });
  };
  const titleOf = item => item.name || item.title;
  const auditLayout = async label => {
    await page.waitForTimeout(220);
    const measured = await page.evaluate(() => {
      const community = document.querySelector('[data-kind="spaces"], [data-kind="rooms"], [data-kind="battles"]');
      const buttons = [...community.querySelectorAll('button')].filter(button => button.checkVisibility());
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        unnamed: buttons.filter(button => !button.innerText.trim() && !button.getAttribute('aria-label') && !button.title).length,
        clippedControls: buttons.filter(button => { const rect = button.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1; }).length,
      };
    });
    layouts.push({ label, ...measured });
    verify(measured.overflow <= 1 && measured.unnamed === 0 && measured.clippedControls === 0, `${label}: no overflow, clipped or unnamed controls ${JSON.stringify(measured)}`);
  };
  page.on('pageerror', onError);
  await page.route(`${origin}/api/**`, handler);
  try {
    await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('learn_social_draft_')).forEach(key => localStorage.removeItem(key)));
    for (const config of configs) {
      await page.goto(`${origin}/${config.kind}`);
      const community = page.getByRole('region', { name: config.title, exact: true });
      const firstTitle = titleOf(records[config.kind][0]);
      await community.getByRole('button', { name: `Open ${firstTitle}`, exact: true }).waitFor();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(value => { document.documentElement.classList.toggle('dark', value === 'dark'); document.documentElement.style.colorScheme = value; localStorage.setItem('theme', value); }, theme);
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await auditLayout(`${config.kind}-${theme}-${width}-browse`);
          await page.screenshot({ path: `output/playwright/community-${config.kind}-${theme}-${width}-browse.png`, fullPage: true });
          await community.getByRole('button', { name: `Open ${firstTitle}`, exact: true }).click();
          await community.getByRole('heading', { name: firstTitle, exact: true }).waitFor();
          await auditLayout(`${config.kind}-${theme}-${width}-detail`);
          await page.screenshot({ path: `output/playwright/community-${config.kind}-${theme}-${width}-detail.png`, fullPage: true });
          await community.getByRole('button', { name: `Back to ${config.title.toLowerCase()}`, exact: true }).click();
        }
      }
      await community.getByRole('textbox', { name: `Search ${config.title}`, exact: true }).fill('unmatchedxyz');
      verify(await community.getByText('No matches', { exact: true }).isVisible(), `${config.kind}: search has useful empty state`);
      await community.getByRole('button', { name: 'Clear filters', exact: true }).click();
      verify(await community.getByRole('button', { name: /^Open / }).count() === 3, `${config.kind}: clear restores all cards`);
      await community.getByRole('group', { name: `${config.title} filters` }).getByRole('button').nth(1).click();
      verify(await community.getByRole('button', { name: /^Open / }).count() === (config.kind === 'spaces' ? 1 : 2), `${config.kind}: status filter changes results`);
      await community.getByRole('button', { name: 'All', exact: true }).click();
      await community.getByRole('button', { name: `Open ${firstTitle}`, exact: true }).click();
      const details = community.getByRole('navigation', { name: `${config.title} details` });
      for (const tab of ['People', 'Activity', 'Invite', 'Manage']) {
        await details.getByRole('button', { name: tab, exact: true }).click();
        await auditLayout(`${config.kind}-${tab.toLowerCase()}`);
      }
      const stateControl = community.getByRole('combobox', { name: config.kind === 'spaces' ? 'Group visibility' : 'Record status', exact: true });
      const originalState = await stateControl.inputValue();
      const nextState = config.kind === 'spaces' ? 'private' : config.kind === 'rooms' ? 'closed' : 'completed';
      failNextSave = true;
      await stateControl.selectOption(nextState);
      await community.getByText('Could not save. Please try again.', { exact: true }).waitFor();
      verify(await stateControl.inputValue() === originalState, `${config.kind}: failed state update rolls back`);
      await stateControl.selectOption(nextState);
      await community.getByText('Updated.', { exact: true }).waitFor();
      verify(await stateControl.inputValue() === nextState, `${config.kind}: explicit state choice is saved`);
      await community.getByRole('button', { name: `Edit ${config.noun}`, exact: true }).click();
      await community.getByLabel(config.field, { exact: true }).fill('');
      verify(await community.getByRole('button', { name: 'Save', exact: true }).isDisabled(), `${config.kind}: blank name blocks save`);
      await community.getByRole('button', { name: 'Cancel', exact: true }).click();
      verify(await community.getByRole('heading', { name: firstTitle, exact: true }).isVisible(), `${config.kind}: cancel restores saved details`);
      await community.getByRole('button', { name: `Back to ${config.title.toLowerCase()}`, exact: true }).click();
      await community.getByRole('button', { name: `Add ${config.noun}`, exact: true }).click();
      const newTitle = `Audit ${config.noun}`;
      await community.getByLabel(config.field, { exact: true }).fill(newTitle);
      if (config.kind === 'rooms') {
        await community.getByLabel('Focus minutes', { exact: true }).fill('0');
        verify(await community.getByRole('button', { name: 'Create', exact: true }).isDisabled(), 'Room duration rejects zero');
        await community.getByLabel('Focus minutes', { exact: true }).fill('45');
      }
      failNextSave = true;
      const before = mutationCount;
      await community.getByRole('button', { name: 'Create', exact: true }).click();
      await community.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      await community.getByText('Could not save. Please try again.', { exact: true }).waitFor();
      verify(mutationCount === before + 1, `${config.kind}: pending submit issues one request`);
      verify(await community.getByLabel(config.field, { exact: true }).inputValue() === newTitle, `${config.kind}: failed save retains draft`);
      await community.getByRole('button', { name: `Back to ${config.title.toLowerCase()}`, exact: true }).click();
      await page.waitForTimeout(650);
      await page.reload();
      await community.getByRole('button', { name: 'Resume draft', exact: true }).click();
      verify(await community.getByLabel(config.field, { exact: true }).inputValue() === newTitle, `${config.kind}: unsaved draft survives browsing and reload`);
      await community.getByRole('button', { name: 'Create', exact: true }).click();
      await community.getByText(`${newTitle} saved.`, { exact: true }).waitFor();
      verify(await community.getByRole('heading', { name: newTitle, exact: true }).isVisible(), `${config.kind}: retry selects returned record`);
      await community.getByRole('button', { name: `Back to ${config.title.toLowerCase()}`, exact: true }).click();
      verify(await community.getByRole('button', { name: `Open ${newTitle}`, exact: true }).isVisible(), `${config.kind}: saved record is browsable`);
    }
    failNextLoad = true;
    await page.goto(`${origin}/spaces`);
    const groups = page.getByRole('region', { name: 'Groups', exact: true });
    await groups.getByText('Community temporarily unavailable.', { exact: true }).waitFor();
    await groups.getByRole('button', { name: 'Retry', exact: true }).click();
    await groups.getByRole('button', { name: 'Open Design circle', exact: true }).waitFor();
    verify(true, 'Failed collection fetch can retry without navigation');
    verify(pageErrors.length === 0, 'No browser runtime errors');
    return { layouts, checks, pageErrors, mutationCount, reads: 'Community fixtures; workspace people and activity use local API', writes: 'All intercepted; none persisted' };
  } finally {
    page.off('pageerror', onError);
    await page.unroute(`${origin}/api/**`, handler);
    await context.close();
  }
}
