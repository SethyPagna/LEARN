// Local demo fixtures; writes are intercepted so review schedules and notes stay unchanged.
async (page) => {
  const { origin, hostname } = await page.evaluate(() => ({ origin: location.origin, hostname: location.hostname }));
  if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error('Local audit only');
  const passed = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); passed.push(message); };
  const reviewUrl = `${origin}/api/reviews`;
  const blocksPattern = '**/api/vault/blocks*';
  const feedPattern = '**/api/feed/interactions';
  const initialReviews = await (await page.request.get(reviewUrl)).json();
  let reviews = initialReviews.items;
  if (reviews.length < 2) throw new Error('Seed the local demo: this audit needs two due reviews.');
  let rejectReview = true;
  let rejectReviewRefresh = false;
  await page.route(reviewUrl, async route => {
    if (route.request().method() === 'POST') {
      if (rejectReview) { rejectReview = false; return route.fulfill({ status: 503, json: { error: 'Review save test failure' } }); }
      const input = route.request().postDataJSON();
      check(input.rating === 'good', 'Review sends the selected rating');
      reviews = reviews.filter(item => item.id !== input.id);
      rejectReviewRefresh = true;
      return route.fulfill({ json: { ok: true } });
    }
    if (rejectReviewRefresh) { rejectReviewRefresh = false; return route.fulfill({ status: 503, json: { error: 'Queue refresh test failure' } }); }
    return route.fulfill({ json: { ...initialReviews, items: reviews } });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/reviews`);
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).waitFor();
    check(await page.getByRole('article', { name: 'Current review' }).count() === 1, 'One review card is displayed');
    check(await page.getByRole('button', { name: 'Good', exact: true }).count() === 0, 'Ratings remain hidden before reveal');
    const firstPrompt = await page.getByRole('article', { name: 'Current review' }).getByRole('heading').innerText();
    await page.getByRole('button', { name: 'Next review', exact: true }).click();
    check(await page.getByRole('article', { name: 'Current review' }).getByRole('heading').innerText() !== firstPrompt, 'Next moves to another review');
    await page.getByRole('button', { name: 'Previous review', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).click();
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await page.getByText('Review save test failure', { exact: true }).waitFor();
    check(await page.getByLabel('Answer', { exact: true }).isVisible(), 'Failed grading keeps the answer available');
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await page.getByRole('button', { name: 'Reveal answer', exact: true }).waitFor();
    check(await page.getByRole('article', { name: 'Current review' }).getByRole('heading').innerText() !== firstPrompt, 'Successful grading advances the queue');
    await page.getByText('Queue refresh test failure', { exact: true }).waitFor();
    check(!await page.getByRole('heading', { name: firstPrompt, exact: true }).isVisible(), 'A refresh failure cannot expose an already graded card');
    await page.getByRole('button', { name: 'Retry refresh', exact: true }).click();
    await page.getByRole('button', { name: 'Retry refresh', exact: true }).waitFor({ state: 'hidden' });
    check(!await page.getByText('Queue refresh test failure', { exact: true }).isVisible(), 'Queue refresh can recover without grading twice');
    await page.locator('summary').filter({ hasText: 'Queue' }).click();
    check(await page.locator('.review-workspace .compact-row').count() === reviews.length, 'The queue matches remaining reviews');
    await page.screenshot({ path: 'output/playwright/reviews-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('summary').filter({ hasText: 'Queue' }).click();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    await page.screenshot({ path: 'output/playwright/reviews-phone-dark.png' });
    await page.getByRole('button', { name: 'Switch to light theme' }).click();

    let rejectBlock = true;
    let savedBlock = null;
    let blockPosts = 0;
    await page.route(blocksPattern, async route => {
      if (route.request().method() === 'POST') {
        blockPosts++;
        if (rejectBlock) { rejectBlock = false; return route.fulfill({ status: 503, json: { error: 'Block save test failure' } }); }
        savedBlock = { ...route.request().postDataJSON(), id: 'playwright-block' };
        return route.fulfill({ json: { ok: true } });
      }
      const response = await route.fetch();
      const payload = await response.json();
      return route.fulfill({ response, json: { ...payload, items: savedBlock ? [...payload.items, savedBlock] : payload.items } });
    });
    await page.goto(`${origin}/vault`);
    await page.getByRole('combobox', { name: 'Vault note', exact: true }).selectOption({ label: 'React Patterns' });
    await page.getByRole('heading', { name: 'React Patterns', exact: true }).waitFor();
    await page.getByText('Add a block', { exact: true }).click();
    const add = page.getByRole('button', { name: 'Add', exact: true });
    check(await add.isDisabled(), 'Empty Vault blocks cannot be saved');
    await page.getByRole('textbox', { name: 'Block content' }).fill('A clear idea from the Playwright review.');
    await add.click();
    await page.getByText('Block save test failure', { exact: true }).waitFor();
    check(await page.getByRole('textbox', { name: 'Block content' }).inputValue() === 'A clear idea from the Playwright review.', 'Failed block save preserves the draft');
    await add.click();
    await page.getByRole('region', { name: 'Saved Vault blocks' }).getByText('A clear idea from the Playwright review.', { exact: true }).waitFor();
    check(blockPosts === 2 && savedBlock.blockType === 'text', 'Retry saves the selected block once');
    check(await page.getByRole('textbox', { name: 'Block content' }).inputValue() === '', 'Successful block save clears the draft');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('textbox', { name: 'Find a Vault note' }).fill('React');
    check(await page.locator('.vault-workbench aside .compact-row').count() === 1, 'Vault search narrows the note list');

    await page.goto(`${origin}/graph`);
    await page.getByRole('button', { name: 'Select React Patterns', exact: true }).waitFor();
    const allTopics = await page.locator('.graph-node').count();
    await page.getByRole('button', { name: 'Needs practice', exact: true }).click();
    check(await page.locator('.graph-node').count() < allTopics, 'Graph filter narrows the visible nodes');
    await page.getByRole('button', { name: 'Select React Patterns', exact: true }).focus();
    await page.keyboard.press('Enter');
    check(await page.getByRole('button', { name: 'Select React Patterns', exact: true }).getAttribute('aria-pressed') === 'true', 'Graph nodes support keyboard selection');
    check(await page.getByRole('meter', { name: 'Topic mastery' }).getAttribute('value') !== null, 'Selected topic exposes its mastery visually');

    let rejectAnswer = true;
    await page.route(feedPattern, async route => {
      if (rejectAnswer) { rejectAnswer = false; return route.fulfill({ status: 503, json: { error: 'Answer save test failure' } }); }
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${origin}/feed`);
    await page.getByText('Why spaced repetition works', { exact: true }).waitFor();
    check(await page.locator('.discovery-lesson[open]').count() === 0, 'Feed lessons begin collapsed');
    const lesson = page.locator('.discovery-lesson').first();
    await lesson.locator(':scope > summary').click();
    await lesson.getByText('Quick question', { exact: true }).click();
    await lesson.getByRole('button').first().click();
    await page.getByRole('alert').filter({ hasText: 'Answer save test failure' }).waitFor();
    check(await lesson.getByRole('button').first().isEnabled(), 'Failed answer can be retried');
    await lesson.getByRole('button').first().click();
    await lesson.getByRole('status').waitFor();
    check(await lesson.getByRole('button').first().isDisabled(), 'Answered lessons prevent duplicate submission');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'output/playwright/feed-phone-expanded.png' });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Expanded Feed fits phone width');
    return { passed: passed.length, checks: passed };
  } finally {
    await page.unroute(reviewUrl);
    await page.unroute(blocksPattern);
    await page.unroute(feedPattern);
  }
}
