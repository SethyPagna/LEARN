// Run in a dedicated local Playwright CLI session signed in as demo Admin.
// All chat records below are browser-only fixtures; every API write is intercepted.
// No messages, stories, groups, calls or uploads reach a real recipient.
async (sourcePage) => {
  const origin = await sourcePage.evaluate(() => location.origin);
  if (!/^http:\/\/(localhost|127\.0\.0\.1):/.test(origin)) throw new Error('Local LEARN only.');
  const browser = sourcePage.context().browser();
  if (!browser) throw new Error("An isolated browser context is required for this audit.");
  const auditContext = await browser.newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await auditContext.newPage();
  const checks = [];
  const layouts = [];
  const errors = [];
  const writes = [];
  const routeErrors = [];
  const routeHits = [];
  const verify = (condition, label) => { if (!condition) throw new Error(label); checks.push(label); };
  const recordError = error => errors.push(error.message);
  const workspace = page.getByRole('region', { name: 'Messages workspace', exact: true });
  const inbox = page.getByRole('complementary', { name: 'Conversations', exact: true });
  const dialog = page.getByRole('dialog', { name: 'New conversation', exact: true });
  const threadButtons = inbox.getByRole('button', { name: /^Open conversation with/ });
  let inboxFailure = false;
  let historyFailure = false;
  let sendCount = 0;
  let successfulSend = false;
  let sendDelay = 1000;
  let completedSends = 0;
  const now = new Date().toISOString();
  const threads = [
    { id: 'qa-dm', title: '#general - Biology study plan', dm_peer_id: 'qa-peer', dm_peer_name: 'Maya Chen', last_message: 'The new diagram makes it so much clearer.', updated_at: now, saved: false },
    { id: 'qa-group', title: '#general - Design circle', group_id: 'qa-group', last_message: 'Let’s compare our notes tomorrow.', updated_at: '2026-09-26T09:30:00Z', saved: true },
    { id: 'qa-personal', title: '#wins - A good question', last_message: 'What changed in your approach this week?', updated_at: '2026-09-25T09:30:00Z' },
  ];
  const fixtureMessages = [
    { id: 'qa-msg-1', thread_id: 'qa-dm', user_id: 'qa-peer', body: 'I mapped out the cell cycle. Want to compare notes?', created_at: '2026-09-27T09:00:00Z' },
    { id: 'qa-msg-2', thread_id: 'qa-dm', user_id: 'qa-self', body: 'Yes! The diagram made the checkpoints click for me.', created_at: '2026-09-27T09:01:00Z' },
    { id: 'qa-msg-3', thread_id: 'qa-dm', user_id: 'qa-peer', body: 'The new diagram makes it so much clearer.', created_at: '2026-09-27T09:03:00Z' },
  ];
  const handleApi = async route => {
    const request = route.request();
    const pathname = request.url().split(origin)[1]?.split('?')[0];
    routeHits.push(pathname);
    const respond = (json, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push({ path: pathname, method: request.method() });
      if (pathname === '/api/chat') { sendCount++; await page.waitForTimeout(sendDelay); completedSends++; if (successfulSend) return respond({ threadId: request.postDataJSON().threadId || 'qa-dm' }, 201); }
      if (pathname === '/api/social/actions') {
        const body = request.postDataJSON();
        const thread = threads.find(item => item.id === body.targetId);
        if (thread && body.actionType === 'bookmark') thread.saved = true;
        return respond({ item: { id: 'qa-action' } }, 201);
      }
      return respond({ error: 'Test connection interrupted. Try again.' }, 503);
    }
    if (pathname === '/api/chat') {
      if (request.url().includes('threadId=')) return historyFailure ? respond({ error: 'History unavailable for this check.' }, 503) : respond({ items: fixtureMessages, reactions: { 'qa-msg-1': [{ emoji: '❤️', count: 1, mine: false }] } });
      return inboxFailure ? respond({ error: 'Inbox unavailable for this check.' }, 503) : respond({ items: threads });
    }
    if (pathname === '/api/auth/session') return respond({ user: { id: 'qa-self', name: 'LEARN Admin', role: 'admin', username: 'admin' } });
    if (pathname === '/api/connections') return respond({ items: [{ target_user_id: 'qa-peer', name: 'Maya Chen', username: 'maya' }] });
    if (pathname === '/api/groups') return respond({ items: [{ id: 'qa-group', name: 'Design circle', member_count: 4, is_member: true }, { id: 'qa-other-group', name: 'Reading together', member_count: 3, is_member: false }] });
    if (pathname === '/api/stories') return respond({ items: [] });
    return route.continue();
  };
  const routeApi = async route => {
    try { return await handleApi(route); }
    catch (error) { routeErrors.push(String(error)); await route.abort(); }
  };
  try {
    await page.goto(`${origin}/chat`);
    await workspace.waitFor();
    await page.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).waitFor();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'output/playwright/chat-real-empty-desktop.png' });
    await page.route('**/api/**', routeApi);
    if (page.routeWebSocket) await page.routeWebSocket('**/api/realtime/**', socket => socket.close());
    page.on('pageerror', recordError);
    await page.goto(`${origin}/chat`);
    await threadButtons.first().waitFor();
    verify(await threadButtons.count() === 3, 'Fixture conversations load');
    for (const theme of ['light', 'dark', 'color']) {
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
        await page.locator('select[aria-label="Appearance"]:visible').selectOption(theme);
        await page.waitForFunction(mode => document.documentElement.classList.contains(mode), theme);
        if (await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).isVisible()) await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
        await page.waitForTimeout(120);
        verify(await inbox.isVisible(), `${theme} ${width}: inbox visible`);
        await page.screenshot({ path: `output/playwright/chat-${theme}-${width}-inbox.png` });
        await threadButtons.first().click();
        await workspace.getByRole('log').getByText('I mapped out the cell cycle. Want to compare notes?', { exact: true }).waitFor();
        const layout = await workspace.evaluate(element => ({ overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, workspaceWidth: element.getBoundingClientRect().width, bottom: element.getBoundingClientRect().bottom, height: innerHeight, composer: element.querySelector('button[aria-label="Send message"]').getBoundingClientRect().bottom, bottomNavigation: [...document.querySelectorAll('nav[aria-label="Main"]')].map(nav => nav.getBoundingClientRect()).find(box => box.width > innerWidth * .8 && box.top > innerHeight * .7)?.top || innerHeight, unnamed: [...element.querySelectorAll('button')].filter(button => button.getClientRects().length && !button.textContent.trim() && !button.getAttribute('aria-label') && !button.getAttribute('title')).length }));
        verify(layout.overflow <= 1 && layout.unnamed === 0, `${theme} ${width}: contained and named controls`);
        verify(layout.composer <= layout.bottomNavigation, `${theme} ${width}: send control stays clear of bottom navigation`);
        layouts.push({ theme, width, ...layout });
        await page.screenshot({ path: `output/playwright/chat-${theme}-${width}-conversation.png` });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await workspace.getByRole('button', { name: 'Search this conversation', exact: true }).click();
    await workspace.getByRole('textbox', { name: 'Find in conversation', exact: true }).fill('checkpoints');
    verify(await workspace.getByRole('log').getByText('Yes! The diagram made the checkpoints click for me.', { exact: true }).isVisible() && await workspace.getByRole('log').getByText('I mapped out the cell cycle. Want to compare notes?', { exact: true }).count() === 0, 'Conversation search filters actual message bodies');
    await workspace.getByRole('textbox', { name: 'Find in conversation', exact: true }).fill('not-present');
    verify(await workspace.getByText('No matching messages', { exact: true }).isVisible(), 'Message search has a no-result state');
    await workspace.getByRole('button', { name: 'Close message search', exact: true }).click();
    await workspace.getByRole('button', { name: 'React to message 1', exact: true }).click();
    verify(await workspace.getByRole('button', { name: /^Add .* reaction$/ }).count() > 1, 'Reaction choices are contextual');
    await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    const filters = inbox.getByRole('group', { name: 'Inbox filters', exact: true });
    await filters.getByRole('button', { name: 'People', exact: true }).click();
    verify(await threadButtons.count() === 1, 'People filter uses DM destinations');
    await filters.getByRole('button', { name: 'Groups', exact: true }).click();
    verify(await threadButtons.count() === 1, 'Groups filter uses group destinations');
    await filters.getByRole('button', { name: 'Saved', exact: true }).click();
    verify(await threadButtons.count() === 1, 'Saved filter reflects persisted flags');
    await filters.getByRole('button', { name: 'All', exact: true }).click();
    await inbox.getByRole('textbox', { name: 'Search messages', exact: true }).fill('maya');
    verify(await threadButtons.count() === 1, 'Inbox searches recipient names');
    await inbox.getByRole('button', { name: 'Clear conversation search', exact: true }).click();
    await inbox.getByRole('button', { name: 'Start a new message', exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole('textbox', { name: 'Find people or groups', exact: true }).fill('maya');
    verify(await dialog.getByRole('button', { name: /Maya Chen/ }).count() === 1 && await dialog.getByRole('button', { name: /Design circle/ }).count() === 0, 'Recipient picker filters contacts and groups');
    await dialog.getByRole('textbox', { name: 'Find people or groups', exact: true }).fill('');
    await dialog.getByRole('button', { name: 'Create group', exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Group name', exact: true }).fill('Browser-only group');
    await dialog.getByRole('button', { name: 'Create', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    verify(await dialog.getByRole('textbox', { name: 'Group name', exact: true }).inputValue() === 'Browser-only group', 'Failed group creation preserves input');
    await page.keyboard.press('Escape');
    verify(!await dialog.isVisible(), 'New conversation dialog closes with Escape');
    await threadButtons.first().click();
    await workspace.getByRole('button', { name: 'Emoji and media', exact: true }).click();
    verify(await workspace.getByRole('button', { name: 'Record voice message', exact: true }).isVisible(), 'Voice recording remains reachable');
    await workspace.getByRole('button', { name: /Add .* emoji/ }).first().click();
    verify(Boolean(await workspace.getByRole('textbox', { name: 'Message', exact: true }).inputValue()), 'Emoji inserts into the draft');
    await workspace.getByRole('button', { name: 'Close media tools', exact: true }).click();
    await workspace.getByRole('button', { name: 'Attach', exact: true }).click();
    await page.getByRole('dialog', { name: 'Attach', exact: true }).getByRole('button', { name: 'Live game', exact: true }).click();
    verify(await workspace.getByRole('button', { name: 'Close the live game launcher', exact: true }).isVisible(), 'Live games remain reachable');
    await workspace.getByRole('button', { name: 'Close the live game launcher', exact: true }).click();
    const message = workspace.getByRole('textbox', { name: 'Message', exact: true });
    await message.fill('Browser-only draft, never sent.');
    await message.press('Enter');
    await message.press('Enter');
    await workspace.getByRole('status').filter({ hasText: 'Test connection interrupted. Try again.' }).waitFor();
    verify(sendCount === 1, 'Pending keyboard sends are deduplicated');
    verify(await message.inputValue() === 'Browser-only draft, never sent.', 'Failed sending preserves draft');
    successfulSend = true;
    await message.fill('Complete the original draft in Maya’s chat.');
    await workspace.getByRole('button', { name: 'Send message', exact: true }).click();
    await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await inbox.getByRole('button', { name: 'Open conversation with Design circle', exact: true }).click();
    verify(await message.inputValue() === '', 'Switching recipients does not carry another conversation’s text');
    await message.fill('Keep this unsent group draft.');
    await page.waitForTimeout(1200);
    verify(await message.inputValue() === 'Keep this unsent group draft.' && await workspace.getByRole('heading', { name: 'Design circle', exact: true }).isVisible(), 'Earlier send completion preserves the new destination and draft');
    await page.reload();
    await threadButtons.first().waitFor();
    await inbox.getByRole('button', { name: 'Open conversation with Design circle', exact: true }).click();
    verify(await message.inputValue() === 'Keep this unsent group draft.', 'Conversation draft and destination survive reload');
    await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await inbox.getByRole('button', { name: 'Open conversation with Maya Chen', exact: true }).click();
    verify(await message.inputValue() === '', 'Only the successfully sent source draft is cleared');
    await message.fill('First message in the same conversation.');
    await workspace.getByRole('button', { name: 'Send message', exact: true }).click();
    await message.fill('A newer unsent message stays here.');
    await page.waitForTimeout(1200);
    verify(await message.inputValue() === 'A newer unsent message stays here.', 'Send completion preserves text entered while the request was pending');
    await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await inbox.getByRole('button', { name: 'Open conversation with Design circle', exact: true }).click();
    verify(await message.inputValue() === 'Keep this unsent group draft.', 'Switching back restores each conversation independently');
    await workspace.getByRole('button', { name: 'Back to conversations', exact: true }).click();
    await inbox.getByRole('button', { name: 'Open conversation with Maya Chen', exact: true }).click();
    sendDelay = 3500;
    const completedBeforeLeaving = completedSends;
    await message.fill('Send before leaving the chat workspace.');
    await workspace.getByRole('button', { name: 'Send message', exact: true }).click();
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Create', exact: true }).click();
    await page.getByRole('region', { name: 'Your Studio home', exact: true }).waitFor();
    await page.getByRole('navigation', { name: 'Main', exact: true }).getByRole('button', { name: 'Friends', exact: true }).click();
    await threadButtons.first().waitFor();
    await inbox.getByRole('button', { name: 'Open conversation with Maya Chen', exact: true }).click();
    await message.fill('A new draft after reopening the workspace.');
    verify(completedSends === completedBeforeLeaving, 'Unmount/reopen race begins while the original send is still pending');
    await page.waitForTimeout(3700);
    verify(await message.inputValue() === 'A new draft after reopening the workspace.', 'Unmounted send completion cannot change a reopened composer');
    await page.reload();
    await threadButtons.first().waitFor();
    await inbox.getByRole('button', { name: 'Open conversation with Maya Chen', exact: true }).click();
    verify(await message.inputValue() === 'A new draft after reopening the workspace.', 'Unmounted send completion cannot overwrite the newer persisted draft');


    historyFailure = true;
    await page.reload();
    await threadButtons.first().waitFor();
    await threadButtons.first().click();
    await workspace.getByRole('alert').getByText('History unavailable for this check.', { exact: true }).waitFor();
    historyFailure = false;
    await workspace.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await workspace.getByRole('log').getByText('I mapped out the cell cycle. Want to compare notes?', { exact: true }).waitFor();
    verify(true, 'Message history errors recover through Retry');
    inboxFailure = true;
    await page.reload();
    await inbox.getByRole('alert').waitFor();
    inboxFailure = false;
    await inbox.getByRole('alert').getByRole('button', { name: 'Retry', exact: true }).click();
    await threadButtons.first().waitFor();
    verify(true, 'Inbox errors recover through Retry');
    await inbox.getByRole('button', { name: 'Add a story', exact: true }).click();
    const story = page.getByRole('dialog', { name: 'New story', exact: true });
    await story.waitFor();
    verify(await story.getByRole('textbox', { name: 'Story text', exact: true }).isVisible(), 'Story composer remains reachable');
    await story.getByRole('button', { name: 'Close story', exact: true }).click();
    verify(errors.length === 0, 'No browser runtime errors');
    console.log(JSON.stringify({ layouts: layouts.length, checks: checks.length, writes, errors, reports: layouts }));
    return { checks, layouts, writes, errors };
  } catch (error) {
    console.log(JSON.stringify({ failureUrl: page.url(), checks, writes, errors }));
    await page.screenshot({ path: 'output/playwright/chat-audit-failure.png' });
    throw new Error(`${error.message}; route errors: ${JSON.stringify(routeErrors)}; hits: ${JSON.stringify(routeHits)}`);
  } finally {
    page.off('pageerror', recordError);
    await page.unroute('**/api/**', routeApi);
    await auditContext.close();
  }
}
