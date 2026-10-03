// Isolated local fixtures: no project writes reach the server. Run in a signed-in CLI session.
async (sourcePage) => {
  const origin = 'http://localhost:3000';
  const context = await sourcePage.context().browser().newContext({ storageState: await sourcePage.context().storageState(), serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const report = { checks: [], layouts: [], errors: [], screenshots: [] };
  const verify = (condition, message) => { if (!condition) throw new Error(message); report.checks.push(message); };
  page.on('pageerror', error => report.errors.push(error.message));
  const element = (id, type, x, y, width, height, content, style) => ({ id, type, x, y, width, height, content, style, rotation: 0, z: 1, groupId: null, locked: false, hidden: false });
  const doc = { version: 2, kind: 'learn-design', id: 'design_edge_fixture', name: 'Editor edge fixture', format: 'presentation', width: 1280, height: 720, theme: 'minimal', pages: [{ id: 'edge_page', background: '#ffffff', backgroundRole: null, pattern: 'none', notes: '', layout: null, spec: null, hidden: false, transition: 'none', elements: [
    element('edge_text', 'text', 110, 90, 690, 100, 'Room for ideas', { fontFamily: 'sans', fontSize: 68, fontWeight: 700, color: '#18243b', fit: 'grow', padding: 0 }),
    element('edge_shape', 'shape', 130, 340, 260, 190, '', { shape: 'rounded', fill: '#9374e8', borderRadius: 24 }),
    element('edge_image', 'image', 860, 180, 240, 330, '/icon.svg', { fit: 'cover', focusX: 0.5, focusY: 0.5 }),
  ] }] };
  const record = { id: doc.id, title: doc.name, content: doc, document_type: 'canvas', updated_at: '2026-09-27 01:00:00' };
  let saved = JSON.parse(JSON.stringify(doc));
  let writes = [];
  let failSave = false;
  let releaseSave;
  let delaySave = false;
  await context.route('**/api/**', route => ['GET', 'HEAD', 'OPTIONS'].includes(route.request().method()) ? route.continue() : route.fulfill({ status: 503, json: { error: 'Read-only audit' } }));
  await context.route('**/api/canvas*', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      const body = request.url().includes('?id=') ? { item: { ...record, content: saved } } : { items: [{ ...record, content: saved }] };
      await route.fulfill({ json: body });
    } else if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body.content);
      if (delaySave) { delaySave = false; await new Promise(resolve => { releaseSave = resolve; }); }
      if (failSave) await route.fulfill({ status: 503, json: { error: 'Fixture save unavailable' } });
      else { saved = body.content; await route.fulfill({ json: { item: { ...record, content: saved } } }); }
    } else await route.fulfill({ status: 405, json: { error: 'Fixture writes only' } });
  });
  const stage = page.getByRole('application', { name: 'Design page 1', exact: true });
  const node = id => stage.locator(`[data-design-element="${id}"]`);
  const geometry = id => node(id).evaluate(el => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height), transform: el.style.transform }));
  const select = async id => { const box = await node(id).boundingBox(); await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); };
  const drag = async (locator, dx, dy) => { const box = await locator.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 }); await page.mouse.up(); };
  const save = async () => { await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor(); };
  const screenshot = async name => { const path = `output/playwright/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path); };
  try {
    await page.goto(`${origin}/studio`);
    await page.getByRole('button', { name: 'Open Editor edge fixture', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Account: LEARN Admin', exact: true }).waitFor();
    for (const size of [{ width: 320, height: 568 }, { width: 767, height: 600 }, { width: 1023, height: 768 }, { width: 1024, height: 768 }, { width: 2048, height: 1024 }, { width: 2560, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const layout = await page.evaluate(() => { const lobby = document.querySelector('.studio-lobby').getBoundingClientRect(); const sidebar = document.querySelector('.learn-sidebar').getBoundingClientRect(); return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, lobby: { x: lobby.x, right: lobby.right, width: lobby.width }, sidebarBottom: sidebar.bottom }; });
      verify(layout.scrollWidth <= size.width + 1 && layout.lobby.x >= 0 && layout.lobby.right <= size.width + 1, `Studio fits ${size.width}×${size.height}`);
      if (size.width >= 2048) verify(layout.lobby.width > size.width * 0.8 && layout.sidebarBottom === size.height, `Studio and sidebar use the wide viewport at ${size.width}px`);
      report.layouts.push(layout);
    }
    await page.getByRole('button', { name: 'Collapse sidebar to icons' }).click();
    const brand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
    verify(await brand.locator('img').count() === 1 && await page.locator('.learn-sidebar').getByRole('button', { name: 'Expand sidebar' }).count() === 1, 'Collapsed rail has one brand expansion control');
    await brand.press('Enter');
    verify(page.url().endsWith('/studio') && await page.getByRole('button', { name: 'Collapse sidebar to icons' }).isVisible(), 'Brand keyboard activation expands without navigating');
    await screenshot('studio-wide-responsive');
    await page.setViewportSize({ width: 1440, height: 500 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    verify(await page.evaluate(() => scrollY > 0), 'Lobby scroll setup is meaningful');
    await page.getByRole('list', { name: 'Projects', exact: true }).getByRole('button', { name: /Editor edge fixture/ }).click();
    await stage.waitFor();
    verify(await page.evaluate(() => scrollY === 0), 'Opening a project clears lobby document scroll');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    await select('edge_shape');
    const start = await geometry('edge_shape');
    await drag(node('edge_shape'), 36, 20);
    const moved = await geometry('edge_shape');
    verify(moved.x > start.x + 20 && moved.y > start.y + 10, 'Pointer drag moves selected shape');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    verify(Math.abs((await geometry('edge_shape')).x - start.x) < 1, 'Undo restores drag');
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    verify(Math.abs((await geometry('edge_shape')).x - moved.x) < 1, 'Redo restores drag');
    await select('edge_shape');
    await drag(stage.getByRole('button', { name: 'Resize se', exact: true }), 30, 20);
    verify((await geometry('edge_shape')).width > moved.width, 'Resize handle changes geometry');
    await drag(stage.getByRole('button', { name: 'Rotate selection' }), 38, 22);
    verify((await geometry('edge_shape')).transform.includes('rotate'), 'Rotation handle rotates shape');
    await page.getByRole('button', { name: 'Transparency', exact: true }).click();
    const slider = page.getByRole('slider', { name: /^Transparency/ });
    const beforeSlider = await geometry('edge_shape');
    await slider.focus();
    const originalRange = Number(await slider.inputValue());
    await slider.press('ArrowRight');
    verify(Number(await slider.inputValue()) === originalRange + 1 && (await geometry('edge_shape')).x === beforeSlider.x, 'Slider arrows change transparency without nudging shape');
    await page.keyboard.press('Escape');
    await save();
    await select('edge_shape');
    await page.getByRole('button', { name: 'Object actions', exact: true }).click();
    await page.getByRole('dialog', { name: 'Object actions', exact: true }).getByRole('button', { name: 'Lock', exact: true }).click();
    await page.getByRole('button', { name: 'Unlock selection', exact: true }).waitFor();
    verify(await page.getByRole('button', { name: 'Transparency', exact: true }).count() === 0, 'Locked selection exposes unlock without style controls');
    await page.getByRole('button', { name: 'Unlock selection', exact: true }).click();
    const textBox = await node('edge_text').boundingBox();
    await page.mouse.dblclick(textBox.x + 55, textBox.y + textBox.height / 2);
    const inlineText = stage.getByRole('textbox');
    await inlineText.fill('Working canvas edits');
    const saveResponse = page.waitForResponse(response => response.url().includes('/api/canvas') && response.request().method() === 'PUT');
    await inlineText.press('Control+s');
    await saveResponse;
    verify(saved.pages[0].elements.find(item => item.id === 'edge_text').content === 'Working canvas edits', 'Ctrl+S saves while typing canvas text');
    await page.getByRole('textbox', { name: 'Design title' }).fill('Working edge fixture');
    const titleSave = page.waitForResponse(response => response.url().includes('/api/canvas') && response.request().method() === 'PUT');
    await page.getByRole('textbox', { name: 'Design title' }).press('Control+s');
    await titleSave;
    verify(saved.name === 'Working edge fixture', 'Ctrl+S saves from title input');
    await select('edge_image');
    const picture = await node('edge_image').boundingBox();
    await node('edge_image').locator('img').waitFor();
    await page.waitForFunction(() => { const img = document.querySelector('[role="application"] [data-design-element="edge_image"] img'); return img?.complete && img.naturalWidth > 0; });
    await page.mouse.dblclick(picture.x + picture.width / 2, picture.y + picture.height / 2);
    verify(await page.getByRole('button', { name: 'Crop (or double-click the picture)', exact: true }).getAttribute('aria-pressed') === 'true', 'Double-click enters picture crop');
    await page.waitForTimeout(100);
    await drag(node('edge_image'), 20, 8);
    await save();
    const cropped = saved.pages[0].elements.find(item => item.id === 'edge_image');
    verify(cropped.style.focusX !== 0.5 || cropped.style.focusY !== 0.5, `Crop drag changes picture focal point: ${JSON.stringify(cropped)}`);
    await page.getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('button', { name: 'Image or embed URL', exact: true }).click();
    const pictureCount = await stage.locator('[data-design-element]').count();
    await page.getByRole('textbox', { name: 'Image or embed URL', exact: true }).fill('https://example.com/picture.png');
    await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Image or embed URL', exact: true }) }).getByRole('button', { name: 'Insert', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Use Uploads for this picture' }).waitFor();
    verify(await stage.locator('[data-design-element]').count() === pictureCount, 'External picture URL gives upload guidance without adding a blank object');
    await page.getByRole('textbox', { name: 'Image or embed URL', exact: true }).fill(`${origin}/icon.svg`);
    await page.locator('form').filter({ has: page.getByRole('textbox', { name: 'Image or embed URL', exact: true }) }).getByRole('button', { name: 'Insert', exact: true }).click();
    verify(await stage.locator('img[src="/icon.svg"]').count() === 2, 'Same-site absolute picture URL renders as a portable relative asset');
    await page.getByRole('button', { name: 'Dismiss message', exact: true }).click();
    await screenshot('editor-interactions');

    failSave = true;
    await page.getByRole('textbox', { name: 'Design title' }).fill('Recovered draft');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Fixture save unavailable' }).waitFor();
    verify(await page.evaluate(() => Object.values(localStorage).some(value => value.includes('Recovered draft'))), 'Save failure retains local draft');
    failSave = false;
    await save();
    verify(saved.name === 'Recovered draft', 'Retry saves retained content');
    delaySave = true;
    await page.getByRole('textbox', { name: 'Design title' }).fill('First pending edit');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /^Saving/ }).waitFor();
    await page.getByRole('textbox', { name: 'Design title' }).fill('Latest pending edit');
    releaseSave(); releaseSave = undefined;
    await page.getByRole('status').filter({ hasText: /^Saved$/ }).waitFor();
    verify(saved.name === 'Latest pending edit', 'Save queue retains edits made during in-flight save');
    await page.reload();
    await stage.waitFor();
    verify(await page.getByRole('textbox', { name: 'Design title' }).inputValue() === 'Latest pending edit', 'Saved fixture restores on reload');

    for (const size of [{ width: 320, height: 568 }, { width: 390, height: 320 }, { width: 844, height: 320 }, { width: 1200, height: 700 }, { width: 1279, height: 700 }, { width: 1280, height: 700 }, { width: 2048, height: 1024 }]) {
      await page.setViewportSize(size);
      await page.getByRole('button', { name: 'Fit', exact: true }).click();
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const metrics = await page.evaluate(() => { const body = document.querySelector('[data-editor-body]'); const bench = document.querySelector('.design-workbench'); const canvas = document.querySelector('[role="application"]'); return { width: innerWidth, height: innerHeight, bodyHeight: body.clientHeight, benchWidth: bench.clientWidth, canvasHeight: canvas.clientHeight, pageWidth: document.documentElement.scrollWidth, minHeight: getComputedStyle(body).minHeight, flex: getComputedStyle(body).flex, short: matchMedia('(max-height:600px)').matches }; });
      verify(metrics.bodyHeight >= 200 && metrics.benchWidth > 0 && metrics.canvasHeight > 0 && metrics.pageWidth <= size.width + 1, `Canvas remains usable at ${size.width}×${size.height}: ${JSON.stringify(metrics)}`);
      report.layouts.push(metrics);
      if (size.width === 320) {
        await page.getByRole('button', { name: 'Resize', exact: true }).click();
        const resize = page.getByRole('dialog', { name: 'Resize', exact: true });
        const box = await resize.boundingBox();
        verify(box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 568, 'Resize popover fits narrow viewport');
        await resize.getByRole('button', { name: 'Resize', exact: true }).scrollIntoViewIfNeeded();
        await screenshot('editor-resize-phone');
        await page.keyboard.press('Escape');
      }
      if (size.height === 320) { await stage.scrollIntoViewIfNeeded(); await screenshot(`editor-short-${size.width}`); }
    }
    await page.goto(`${origin}/studio`);
    await page.getByRole('button', { name: 'Open Writing pages review', exact: true }).click();
    await page.getByRole('textbox', { name: 'Document content', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Library', exact: true }).click();
    for (const width of [1199, 1200, 1279, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(() => new Promise(requestAnimationFrame));
      const layout = await page.evaluate(() => { const body = document.querySelector('.studio-editor-body').getBoundingClientRect(); const pane = document.querySelector('.studio-pane-container').getBoundingClientRect(); return { width: innerWidth, bodyTop: body.top, paneTop: pane.top, paneHeight: pane.height, pageWidth: document.documentElement.scrollWidth }; });
      verify(layout.paneHeight > 350 && layout.paneTop - layout.bodyTop < 90 && layout.pageWidth <= width + 1, `Writing editor library leaves a usable document at ${width}px`);
      report.layouts.push(layout);
    }
    await screenshot('writing-library-breakpoint');
    await context.route('**/api/chat*', route => route.fulfill({ json: route.request().url().includes('threadId=') ? { items: [{ id: 'edge-message', thread_id: 'edge-thread', user_id: 'edge-peer', body: 'An idea worth keeping.', created_at: '2026-09-27T01:00:00Z' }], reactions: {} } : { items: [{ id: 'edge-thread', title: 'Responsive conversation', dm_peer_id: 'edge-peer', dm_peer_name: 'Maya', last_message: 'An idea worth keeping.', updated_at: '2026-09-27T01:00:00Z' }] } }));
    if (page.routeWebSocket) await page.routeWebSocket('**/api/realtime/**', socket => socket.close());
    await page.goto(`${origin}/chat`);
    const chat = page.getByRole('region', { name: 'Messages workspace', exact: true });
    await page.getByRole('button', { name: 'Open conversation with Maya', exact: true }).click();
    await chat.getByText('An idea worth keeping.', { exact: true }).last().waitFor();
    for (const size of [{ width: 844, height: 390 }, { width: 390, height: 320 }, { width: 2048, height: 1440 }]) {
      await page.setViewportSize(size);
      const textarea = chat.locator('textarea');
      await textarea.scrollIntoViewIfNeeded();
      const metrics = await chat.evaluate(el => ({ height: el.clientHeight, pageWidth: document.documentElement.scrollWidth, viewport: innerHeight }));
      verify(metrics.pageWidth <= size.width + 1 && metrics.height > 150, `Chat adapts at ${size.width}×${size.height}`);
      if (size.height > 1000) verify(metrics.height > 1000, 'Chat uses tall windows beyond the old height cap');
      const composer = await textarea.boundingBox();
      verify(composer.y >= 0 && composer.y + composer.height <= size.height + 1, `Chat composer remains reachable at ${size.width}×${size.height}`);
      report.layouts.push({ ...size, ...metrics });
    }
    verify(writes.length > 5, 'Interaction checks exercise persisted document payloads');
    verify(report.errors.length === 0, 'No uncaught browser errors');
    return report;
  } catch (error) { await screenshot('editor-edge-failure'); throw new Error(`${report.checks.length} checks passed: ${error.message}`); }
  finally { releaseSave?.(); await context.close(); }
}
