// Run only in a signed-in local demo CLI session. All server mutations are intercepted.
async sourcePage => {
  const origin = 'http://localhost:3000';
  if (!sourcePage.url().startsWith(origin)) throw new Error('Open the local demo workspace first.');
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block' });
  const page = await context.newPage();
  await page.goto(`${origin}/practice`);
  const report = { checks: [], layouts: [], pageErrors: [], writes: { submit: 0, reviews: 0, archive: 0, blocked: 0 } };
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const check = (condition, message) => { assert(condition, message); report.checks.push(message); };
  const onError = error => report.pageErrors.push(error.message);
  const original = await page.evaluate(() => ({ drafts: localStorage.getItem('learn_practice_drafts_v1'), theme: localStorage.getItem('theme'), design: localStorage.getItem('learn:practice:design') }));
  const quizzesResponse = await page.request.get(`${origin}/api/quizzes`);
  const quizzes = (await quizzesResponse.json()).items;
  assert(quizzes?.length >= 2, 'Sign in to the seeded local demo before running this audit.');
  const sourceQuiz = (await (await page.request.get(`${origin}/api/quizzes/${quizzes[0].id}`)).json()).item;
  const fixture = { ...sourceQuiz, questions: sourceQuiz.questions.slice(0, 3) };
  const first = fixture.questions[0];
  const second = fixture.questions[1];
  let failLoad = false;
  let delayLoad = false;
  let failSubmit = true;
  let failReviews = true;
  let failArchive = true;
  let submitGate;
  let archiveGate;
  const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
  };
  const mutationHandler = async route => {
    const request = route.request();
    const path = request.url().split('?')[0].replace(origin, '');
    const method = request.method();
    const json = body => ({ contentType: 'application/json', body: JSON.stringify(body) });
    if (method === 'GET' && path === `/api/quizzes/${fixture.id}`) {
      if (delayLoad) await page.waitForTimeout(650);
      await route.fulfill(failLoad ? { status: 503, ...json({ error: 'Practice loading test: retry available.' }) } : { status: 200, ...json({ item: fixture }) });
      return;
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return route.continue();
    if (path === '/api/quizzes/attempts') {
      report.writes.submit += 1;
      if (submitGate) await submitGate.promise;
      await page.waitForTimeout(350);
      const payload = request.postDataJSON();
      assert(payload.quizId === fixture.id, 'Attempt targeted an unexpected quiz.');
      await route.fulfill(failSubmit ? { status: 503, ...json({ error: 'Practice submit test: answers are safe.' }) } : { status: 200, ...json({ attemptId: 'audit-only', practiceSessionId: 'audit-only', score: 1, total: payload.answers.length, durationSeconds: payload.durationSeconds }) });
      return;
    }
    if (path === '/api/reviews') {
      report.writes.reviews += 1;
      await route.fulfill(failReviews ? { status: 503, ...json({ error: 'Practice review test: try again.' }) } : { status: 200, ...json({ item: { count: request.postDataJSON().items.length } }) });
      return;
    }
    if (path === `/api/quizzes/${fixture.id}` && method === 'DELETE') {
      report.writes.archive += 1;
      if (archiveGate) await archiveGate.promise;
      await route.fulfill(failArchive ? { status: 503, ...json({ error: 'Practice archive test: try again.' }) } : { status: 200, ...json({ archived: true }) });
      return;
    }
    report.writes.blocked += 1;
    await route.fulfill({ status: 503, ...json({ error: 'Audit intercepted this write; nothing was saved.' }) });
  };
  const visit = async route => {
    await page.goto(`${origin}/${route}`);
    await page.getByRole('main').waitFor();
    assert(!page.url().includes('/login'), 'The demo session expired.');
  };
  const openSet = async () => {
    await page.getByRole('button', { name: new RegExp(`^(Open|Resume) ${fixture.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).click();
    await page.getByRole('heading', { name: fixture.title, exact: true }).waitFor();
  };
  const start = async () => { await page.getByRole('button', { name: /^(Start|Resume)$/, exact: true }).click(); await page.getByRole('heading', { name: first.question, exact: true }).waitFor(); };
  const back = async () => { await page.getByRole('button', { name: 'Back to sets', exact: true }).click(); await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor(); };
  const clearDrafts = async () => page.evaluate(() => { localStorage.removeItem('learn_practice_drafts_v1'); window.dispatchEvent(new Event('learn:practice-drafts')); });
  const navigateWorkspace = async name => page.getByRole('navigation', { name: 'Sections', exact: true }).getByRole('button', { name: new RegExp(`^${name}(?:$|\\s)`) }).click();
  const choose = async choice => page.getByRole('button').filter({ hasText: choice.text }).last().click();
  const screenshot = async name => {
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => {
      const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
      const main = document.querySelector('main');
      const mainBox = main.getBoundingClientRect();
      const controls = [...main.querySelectorAll('button,input,select,textarea')].filter(visible);
      return { width: innerWidth, theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light', overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        clipped: controls.filter(element => { const box = element.getBoundingClientRect(); return box.left < Math.max(0, mainBox.left) - 2 || box.right > Math.min(innerWidth, mainBox.right) + 2; }).map(element => element.getAttribute('aria-label') || element.textContent.trim().slice(0, 50)),
        unnamed: controls.filter(element => !element.textContent.trim() && !element.getAttribute('aria-label') && !element.labels?.length).map(element => element.tagName) };
    });
    assert(layout.overflow <= 1 && !layout.clipped.length && !layout.unnamed.length, `${name}: ${JSON.stringify(layout)}`);
    report.layouts.push({ name, ...layout });
    await page.screenshot({ path: `output/playwright/${name}.png`, fullPage: true });
  };
  page.on('pageerror', onError);
  await page.route('**/api/**', mutationHandler);
  try {
    await visit("dashboard");
    await clearDrafts();
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('theme', theme), theme);
      for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        await page.setViewportSize(viewport);
        await visit('practice');
        await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).waitFor();
        check(await page.getByRole('heading', { name: first.question, exact: true }).count() === 0, `${theme}-${viewport.width}: library does not auto-start`);
        await screenshot(`practice-${theme}-${viewport.width}-library`);
        await openSet();
        await screenshot(`practice-${theme}-${viewport.width}-setup`);
        await start();
        await screenshot(`practice-${theme}-${viewport.width}-question`);
        await back();
        await clearDrafts();
      }
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await visit('practice');
    await page.getByRole('textbox', { name: 'Find a practice set' }).fill('No match audit');
    await page.getByText('No matching sets', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show all', exact: true }).click();
    await page.getByRole('button', { name: /^Saved / }).click();
    await page.getByText('No saved attempts', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Show all', exact: true }).click();
    report.checks.push('Library search, empty results and saved filter recovery');
    await page.getByLabel('Practice design', { exact: true }).click();
    await page.getByRole('button', { name: 'Ocean', exact: true }).click();
    check(await page.locator('.practice-design').getAttribute('data-design') === 'ocean', 'Practice palette changes appearance');
    check(!await page.getByRole('group', { name: 'Practice designs' }).isVisible(), 'Palette closes after selecting a design');
    check(await page.getByLabel('Practice design', { exact: true }).evaluate(element => element === document.activeElement), 'Palette selection restores keyboard focus');
    await page.getByLabel('Practice design', { exact: true }).click();
    await page.keyboard.press('Escape');
    check(await page.getByLabel('Practice design', { exact: true }).evaluate(element => element === document.activeElement), 'Palette Escape restores focus');
    await openSet();
    await page.waitForTimeout(1100);
    check(await page.getByRole('progressbar', { name: 'Questions answered' }).count() === 0, 'Setup does not start timer or answer progress');
    await start();
    await choose(first.choices.find(choice => choice.id === first.correct_answer_id));
    await page.getByRole('button', { name: 'Mark for review', exact: true }).click();
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await back();
    check(await page.locator('.practice-design').getAttribute('data-focus') === 'false' && await page.getByRole('button', { name: 'Create practice with AI' }).isVisible(), 'Leaving focus restores library controls');
    const draft = await page.evaluate(id => JSON.parse(localStorage.getItem('learn_practice_drafts_v1'))?.[id], fixture.id);
    check(draft?.answers[first.id] === first.correct_answer_id, 'Immediate exit preserves the last answer');
    await openSet();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    check(await page.getByRole('progressbar', { name: 'Questions answered' }).getAttribute('aria-valuenow') === '33', 'Resume restores answered progress');
    check(await page.getByRole('button', { name: 'Unmark question', exact: true }).getAttribute('aria-pressed') === 'true', 'Resume restores marks');
    await page.getByRole('button', { name: 'Pause timer', exact: true }).click();
    await page.getByRole('heading', { name: 'Take a breath.' }).waitFor();
    check(await page.getByRole('group', { name: /^Answers for/ }).count() === 0, 'Pause hides answers');
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('heading', { name: second.question, exact: true }).waitFor();
    await page.getByRole('button', { name: 'Previous question', exact: true }).click();
    check(await page.getByRole('button').filter({ hasText: first.choices.find(choice => choice.id === first.correct_answer_id).text }).last().getAttribute('aria-pressed') === 'true', 'Previous/next preserves selected answer');
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByRole('button', { name: 'Question 3', exact: true }).click();
    await page.getByRole('button', { name: 'Finish', exact: true }).click();
    await page.getByText('2 unanswered', { exact: true }).waitFor();
    check(report.writes.submit === 0, 'Unanswered finish requires explicit choice');
    await page.getByRole('button', { name: 'Finish anyway', exact: true }).evaluate(button => { button.click(); button.click(); });
    await page.getByText('Practice submit test: answers are safe.', { exact: true }).waitFor();
    check(report.writes.submit === 1, 'Rapid submit creates one request and failure keeps attempt');
    failSubmit = false;
    await page.getByRole('button', { name: 'Finish anyway', exact: true }).click();
    await page.getByRole('region', { name: 'Practice results' }).waitFor();
    check(await page.evaluate(id => !JSON.parse(localStorage.getItem('learn_practice_drafts_v1') || '{}')[id], fixture.id), 'Successful submission clears local draft');
    await screenshot('practice-results-desktop');
    await page.setViewportSize({ width: 320, height: 740 });
    await screenshot('practice-results-phone');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Save review cards', exact: true }).click();
    await page.getByText('Practice review test: try again.', { exact: true }).waitFor();
    failReviews = false;
    await page.getByRole('button', { name: 'Save review cards', exact: true }).click();
    check(await page.getByRole('button', { name: 'Cards saved', exact: true }).isDisabled(), 'Review card save retries and prevents duplicate successful save');
    await page.getByRole('button', { name: 'Review answers', exact: true }).click();
    check(await page.getByRole('group', { name: /^Answers for/ }).getByRole('button').first().isDisabled(), 'Submitted answers cannot mutate saved score');
    await page.getByRole('button', { name: 'Retry missed', exact: true }).click();
    await page.getByRole('heading', { name: second.question, exact: true }).waitFor();
    check(await page.getByRole('heading', { name: first.question, exact: true }).count() === 0, 'Retry includes only missed questions');
    await back();
    await clearDrafts();
    await visit(`quiz/${fixture.id}`);
    await page.getByRole('heading', { name: fixture.title, exact: true }).waitFor();
    report.checks.push('Explicit quiz deep link opens setup');
    await back();
    check(page.url().endsWith('/quizzes'), 'Leaving a deep-linked quiz updates the URL');
    await page.reload();
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    check(await page.getByRole('heading', { name: fixture.title, exact: true }).count() === 0, 'Reload after leaving quiz stays in library');
    for (let index = 0; index < 2; index += 1) {
      await page.keyboard.press('Control+k');
      await page.getByRole('textbox', { name: 'Search pages, notes, quizzes and actions' }).fill(fixture.title);
      await page.getByRole('listbox', { name: 'Results' }).getByRole('option').filter({ hasText: fixture.title }).first().click();
      await page.getByRole('heading', { name: fixture.title, exact: true }).waitFor();
      check(await page.getByRole('button', { name: 'Start', exact: true }).isVisible(), `Global search opens explicit quiz setup ${index + 1}`);
      if (index === 0) await back();
    }
    await page.getByRole('navigation', { name: 'Practice sections' }).getByRole('button', { name: 'Quizzes', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    report.checks.push('Explicit Quizzes navigation resets player to library');
    await openSet();
    await page.getByRole('button', { name: /^Cards Recall/ }).click();
    await start();
    check(await page.getByRole('group', { name: /^Answers for/ }).count() === 0, 'Cards hide choices until recall');
    await page.getByRole('button', { name: 'Reveal choices', exact: true }).click();
    await page.getByRole('group', { name: /^Answers for/ }).waitFor();
    report.checks.push('Cards reveal choices on request');
    await back();
    await clearDrafts();
    failLoad = true;
    await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).click();
    await page.getByRole('heading', { name: 'Unable to open this set', exact: true }).waitFor();
    failLoad = false;
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('heading', { name: fixture.title, exact: true }).waitFor();
    report.checks.push('Set-load failure retries without losing navigation');
    await back();
    delayLoad = true;
    await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).click();
    await back();
    await page.getByRole('button', { name: `Open ${quizzes[1].title}`, exact: true }).click();
    await page.getByRole('heading', { name: quizzes[1].title, exact: true }).waitFor();
    await page.waitForTimeout(750);
    check(await page.getByRole('heading', { name: fixture.title, exact: true }).count() === 0, 'Cancelled set loading cannot replace a newer selection');
    delayLoad = false;
    await back();
    await openSet();
    await page.getByRole('button', { name: 'Practice options', exact: true }).click();
    await page.getByRole('button', { name: 'Share', exact: true }).waitFor();
    await page.setViewportSize({ width: 320, height: 740 });
    await screenshot('practice-options-phone');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Archive set', exact: true }).click();
    await page.getByText('Practice archive test: try again.', { exact: true }).waitFor();
    failArchive = false;
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Archive set', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    check(await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).count() === 0, 'Archive failure retries and successful archive updates library');
    check(page.url().endsWith('/quizzes'), 'Archiving leaves the deep-linked URL');
    await navigateWorkspace('Friends');
    await page.getByRole('navigation', { name: 'Friends sections' }).waitFor();
    await navigateWorkspace('Practice');
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    check(await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).count() === 0, 'Archived set stays removed after workspace navigation');

    // Reload restores the real server fixture: every archive above was intercepted.
    await visit('practice');
    await clearDrafts();
    const beginPendingSubmit = async () => {
      await openSet();
      await start();
      await choose(first.choices[0]);
      await page.getByRole('button', { name: 'Questions', exact: true }).click();
      await page.getByRole('button', { name: 'Question 3', exact: true }).click();
      await page.getByRole('button', { name: 'Finish', exact: true }).click();
      await page.getByRole('button', { name: 'Finish anyway', exact: true }).click();
    };
    submitGate = deferred();
    await beginPendingSubmit();
    await navigateWorkspace('Friends');
    await page.getByRole('navigation', { name: 'Friends sections' }).waitFor();
    let completedSubmit = page.waitForResponse(response => response.url().endsWith('/api/quizzes/attempts') && response.request().method() === 'POST');
    submitGate.resolve();
    await completedSubmit;
    await page.waitForFunction(id => !JSON.parse(localStorage.getItem('learn_practice_drafts_v1') || '{}')[id], fixture.id);
    check(page.url().endsWith('/social'), 'Completed submit does not change new workspace');
    await navigateWorkspace('Practice');
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    check(await page.getByRole('button', { name: `Open ${fixture.title}`, exact: true }).isVisible(), 'Submit after unmount clears completed draft');

    submitGate = deferred();
    await beginPendingSubmit();
    await navigateWorkspace('Friends');
    await navigateWorkspace('Practice');
    await openSet();
    await page.getByRole('button', { name: 'Resume', exact: true }).click();
    await page.getByRole('button', { name: 'Questions', exact: true }).click();
    await page.getByRole('button', { name: /Question 1(?:, answered)?$/, exact: true }).click();
    await choose(first.choices[1]);
    await back();
    completedSubmit = page.waitForResponse(response => response.url().endsWith('/api/quizzes/attempts') && response.request().method() === 'POST');
    submitGate.resolve();
    await completedSubmit;
    await page.waitForTimeout(100);
    const newerDraft = await page.evaluate(id => JSON.parse(localStorage.getItem('learn_practice_drafts_v1') || '{}')[id], fixture.id);
    check(newerDraft?.answers[first.id] === first.choices[1].id, 'Older submit cannot clear a newer attempt draft');
    check(await page.getByRole('button', { name: `Resume ${fixture.title}`, exact: true }).isVisible(), 'Newer attempt remains resumable');
    submitGate = undefined;

    archiveGate = deferred();
    await openSet();
    await page.getByRole('button', { name: 'Practice options', exact: true }).click();
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: 'Archive set', exact: true }).click();
    await navigateWorkspace('Friends');
    await page.getByRole('navigation', { name: 'Friends sections' }).waitFor();
    const completedArchive = page.waitForResponse(response => response.url().endsWith(`/api/quizzes/${fixture.id}`) && response.request().method() === 'DELETE');
    archiveGate.resolve();
    await completedArchive;
    await page.waitForTimeout(100);
    check(page.url().endsWith('/social'), 'Completed archive does not change new workspace');
    await navigateWorkspace('Practice');
    await page.getByRole('textbox', { name: 'Find a practice set' }).waitFor();
    check(await page.getByRole('button', { name: new RegExp(`^(Open|Resume) ${fixture.title}$`) }).count() === 0, 'Archive after unmount removes cached set');
    archiveGate = undefined;

    await visit('games');
    await page.locator('.game-choices button').first().waitFor();
    await page.getByText('Setup', { exact: true }).click();
    await page.getByRole('button', { name: '1:30', exact: true }).click();
    await page.getByText('Setup', { exact: true }).click();
    await page.locator('.game-choices button').first().click();
    check(await page.locator('.game-choices button:disabled').count() > 0, 'Sprint locks answered choices');
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    check(await page.locator('.game-choices button:disabled').count() === 0, 'Sprint restart unlocks choices');
    await screenshot('practice-sprint-desktop');
    await visit('live');
    await page.getByRole('button', { name: 'Streak', exact: true }).click();
    check(await page.getByRole('button', { name: 'Streak', exact: true }).getAttribute('aria-pressed') === 'true', 'Live mode changes');
    await page.getByText('Correct answers build a multiplier up to ×3.', { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    await screenshot('practice-live-phone');
    await visit('calendar');
    const month = page.getByRole('region', { name: 'Calendar', exact: true }).getByRole('heading', { level: 3 }).first();
    await month.waitFor();
    const initialMonth = await month.innerText();
    await page.getByRole('button', { name: 'Next month', exact: true }).click();
    check(await month.innerText() !== initialMonth, 'Calendar month navigation advances');
    await page.getByRole('button', { name: 'Previous month', exact: true }).click();
    check(await month.innerText() === initialMonth, 'Calendar month navigation returns');
    await page.getByRole('button', { name: 'Next year', exact: true }).click();
    await page.getByRole('button', { name: 'Previous year', exact: true }).click();
    check(await month.innerText() === initialMonth, 'Calendar year navigation returns');
    await page.getByRole('button', { name: 'Calendar connections', exact: true }).click();
    await page.getByRole('dialog', { name: 'Calendar accounts' }).waitFor();
    await screenshot('practice-calendar-connections');
    await page.getByRole('button', { name: 'Close calendar connections', exact: true }).click();
    assert(report.pageErrors.length === 0, `Uncaught errors: ${report.pageErrors.join('; ')}`);
    await page.evaluate(report => sessionStorage.setItem("learn:practice:audit-result", JSON.stringify(report)), report);
    return report;
  } catch (error) {
    report.failure = error.message;
    return report;
  } finally {
    submitGate?.resolve();
    archiveGate?.resolve();
    console.log(JSON.stringify(report));
    await page.unrouteAll({ behavior: 'wait' });
    page.off('pageerror', onError);
    await page.evaluate(original => {
      for (const [key, value] of [['learn_practice_drafts_v1', original.drafts], ['theme', original.theme], ['learn:practice:design', original.design]]) {
        if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
      }
      window.dispatchEvent(new Event('learn:practice-drafts'));
    }, original);
    await context.close();
  }
}
