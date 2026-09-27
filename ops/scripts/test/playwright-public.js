// Run in a dedicated anonymous local Playwright CLI session:
// npx --yes --package @playwright/cli@0.1.21 playwright-cli -s=publicqa run-code --filename=ops/scripts/test/playwright-public.js
// Clears this browser session's cookies. Auth and invite writes are intercepted;
// no accounts, access requests, invitations, or external AI calls are created.
async (page) => {
  const auditLayouts = async (page) => {
  const origin = 'http://localhost:3000';
  if (!page.url().startsWith(origin)) throw new Error('Use the local development server.');
  const report = { layouts: [], pageErrors: [] };
  const recordError = error => report.pageErrors.push(error.message);
  page.on('pageerror', recordError);
  await page.context().clearCookies();
  await page.route('**/api/invites/accept?token=public-qa-ready', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invite: { email: 'preview@example.com', ready: true, expired: false, role: 'learner', status: 'pending' } }) }));
  await page.route('**/api/invites/accept?token=public-qa-expired', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invite: { email: 'preview@example.com', ready: false, expired: true, role: 'learner', status: 'expired' } }) }));
  try {
    for (const theme of ['color', 'light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('theme', theme), theme);
      for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
        await page.setViewportSize(viewport);
        for (const [name, path] of [['home', '/'], ['showcase', '/showcase'], ['signin', '/login'], ['request', '/login?mode=request'], ['invite-ready', '/invite/public-qa-ready'], ['invite-expired', '/invite/public-qa-expired']]) {
          if ([768, 320].includes(viewport.width) && !['home', 'showcase'].includes(name)) continue;
          const response = await page.goto(`${origin}${path}`);
          await page.locator('main').waitFor();
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(500);
          const layout = await page.evaluate(() => {
            const visible = element => element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
            const controls = [...document.querySelectorAll('main button, main input:not([type=hidden]), main select, main textarea, main [role=button]')].filter(visible);
            const clippedLabels = controls.filter(element => element.matches('button, [role=button]')).filter(element => [...element.childNodes].some(node => {
              if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) return false;
              const range = document.createRange(); range.selectNodeContents(node);
              const text = range.getBoundingClientRect(); const box = element.getBoundingClientRect();
              return text.left < box.left - 1 || text.right > box.right + 1;
            })).map(element => element.textContent.trim().slice(0, 80));
            return {
              theme: ['light', 'dark', 'color'].find(mode => document.documentElement.classList.contains(mode)),
              overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
              mainLandmarks: document.querySelectorAll('main').length,
              headings: [...document.querySelectorAll('h1,h2')].filter(visible).map(element => element.textContent.trim()),
              unnamed: controls.filter(element => !element.textContent.trim() && !element.getAttribute('aria-label') && !element.getAttribute('title') && !element.getAttribute('aria-labelledby') && !element.labels?.length).map(element => element.outerHTML.slice(0, 180)),
              clippedLabels,
            };
          });
          const entry = { name, path, width: viewport.width, expectedTheme: theme, status: response.status(), ...layout };
          report.layouts.push(entry);
          await page.screenshot({ path: `output/playwright/public/${theme}-${viewport.width}-${name}.png`, fullPage: true });
          console.log(JSON.stringify(entry));
        }
      }
    }
  } finally {
    await page.unroute('**/api/invites/accept?token=public-qa-ready');
    await page.unroute('**/api/invites/accept?token=public-qa-expired');
    page.off('pageerror', recordError);
  }
  report.failures = report.layouts.filter(item => item.status !== 200 || item.theme !== item.expectedTheme || item.overflow > 1 || item.mainLandmarks !== 1 || item.unnamed.length || item.clippedLabels.length);
  report.passed = report.layouts.length - report.failures.length;
  return report;
};

  const auditInvites = async (page) => {
  const origin = 'http://localhost:3000';
  if (!page.url().startsWith(origin)) throw new Error('Use the local development server.');
  page.setDefaultTimeout(12000);
  await page.context().clearCookies();
  const report = { checks: [], requests: [], pageErrors: [] };
  const verify = (condition, description) => { if (!condition) throw new Error(description); report.checks.push(description); };
  const recordError = error => report.pageErrors.push(error.message);
  page.on('pageerror', recordError);
  let lookup = 'invalid';
  let submission = 'offline';
  let releaseRequest;
  let gate = Promise.resolve();
  let posts = 0;
  const handler = async route => {
    if (route.request().method() === 'GET') {
      report.requests.push({ method: 'GET', mode: lookup });
      if (lookup === 'offline') return route.abort('failed');
      if (lookup === 'rate-limit') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: invite lookup rate limited.' }) });
      if (lookup === 'invalid') return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: invitation not found.' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ invite: { email: 'preview@example.com', ready: true, expired: false, role: 'learner', status: 'pending' } }) });
    }
    posts += 1;
    report.requests.push({ method: 'POST', mode: submission });
    const body = route.request().postDataJSON();
    verify(body.email === 'preview@example.com' && body.token === 'public-qa-invite', 'Invite submission binds the verified email and current token');
    await gate;
    if (submission === 'offline') return route.abort('failed');
    if (submission === 'rejected') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: invitation could not be accepted.' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: 'preview-user' }, createdUser: true }) });
  };
  await page.route('**/api/invites/accept**', handler);
  await page.route('**/dashboard?onboarding=1', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Mock onboarding</h1></main>' }));
  try {
    await page.goto(`${origin}/invite/public-qa-invite`);
    await page.getByRole('alert').filter({ hasText: 'Fixture: invitation not found.' }).waitFor();
    verify(await page.getByRole('textbox').count() === 0, 'Invalid invitation does not expose account-creation fields');
    verify(await page.getByRole('link', { name: 'Request an invite', exact: true }).getAttribute('href') === '/login?mode=request', 'Invalid invite leads to the actual request-access form');
    lookup = 'rate-limit';
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Fixture: invite lookup rate limited.' }).waitFor();
    verify(await page.getByRole('button', { name: 'Try again', exact: true }).isEnabled(), 'Rate-limited invite lookup offers Retry instead of treating the token as invalid');
    lookup = 'offline';
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'We couldn’t check your invite.' }).waitFor();
    verify(await page.getByRole('button', { name: 'Try again', exact: true }).isEnabled(), 'Invite lookup connection failure exposes Retry');
    lookup = 'ready';
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
    verify(await page.getByRole('textbox', { name: /email/i }).count() === 0 && await page.getByText('preview@example.com', { exact: true }).count() === 1, 'Verified invite email is visible and cannot be edited');
    const submit = page.getByRole('button', { name: 'Create account', exact: true });
    verify(await submit.isDisabled(), 'Invite requires a name and valid password');
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Preview Learner');
    await page.getByLabel('Create a password', { exact: true }).fill('short');
    verify(await submit.isDisabled(), 'Invite rejects a short password before submission');
    await page.getByLabel('Create a password', { exact: true }).fill('Preview12345!');
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    verify(await page.getByLabel('Create a password', { exact: true }).getAttribute('type') === 'text', 'Invite supports password visibility');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    await submit.click();
    await page.getByRole('alert').filter({ hasText: 'Your details are still here' }).waitFor();
    verify(await page.getByRole('textbox', { name: 'Name', exact: true }).inputValue() === 'Preview Learner' && await page.getByLabel('Create a password', { exact: true }).inputValue() === 'Preview12345!', 'Failed invite submission preserves form details for retry');
    submission = 'rejected';
    await submit.click();
    await page.getByRole('alert').filter({ hasText: 'Fixture: invitation could not be accepted.' }).waitFor();
    verify(await submit.isEnabled(), 'Rejected invite response returns the form to a usable state');
    submission = 'success';
    const before = posts;
    gate = new Promise(resolve => { releaseRequest = resolve; });
    await submit.click();
    for (let attempt = 0; attempt < 20 && posts === before; attempt++) await page.waitForTimeout(50);
    verify(posts === before + 1 && await page.getByRole('button', { name: 'Creating your account…', exact: true }).isDisabled(), 'Pending account creation disables duplicate submission');
    verify(await page.getByRole('textbox', { name: 'Name', exact: true }).isDisabled(), 'Pending account creation locks the submitted details');
    releaseRequest();
    gate = Promise.resolve();
    await page.getByRole('heading', { name: 'Mock onboarding' }).waitFor();
    verify(page.url() === `${origin}/dashboard?onboarding=1`, 'Accepted invitation opens onboarding');
  } finally {
    releaseRequest?.();
    await page.unroute('**/api/invites/accept**', handler);
    await page.unroute('**/dashboard?onboarding=1');
    page.off('pageerror', recordError);
  }
  return report;
};

  const auditExplore = async (page) => {
  const origin = 'http://localhost:3000';
  if (!page.url().startsWith(origin)) throw new Error('Use the local development server.');
  page.setDefaultTimeout(12000);
  await page.context().clearCookies();
  const report = { checks: [], pageErrors: [], externalRequests: [] };
  const verify = (condition, description) => {
    if (!condition) throw new Error(description);
    report.checks.push(description);
  };
  const recordError = error => report.pageErrors.push(error.message);
  const recordRequest = request => { if (!request.url().startsWith(origin)) report.externalRequests.push(request.url()); };
  page.on('pageerror', recordError);
  page.on('request', recordRequest);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(origin);
    await page.getByRole('heading', { name: 'Learn it. Make it yours.', exact: true }).waitFor();
    for (const [label, view] of [['Studio', 'studio'], ['Practice', 'practice'], ['Calendar', 'calendar']]) {
      verify(await page.getByRole('link', { name: `Explore ${label}`, exact: true }).getAttribute('href') === `/showcase?view=${view}`, `Home ${label} card links to its matching interactive tour`);
    }
    verify(await page.getByRole('link', { name: 'Get started', exact: true }).getAttribute('href') === '/login?mode=request', 'Home primary CTA opens request access');
    await page.getByRole('link', { name: 'Get started', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
    verify(page.url().includes('mode=request'), 'Get started reaches the actual access form');
    await page.goto(origin);
    const demo = page.locator('[data-demo-editor]');
    await demo.getByRole('application', { name: 'Design page 1', exact: true }).waitFor();
    verify(await demo.getByRole('link', { name: 'Open Studio workspace', exact: true }).getAttribute('href') === '/dashboard', 'Editable Studio demo leads to the workspace');
    await demo.getByRole('button', { name: 'Apricot', exact: true }).click();
    verify(await demo.getByRole('button', { name: 'Apricot', exact: true }).getAttribute('aria-pressed') === 'true' && await demo.getByLabel('Page color', { exact: true }).inputValue() === '#f6c8b6', 'Studio demo updates its actual page color');
    verify(await demo.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), 'Public page edit is undoable');
    await page.getByRole('tab', { name: 'Create', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    verify(await page.getByRole('tab', { name: 'Practice', exact: true }).getAttribute('aria-selected') === 'true', 'Home preview tabs support arrow keys');
    await page.getByRole('button', { name: /Read it once/ }).click();
    await page.getByRole('status').filter({ hasText: 'Try recalling it.' }).waitFor();
    verify(true, 'Practice example provides helpful feedback for an incorrect answer');
    await page.getByRole('button', { name: /Recall it from memory/ }).click();
    await page.getByRole('status').filter({ hasText: 'That’s it!' }).waitFor();
    verify(true, 'Practice example recognizes the correct answer');
    await page.getByRole('tab', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Fri 16', exact: true }).click();
    await page.getByText('Finish that project', { exact: true }).waitFor();
    verify(await page.getByRole('button', { name: 'Fri 16', exact: true }).getAttribute('aria-pressed') === 'true', 'Calendar example changes the active day and event');
    const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    await page.getByRole('button', { name: wasDark ? 'Light' : 'Dark', exact: true }).click();
    await page.waitForFunction(dark => document.documentElement.classList.contains('dark') !== dark, wasDark);
    verify(true, 'Public theme control changes the rendered theme');
    await page.reload();
    verify(await page.evaluate(() => document.documentElement.classList.contains('dark')) !== wasDark, 'Public theme choice survives reload');
    await page.getByRole('link', { name: 'Take a look', exact: true }).click();
    await page.getByRole('heading', { name: 'Find your flow.', exact: true }).waitFor();
    verify(await page.getByRole('tab').count() === 5, 'Product tour exposes five visual examples');
    await page.getByRole('tab', { name: 'Create', exact: true }).focus();
    await page.keyboard.press('End');
    verify(await page.getByRole('tab', { name: 'Connect', exact: true }).getAttribute('aria-selected') === 'true', 'Tour tabs support End-key navigation');
    await page.keyboard.press('Home');
    verify(await page.getByRole('tab', { name: 'Create', exact: true }).getAttribute('aria-selected') === 'true', 'Tour tabs support Home-key navigation');
    await page.getByRole('tab', { name: 'Understand', exact: true }).click();
    await page.getByRole('button', { name: 'Show me an example', exact: true }).click();
    await page.getByText(/Try explaining gravity to a friend/).waitFor();
    verify(await page.getByRole('button', { name: 'Hide example', exact: true }).getAttribute('aria-expanded') === 'true', 'Tutor example expands in place without an AI request');
    await page.getByRole('button', { name: 'Hide example', exact: true }).click();
    verify(await page.getByText(/Try explaining gravity to a friend/).count() === 0, 'Tutor example collapses again');
    for (const [view, tab] of [['studio', 'Create'], ['practice', 'Practice'], ['calendar', 'Plan']]) {
      await page.goto(`${origin}/showcase?view=${view}`);
      await page.waitForFunction(label => [...document.querySelectorAll('[role=tab]')].some(element => element.textContent.trim() === label && element.getAttribute('aria-selected') === 'true'), tab);
      verify(true, `Home path deep link selects the ${tab} tour`);
    }
    await page.goto(`${origin}/showcase?view=unknown`);
    verify(await page.getByRole('tab', { name: 'Create', exact: true }).getAttribute('aria-selected') === 'true', 'Unknown tour deep links safely use Create');
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ['Create', 'Understand', 'Practice', 'Plan', 'Connect']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      verify(await page.getByRole('tab', { name: tab, exact: true }).getAttribute('aria-selected') === 'true', `Phone tour can select ${tab}`);
      verify(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), `Phone ${tab} scene stays within the document width`);
    }
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${origin}/showcase?view=ai`);
      await page.getByRole('button', { name: 'Show me an example', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(350);
      const panel = await page.getByRole('tabpanel').boundingBox();
      const disclosure = await page.getByText('Sample response · No AI request is sent', { exact: true }).boundingBox();
      verify(disclosure.y + disclosure.height <= panel.y + panel.height, `Expanded tutor sample remains readable at ${width}px`);
      await page.screenshot({ path: `output/playwright/public/tutor-expanded-viewport-${width}.png`, fullPage: false });
    }
    await page.goto(`${origin}/intro-classic`);
    verify(page.url() === `${origin}/showcase`, 'Legacy intro routes into the redesigned tour');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(origin);
    verify(await page.getByRole('tabpanel').evaluate(panel => [...panel.querySelectorAll('*')].every(element => getComputedStyle(element).animationName === 'none')), 'Reduced motion disables preview scene animation');
    await page.screenshot({ path: 'output/playwright/public/home-phone-reduced-motion.png', fullPage: true });
  } finally {
    page.off('pageerror', recordError);
    page.off('request', recordRequest);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  }
  return report;
};

  const auditAuth = async (page) => {
  const origin = 'http://localhost:3000';
  if (!page.url().startsWith(origin)) throw new Error('Use the local development server.');
  page.setDefaultTimeout(12000);
  await page.context().clearCookies();
  const report = { checks: [], requests: [], pageErrors: [] };
  const recordError = error => report.pageErrors.push(error.message);
  page.on('pageerror', recordError);
  const verify = (condition, description) => {
    if (!condition) throw new Error(description);
    report.checks.push(description);
  };
  let responseMode = 'invalid';
  let releaseRequest;
  let gate = Promise.resolve();
  let requestCount = 0;
  const mockAuth = async route => {
    const endpoint = route.request().url().split('/api/')[1];
    requestCount += 1;
    report.requests.push({ endpoint, method: route.request().method() });
    await gate;
    if (responseMode === 'offline') return route.abort('failed');
    if (responseMode === 'rate-limit') return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: too many attempts. Try again later.' }) });
    if (responseMode === 'invalid') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: invalid credentials.' }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture: access request saved.', user: { id: 'preview-user' } }) });
  };
  await page.route('**/api/auth/login', mockAuth);
  await page.route('**/api/auth/signup-request', mockAuth);
  await page.route('**/dashboard**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Mock destination</h1></main>' }));
  await page.route('**/studio?tab=docs', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<main><h1>Mock destination</h1></main>' }));
  const submit = () => page.locator('form button[type=submit]');
  const fillLogin = async () => {
    await page.getByRole('textbox', { name: 'Username or email', exact: true }).fill('public-preview');
    await page.getByLabel('Password', { exact: true }).fill('Preview12345!');
  };
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${origin}/login`);
    verify(await submit().isDisabled(), 'Sign in requires credentials');
    await fillLogin();
    await page.getByRole('button', { name: 'Show password', exact: true }).click();
    verify(await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'text', 'Password visibility is explicit');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click();
    verify(await page.getByLabel('Password', { exact: true }).getAttribute('type') === 'password', 'Password visibility can be restored');
    gate = new Promise(resolve => { releaseRequest = resolve; });
    await submit().click();
    for (let attempt = 0; attempt < 20 && requestCount === 0; attempt++) await page.waitForTimeout(50);
    verify(requestCount === 1 && await submit().isDisabled(), 'Pending login disables duplicate submission');
    releaseRequest();
    gate = Promise.resolve();
    await page.getByRole('alert').filter({ hasText: 'Fixture: invalid credentials.' }).waitFor();
    verify(await page.getByRole('textbox', { name: 'Username or email', exact: true }).inputValue() === 'public-preview', 'Failed login preserves username');
    verify(await page.getByLabel('Password', { exact: true }).inputValue() === 'Preview12345!', 'Failed login preserves password for correction');
    responseMode = 'offline';
    await submit().click();
    await page.getByRole('alert').filter({ hasText: /connection|connect/i }).waitFor();
    verify(await submit().isEnabled(), 'Transport error returns login to a retryable state');
    responseMode = 'rate-limit';
    await submit().click();
    await page.getByRole('alert').filter({ hasText: 'Fixture: too many attempts.' }).waitFor();
    verify(await submit().isEnabled(), 'Rate-limit feedback remains visible without a stuck pending state');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    verify(await page.getByText('Ask an admin to verify your account and issue a fresh invite.', { exact: true }).count() > 0, 'Forgot password explains the actual admin reset workflow');
    await page.getByRole('button', { name: 'Request access', exact: true }).click();
    verify(await page.locator('#password-help').count() === 0, 'Switching to access request closes password help');
    verify(page.url().includes('mode=request'), 'Access-mode switch updates the URL');
    await page.reload();
    await page.getByRole('textbox', { name: 'Name', exact: true }).waitFor();
    verify(await submit().isDisabled(), 'Direct request-access URL opens the form with validation enabled');
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Preview Learner');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('invalid');
    await page.getByRole('textbox', { name: /^What’s on your mind/ }).fill('Learn through clear visual projects.');
    verify(await submit().isDisabled(), 'Access request rejects an invalid email before submission');
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill('preview@example.com');
    await page.getByRole('radio', { name: 'Creator', exact: true }).check();
    verify(await page.getByRole('radio', { name: 'Creator', exact: true }).isChecked(), 'Visual role choices remain accessible radio inputs');
    responseMode = 'offline';
    await submit().click();
    await page.getByRole('alert').filter({ hasText: 'Your details are still here' }).waitFor();
    verify(await page.getByRole('textbox', { name: /^What’s on your mind/ }).inputValue() === 'Learn through clear visual projects.', 'Failed access request preserves the learning goal');
    responseMode = 'rate-limit';
    await submit().click();
    await page.getByRole('alert').filter({ hasText: 'Fixture: too many attempts.' }).waitFor();
    verify(await submit().isEnabled(), 'Access-request rate limits remain retryable');
    responseMode = 'success';
    const beforeRequest = requestCount;
    gate = new Promise(resolve => { releaseRequest = resolve; });
    await submit().click();
    for (let attempt = 0; attempt < 20 && requestCount === beforeRequest; attempt++) await page.waitForTimeout(50);
    verify(requestCount === beforeRequest + 1 && await submit().isDisabled(), 'Pending access request prevents duplicate sends');
    verify(await page.getByRole('textbox', { name: 'Name', exact: true }).isDisabled(), 'Pending access request locks the submitted details');
    releaseRequest();
    gate = Promise.resolve();
    await page.getByRole('heading', { name: 'You’re on the list.', exact: true }).waitFor();
    verify(await page.getByRole('status').innerText().then(text => text.includes('An invitation is needed')), 'Successful request shows honest admin-review confirmation');
    verify(await page.getByText('preview@example.com', { exact: true }).count() === 1, 'Successful request identifies the submitted email');
    await page.getByRole('button', { name: 'Back to sign in', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back.', exact: true }).waitFor();
    verify(!page.url().includes('mode=request'), 'Confirmation returns to sign in cleanly');
    await page.goto(`${origin}/login?redirect=%2Fstudio%3Ftab%3Ddocs`);
    await fillLogin();
    responseMode = 'success';
    await submit().click();
    await page.getByRole('heading', { name: 'Mock destination' }).waitFor();
    verify(page.url() === `${origin}/studio?tab=docs`, 'Successful login preserves a safe in-app return path');
    await page.goto(`${origin}/login?redirect=https%3A%2F%2Fevil.example`);
    await fillLogin();
    await submit().click();
    await page.getByRole('heading', { name: 'Mock destination' }).waitFor();
    verify(page.url() === `${origin}/dashboard`, 'Successful login rejects an external redirect');
  } finally {
    releaseRequest?.();
    await page.unroute('**/api/auth/login', mockAuth);
    await page.unroute('**/api/auth/signup-request', mockAuth);
    await page.unroute('**/dashboard**');
    await page.unroute('**/studio?tab=docs');
    page.off('pageerror', recordError);
  }
  return report;
};
  const reports = {};
  for (const [name, audit] of [['layouts', auditLayouts], ['explore', auditExplore], ['auth', auditAuth], ['invites', auditInvites]]) {
    const result = await audit(page);
    reports[name] = result;
    if (result.failures?.length || result.pageErrors?.length) {
      throw new Error(`${name} audit failed: ${JSON.stringify({ failures: result.failures, pageErrors: result.pageErrors })}`);
    }
  }
  return {
    layoutsPassed: reports.layouts.passed,
    interactionChecks: reports.explore.checks.length + reports.auth.checks.length + reports.invites.checks.length,
    reports,
  };
}
