// Run with playwright-cli -s=demo run-code --filename=ops/scripts/test/playwright-demo.js.
// Opens an anonymous context on the local public home page; never changes server data.
async (sourcePage) => {
  const origin = sourcePage.url().match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/|$)/)?.[0];
  if (!origin) throw new Error('Use the local development server.');
  const browser = sourcePage.context().browser();
  if (!browser) throw new Error('This check requires a browser-backed Playwright session.');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', serviceWorkers: 'block', acceptDownloads: true });
  const report = { checks: [], layouts: [], screenshots: [], downloads: [], apiWrites: [], errors: [] };
  const verify = (condition, description) => {
    if (!condition) throw new Error(description);
    report.checks.push(description);
  };
  await context.route('**/*', async route => {
    const request = route.request();
    const path = request.url().replace(/^[a-z][a-z\d+.-]*:\/\/[^/]+/i, '').split(/[?#]/, 1)[0];
    if (/^\/api(?:\/|$)/.test(path) && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      report.apiWrites.push({ method: request.method(), path });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message));
  const editor = page.locator('[data-demo-editor]');
  const stage = editor.getByRole('application', { name: 'Design page 1', exact: true });
  const layers = editor.getByRole('combobox', { name: 'Select layer', exact: true });
  const button = name => editor.getByRole('button', { name, exact: true });
  const element = id => stage.locator(`[data-design-element="${id}"]`);
  const elements = stage.locator('[data-design-element]');
  const settle = async () => {
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
  };
  const screenshot = async (name, target = editor) => {
    const path = `output/playwright/public-demo/${name}.png`;
    await target.screenshot({ path, animations: 'disabled' });
    report.screenshots.push(path);
  };
  const artwork = () => stage.evaluate(node => ({
    background: node.firstElementChild.style.background,
    elements: [...node.querySelectorAll('[data-design-element]')].map(item => ({ id: item.dataset.designElement, style: item.getAttribute('style'), content: item.innerHTML })),
  }));
  const signature = async () => JSON.stringify(await artwork());
  const geometry = id => element(id).evaluate(node => ({
    x: parseFloat(node.style.left), y: parseFloat(node.style.top),
    width: parseFloat(node.style.width), height: parseFloat(node.style.height),
    rotation: Number(node.style.transform.match(/rotate\(([-\d.]+)deg\)/)?.[1] ?? 0),
  }));
  const sameGeometry = (left, right) => Object.keys(left).every(key => Math.abs(left[key] - right[key]) < 0.1);
  const center = async locator => {
    const box = await locator.boundingBox();
    if (!box || !box.width || !box.height) throw new Error('Canvas interaction target has no visible geometry.');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const drag = async (from, to) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    try { await page.mouse.move(to.x, to.y, { steps: 12 }); }
    finally { await page.mouse.up(); }
    await settle();
  };
  const moveElement = async (id, delta) => {
    await stage.scrollIntoViewIfNeeded();
    await settle();
    const from = await center(element(id));
    await drag(from, { x: from.x + delta.x, y: from.y + delta.y });
  };
  const selectLayer = async id => {
    await layers.selectOption(id);
    await settle();
  };
  const setColor = async (name, color) => {
    // Native color-picker windows are outside Playwright; dispatch native form events.
    await editor.getByLabel(name, { exact: true }).evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, color);
    await settle();
  };
  const paint = id => element(id).evaluate(node => {
    const line = node.querySelector('[style*="font-family"]');
    if (!line) return null;
    const style = getComputedStyle(line);
    return { family: line.style.fontFamily, size: parseFloat(style.fontSize), weight: Number(style.fontWeight), color: style.color };
  });
  const switchMode = async mode => {
    await page.getByRole('group', { name: 'Appearance', exact: true }).getByRole('button', { name: mode, exact: true }).click();
    await page.waitForFunction(value => document.documentElement.classList.contains(value) && localStorage.getItem('theme') === value, mode.toLowerCase());
    await settle();
  };
  const inspectLayout = async (mode, viewport) => {
    const metrics = await editor.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const canvas = node.querySelector('[role="application"]').getBoundingClientRect();
      const controls = [...node.querySelectorAll('button,input,select,textarea,a')].filter(control => !control.closest('[role="application"]') && control.getClientRects().length);
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        editorWidth: bounds.width,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasContained: canvas.left >= bounds.left - 1 && canvas.right <= bounds.right + 1,
        clippedControls: controls.filter(control => { const rect = control.getBoundingClientRect(); return rect.left < bounds.left - 1 || rect.right > bounds.right + 1; }).map(control => control.getAttribute('aria-label') || control.textContent.trim()),
        unnamedControls: controls.filter(control => !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby') && !control.getAttribute('title') && !control.textContent.trim() && !control.labels?.length).map(control => control.tagName),
      };
    });
    report.layouts.push({ mode, ...viewport, ...metrics });
    const label = `${mode} ${viewport.width}×${viewport.height}`;
    verify(metrics.overflow <= 1, `${label}: no horizontal document overflow`);
    verify(metrics.canvasContained && metrics.canvasWidth > 150 && Math.abs(metrics.canvasWidth / metrics.canvasHeight - 1.6) < 0.01, `${label}: the complete canvas fits at its original aspect ratio`);
    verify(!metrics.clippedControls.length && !metrics.unnamedControls.length, `${label}: editor controls fit and have accessible names`);
    await button('Download demo image').scrollIntoViewIfNeeded();
    const downloadBox = await button('Download demo image').boundingBox();
    verify(downloadBox.y >= 0 && downloadBox.y + downloadBox.height <= viewport.height + 1, `${label}: the footer remains reachable by normal scrolling`);
    await screenshot(`${mode.toLowerCase()}-${viewport.width}x${viewport.height}`);
  };

  try {
    verify((await context.cookies()).length === 0, 'The demo starts in an isolated anonymous browser context');
    const response = await page.goto(`${origin}/`);
    verify(response?.ok() && page.url() === `${origin}/`, 'The anonymous public home page opens without a workspace redirect');
    await editor.waitFor();
    await settle();
    verify(await elements.count() === 5, 'The public demo renders its five editable design elements');
    verify(await button('Undo').isDisabled() && await button('Redo').isDisabled() && await button('Reset demo').isDisabled(), 'Fresh-demo history controls have honest disabled states');
    const initialArtwork = await signature();
    await screenshot('initial');

    for (const [name, color] of [['Apricot', 'rgb(246, 200, 182)'], ['Mint', 'rgb(198, 229, 206)'], ['Periwinkle', 'rgb(213, 212, 246)']]) {
      await button(name).click();
      verify(await button(name).getAttribute('aria-pressed') === 'true' && (await artwork()).background === color, `${name} changes the actual canvas background`);
    }
    await setColor('Page color', '#b9d7f0');
    verify((await artwork()).background === 'rgb(185, 215, 240)', 'The custom page color updates the rendered canvas');

    await button('Add shape').click();
    const shapeId = await layers.inputValue();
    verify(Boolean(shapeId) && await elements.count() === 6, 'Add shape inserts and selects a real canvas object');
    for (const shape of ['rounded', 'star', 'burst', 'ellipse', 'heart']) {
      const previousShape = await element(shapeId).innerHTML();
      await editor.getByRole('combobox', { name: 'Shape', exact: true }).selectOption(shape);
      verify(await element(shapeId).innerHTML() !== previousShape, `${shape} changes the rendered vector`);
    }
    await setColor('Shape color', '#4477bb');
    verify(await element(shapeId).locator('[fill="#4477bb"]').count() > 0, 'Shape color changes the vector fill');
    await button('Edit label').click();
    await editor.getByRole('textbox', { name: 'Edit selected label', exact: true }).fill('Try me');
    await button('Done editing text').click();
    verify((await element(shapeId).textContent()).includes('Try me'), 'Shape labels can be edited without leaving the canvas');

    const beforeMove = await geometry(shapeId);
    await moveElement(shapeId, { x: 34, y: 22 });
    const afterMove = await geometry(shapeId);
    verify(Math.abs(afterMove.x - beforeMove.x) > 5 && Math.abs(afterMove.y - beforeMove.y) > 5, 'A real pointer drag moves the selected canvas object');
    await button('Undo').click();
    verify(sameGeometry(await geometry(shapeId), beforeMove), 'Undo restores the position before the pointer drag');
    await button('Redo').click();
    verify(sameGeometry(await geometry(shapeId), afterMove), 'Redo reapplies the pointer drag');
    await selectLayer(shapeId);
    await stage.scrollIntoViewIfNeeded();
    await settle();
    const resizeStart = await center(button('Resize se'));
    await drag(resizeStart, { x: resizeStart.x + 26, y: resizeStart.y + 18 });
    const afterResize = await geometry(shapeId);
    verify(afterResize.width > afterMove.width + 5 && afterResize.height > afterMove.height + 5, 'Dragging the corner handle resizes the real object');
    const rotateStart = await center(button('Rotate selection'));
    const shapeCenter = await center(element(shapeId));
    const angle = Math.PI / 3;
    const dx = rotateStart.x - shapeCenter.x;
    const dy = rotateStart.y - shapeCenter.y;
    await drag(rotateStart, { x: shapeCenter.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: shapeCenter.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
    verify(Math.abs((await geometry(shapeId)).rotation - afterResize.rotation) > 30, 'Dragging the rotation handle rotates the real object');
    const beforeNudge = await geometry(shapeId);
    await stage.focus();
    await page.keyboard.press('Shift+ArrowRight');
    verify(Math.abs((await geometry(shapeId)).x - beforeNudge.x - 10) < 0.1, 'Keyboard nudging moves a selected object in design coordinates');
    await screenshot('shape-gestures');

    await button('Duplicate selection').click();
    const duplicateId = await layers.inputValue();
    verify(duplicateId !== shapeId && await elements.count() === 7 && (await element(duplicateId).textContent()).includes('Try me'), 'Duplicate creates a separately selectable copy with its label');
    await button('Delete selection').click();
    verify(await element(duplicateId).count() === 0 && await elements.count() === 6, 'Delete removes only the selected duplicate');
    await selectLayer('demo-flower');
    const beforeLayerOrder = (await artwork()).elements.map(item => item.id);
    await button('Bring forward').click();
    const afterLayerOrder = (await artwork()).elements.map(item => item.id);
    verify(afterLayerOrder.indexOf('demo-flower') > beforeLayerOrder.indexOf('demo-flower'), 'Bring forward changes the rendered stacking order');

    await button('Add text').click();
    const textId = await layers.inputValue();
    await editor.getByRole('textbox', { name: 'Edit selected text', exact: true }).fill('A fresh idea');
    await button('Done editing text').click();
    verify((await element(textId).textContent()).includes('A fresh idea'), 'Add text inserts editable text and commits its content');
    for (const [font, token] of [['space', '--font-design-space'], ['playfair', '--font-design-playfair'], ['caveat', '--font-design-caveat'], ['sans', '--font-geist-sans']]) {
      await editor.getByRole('combobox', { name: 'Font', exact: true }).selectOption(font);
      verify((await paint(textId)).family.includes(token), `${font} changes the actual text font`);
    }
    await editor.getByRole('spinbutton', { name: 'Font size', exact: true }).fill('64');
    verify((await paint(textId)).size === 64, 'Font size changes the rendered text size');
    await button('Bold').click();
    verify(await button('Bold').getAttribute('aria-pressed') === 'false' && (await paint(textId)).weight === 400, 'Bold toggles off in both the control and rendered text');
    await button('Bold').click();
    verify(await button('Bold').getAttribute('aria-pressed') === 'true' && (await paint(textId)).weight === 700, 'Bold toggles on in both the control and rendered text');
    await setColor('Text color', '#245b77');
    verify((await paint(textId)).color === 'rgb(36, 91, 119)', 'Text color changes the rendered text');
    await button('Edit text').click();
    await editor.getByRole('textbox', { name: 'Edit selected text', exact: true }).press('Escape');
    verify(await editor.getByRole('textbox', { name: 'Edit selected text', exact: true }).count() === 0, 'Escape closes the compact text field');
    await stage.scrollIntoViewIfNeeded();
    await settle();
    const textCenter = await center(element(textId));
    await page.mouse.dblclick(textCenter.x, textCenter.y);
    const inlineText = editor.getByRole('textbox', { name: 'Text', exact: true });
    await inlineText.fill('Edited on the page');
    await inlineText.press('Escape');
    verify((await element(textId).textContent()).includes('Edited on the page'), 'Double-click opens direct text editing on the canvas');
    await stage.focus();
    await page.keyboard.press('Control+z');
    verify((await element(textId).textContent()).includes('A fresh idea'), 'The keyboard undo shortcut restores text content');
    await page.keyboard.press('Control+Shift+z');
    verify((await element(textId).textContent()).includes('Edited on the page'), 'The keyboard redo shortcut restores the direct text edit');
    await screenshot('text-editing');

    const editedArtwork = await signature();
    await button('Reset demo').click();
    verify(await signature() === initialArtwork, 'Reset restores the original page and all original objects');
    await button('Undo').click();
    verify(await signature() === editedArtwork, 'Reset is undoable and preserves the visitor’s work in history');
    const tabs = page.getByRole('tablist', { name: 'Explore the workspace', exact: true });
    await tabs.getByRole('tab', { name: 'Practice', exact: true }).click();
    verify(!(await editor.isVisible()), 'Practice hides the editor without unmounting its work');
    await page.getByRole('button', { name: /Read it once/ }).click();
    verify((await page.getByRole('status').filter({ hasText: 'Active practice' }).textContent()).includes('Active practice'), 'The practice preview responds to an incorrect answer');
    await page.getByRole('button', { name: /Recall it from memory/ }).click();
    verify(await page.getByRole('button', { name: /Recall it from memory/ }).getAttribute('data-correct') === 'true', 'The practice preview marks the correct answer');
    await tabs.getByRole('tab', { name: 'Plan', exact: true }).click();
    await page.getByRole('button', { name: 'Fri 16', exact: true }).click();
    verify(await page.getByText('Finish that project', { exact: true }).isVisible(), 'Choosing a calendar preview day changes its events');
    await tabs.getByRole('tab', { name: 'Plan', exact: true }).press('Home');
    await editor.waitFor();
    await settle();
    verify(await signature() === editedArtwork && await button('Undo').isEnabled(), 'Returning to Create by keyboard preserves the design and its history');

    await selectLayer('');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      button('Download demo image').click(),
    ]);
    const downloadPath = 'output/playwright/public-demo/my-curious-idea.png';
    await download.saveAs(downloadPath);
    verify(await download.failure() === null && download.suggestedFilename().endsWith('.png'), 'The demo downloads a PNG without signing in');
    const png = await page.evaluate(async url => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, download.url());
    verify(png.width === 1920 && png.height === 1200, 'The exported PNG decodes at 1920×1200 for the 2× standard export');
    report.downloads.push({ path: downloadPath, filename: download.suggestedFilename(), ...png });
    verify(await editor.getByRole('link', { name: 'Open Studio workspace', exact: true }).getAttribute('href') === '/dashboard', 'The editor provides the full-workspace link without navigating during this test');

    const viewports = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 900 }, { width: 844, height: 390 }, { width: 2048, height: 1024 }];
    for (const mode of ['Light', 'Dark', 'Color']) {
      await switchMode(mode);
      verify(await signature() === editedArtwork, `${mode} changes the chrome without recoloring or resetting the design`);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await settle();
        await button('Add shape').click();
        const responsiveShapeId = await layers.inputValue();
        const original = await geometry(responsiveShapeId);
        await moveElement(responsiveShapeId, { x: 18, y: 13 });
        verify(!sameGeometry(await geometry(responsiveShapeId), original), `${mode} ${viewport.width}×${viewport.height}: pointer editing remains usable`);
        await button('Undo').click();
        verify(sameGeometry(await geometry(responsiveShapeId), original), `${mode} ${viewport.width}×${viewport.height}: gesture history works`);
        await selectLayer(responsiveShapeId);
        await button('Delete selection').click();
        await button('Add text').click();
        const responsiveTextId = await layers.inputValue();
        await editor.getByRole('textbox', { name: 'Edit selected text', exact: true }).fill('Small screens work');
        await button('Done editing text').click();
        verify((await element(responsiveTextId).textContent()).replace(/\s+/g, '').includes('Smallscreenswork'), `${mode} ${viewport.width}×${viewport.height}: text editing works`);
        await inspectLayout(mode, viewport);
        await button('Delete selection').click();
        await selectLayer('');
        verify(await signature() === editedArtwork, `${mode} ${viewport.width}×${viewport.height}: the original edited artwork survives responsive interactions`);
      }
    }
    verify(report.apiWrites.length === 0, 'No API writes were attempted by any demo interaction');
    verify(report.errors.length === 0, 'The demo has no uncaught browser errors');
    verify(page.url() === `${origin}/`, 'Every interaction stayed on the anonymous public home page');
    return report;
  } catch (error) {
    report.failure = error.message;
    try { await screenshot('failure', page); } catch (captureError) { report.errors.push(`Failure screenshot: ${captureError.message}`); }
    throw new Error(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
  }
}
