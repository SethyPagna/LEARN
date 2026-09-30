// Run with playwright-cli -s=demo run-code --filename=ops/scripts/test/playwright-demo.js.
// Uses a private anonymous context and blocks every server-side write.
async (sourcePage) => {
  const origin = sourcePage.url().match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?=\/|$)/)?.[0];
  if (!origin) throw new Error('Use the local development server.');
  const browser = sourcePage.context().browser();
  if (!browser) throw new Error('This check requires a browser-backed Playwright session.');

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: 'light',
    serviceWorkers: 'block',
    acceptDownloads: true,
  });
  const report = { checks: [], layouts: [], downloads: [], apiWrites: [], errors: [] };
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
  page.on('console', entry => { if (entry.type() === 'error') report.errors.push(entry.text()); });
  const editor = page.locator('[data-demo-editor]');
  const stage = editor.locator('[data-design-stage]');
  const elements = stage.locator('[data-design-element]');
  const layers = editor.getByRole('combobox', { name: 'Select layer', exact: true });
  const button = name => editor.getByRole('button', { name, exact: true });
  const element = id => stage.locator(`[data-design-element="${id}"]`);

  const settle = async () => page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const artwork = () => stage.evaluate(node => ({
    background: node.firstElementChild.style.background,
    elements: [...node.querySelectorAll('[data-design-element]')].map(item => {
      const clone = item.cloneNode(true);
      clone.querySelectorAll('[style]').forEach(child => { child.style.cssText = child.style.cssText; });
      return { id: item.dataset.designElement, style: item.style.cssText, content: clone.innerHTML };
    }),
  }));
  const signature = async () => JSON.stringify(await artwork());
  const geometry = id => element(id).evaluate(node => ({
    x: parseFloat(node.style.left),
    y: parseFloat(node.style.top),
    width: parseFloat(node.style.width),
    height: parseFloat(node.style.height),
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
  const paint = id => element(id).evaluate(node => {
    const line = node.querySelector('[style*="font-family"]');
    if (!line) return null;
    const style = getComputedStyle(line);
    return { family: line.style.fontFamily, size: parseFloat(style.fontSize), weight: Number(style.fontWeight), color: style.color };
  });
  const switchMode = async mode => {
    const appearance = page.getByRole('group', { name: 'Appearance', exact: true });
    await appearance.getByRole('button', { name: mode, exact: true }).click();
    await page.waitForFunction(value => document.documentElement.classList.contains(value) && localStorage.getItem('theme') === value, mode.toLowerCase());
    await settle();
  };
  const inspectLayout = async (mode, viewport) => {
    const metrics = await editor.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      const canvas = node.querySelector('[role="application"]').getBoundingClientRect();
      const controls = [...node.querySelectorAll('button,input,select,textarea,a')]
        .filter(control => !control.closest('[role="application"]') && control.getClientRects().length);
      const canScrollTo = control => {
        for (let parent = control.parentElement; parent && parent !== node; parent = parent.parentElement) {
          if (/auto|scroll/.test(getComputedStyle(parent).overflowX) && parent.scrollWidth > parent.clientWidth && control.getBoundingClientRect().width <= parent.clientWidth) return true;
        }
        return false;
      };
      return {
        overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
        editorWidth: bounds.width,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        canvasContained: canvas.left >= bounds.left - 1 && canvas.right <= bounds.right + 1,
        clippedControls: controls.filter(control => {
          const rect = control.getBoundingClientRect();
          return (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) && !canScrollTo(control);
        }).map(control => control.getAttribute('aria-label') || control.textContent.trim()),
        unnamedControls: controls.filter(control => !control.getAttribute('aria-label') && !control.getAttribute('aria-labelledby') && !control.getAttribute('title') && !control.textContent.trim() && !control.labels?.length).map(control => control.tagName),
      };
    });
    report.layouts.push({ mode, ...viewport, ...metrics });
    const label = `${mode} ${viewport.width}×${viewport.height}`;
    verify(metrics.overflow <= 1, `${label}: no horizontal page overflow`);
    verify(metrics.canvasContained && metrics.canvasWidth > 120 && metrics.canvasHeight > 80, `${label}: the design canvas fits inside the editor`);
    verify(!metrics.clippedControls.length && !metrics.unnamedControls.length, `${label}: visible editor controls fit and have accessible names`);
    const objectActions = button('Object actions');
    if (await objectActions.count()) {
      await objectActions.scrollIntoViewIfNeeded();
      const box = await objectActions.boundingBox();
      verify(box.x >= 0 && box.x + box.width <= viewport.width + 1, `${label}: selection tools are reachable in the scrolling toolbar`);
    }
    await button('Download demo image').scrollIntoViewIfNeeded();
    const downloadBox = await button('Download demo image').boundingBox();
    verify(downloadBox.y >= 0 && downloadBox.y + downloadBox.height <= viewport.height + 1, `${label}: download control is reachable by scrolling`);
  };

  try {
    verify((await context.cookies()).length === 0, 'The demo starts in an isolated anonymous browser context');
    const response = await page.goto(`${origin}/`);
    verify(response?.ok() && page.url() === `${origin}/`, 'The public home page opens without a workspace redirect');
    await editor.waitFor();
    await settle();
    verify(await elements.count() === 5, 'Canvas project renders five real editable design elements');
    verify(await button('Undo').isDisabled() && await button('Redo').isDisabled() && await button('Reset demo').isDisabled(), 'Fresh project history controls start disabled');

    const initialArtwork = await signature();
    await button('Apricot').click();
    verify((await artwork()).background === 'rgb(246, 200, 182)', 'Page color swatches update the canvas artwork');
    await editor.getByLabel('Page color', { exact: true }).evaluate((input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, '#b9d7f0');
    await settle();
    verify((await artwork()).background === 'rgb(185, 215, 240)', 'Custom page color changes the rendered canvas');

    await selectLayer('demo-heading');
    const headingBeforeStyle = await paint('demo-heading');
    await button('Bold (Ctrl+B)').click();
    verify((await paint('demo-heading')).weight !== headingBeforeStyle.weight, 'ContextToolbar bold action changes the selected heading style');
    await editor.getByLabel('Font size', { exact: true }).fill('112');
    await editor.getByLabel('Font size', { exact: true }).press('Enter');
    verify((await paint('demo-heading')).size === 112, 'ContextToolbar font size updates rendered text');
    const beforeUndoStyle = await paint('demo-heading');
    await button('Undo').click();
    verify((await paint('demo-heading')).size !== beforeUndoStyle.size, 'Undo restores the preceding text style');
    await button('Redo').click();
    verify((await paint('demo-heading')).size === beforeUndoStyle.size, 'Redo reapplies the text style');

    await stage.scrollIntoViewIfNeeded();
    await settle();
    const textBox = await element('demo-heading').boundingBox();
    await page.mouse.dblclick(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    const inlineText = editor.getByRole('textbox', { name: 'Text', exact: true });
    await inlineText.fill('Ideas grow here.');
    await inlineText.press('Escape');
    await settle();
    const editedText = await element('demo-heading').textContent();
    verify(/Ideas\s*grow\s*here\./.test(editedText), `Double-click edits text directly on the page (${editedText})`);

    await button('Add shape').click();
    const shapeId = await layers.inputValue();
    verify(Boolean(shapeId) && await elements.count() === 6, 'Add shape creates and selects a real canvas object');
    const beforeMove = await geometry(shapeId);
    await moveElement(shapeId, { x: 28, y: 20 });
    const afterMove = await geometry(shapeId);
    verify(Math.abs(afterMove.x - beforeMove.x) > 5 && Math.abs(afterMove.y - beforeMove.y) > 5, 'Pointer drag moves the selected shape');
    await button('Undo').click();
    verify(sameGeometry(await geometry(shapeId), beforeMove), 'Undo restores the pre-drag shape position');
    await button('Redo').click();
    verify(sameGeometry(await geometry(shapeId), afterMove), 'Redo reapplies the shape drag');

    await selectLayer(shapeId);
    const resizeStart = await center(button('Resize se'));
    await drag(resizeStart, { x: resizeStart.x + 22, y: resizeStart.y + 16 });
    const afterResize = await geometry(shapeId);
    verify(afterResize.width > afterMove.width + 4 && afterResize.height > afterMove.height + 4, 'Dragging the corner handle resizes the shape');
    const rotateStart = await center(button('Rotate selection'));
    const shapeCenter = await center(element(shapeId));
    const angle = Math.PI / 3;
    const dx = rotateStart.x - shapeCenter.x;
    const dy = rotateStart.y - shapeCenter.y;
    await drag(rotateStart, { x: shapeCenter.x + dx * Math.cos(angle) - dy * Math.sin(angle), y: shapeCenter.y + dx * Math.sin(angle) + dy * Math.cos(angle) });
    verify(Math.abs((await geometry(shapeId)).rotation - afterResize.rotation) > 25, 'Dragging the rotation handle rotates the shape');

    await button('Elements library').click();
    verify(await editor.getByRole('region', { name: 'Elements library', exact: true }).isVisible(), 'The Elements library opens in the mini Studio');
    await editor.getByRole('button', { name: 'Insert heart', exact: true }).click();
    const insertedId = await layers.inputValue();
    verify(Boolean(insertedId) && await elements.count() === 7, 'The Elements library inserts a shape');
    await button('Reset demo').click();
    await settle();
    verify(await signature() === initialArtwork, 'Reset restores the original project artwork');
    await button('Undo').click();
    verify(await elements.count() === 7, 'Undo restores the edited artwork after reset');

    const slidesProject = page.getByRole('button', { name: 'Open Slides demo project', exact: true });
    await slidesProject.click();
    verify(await slidesProject.getAttribute('aria-pressed') === 'true' && await elements.count() === 4, 'Project cards switch to the independent Slides design');
    await editor.getByRole('button', { name: 'Page 2', exact: true }).click();
    verify(await stage.getAttribute('aria-label') === 'Design page 2' && (await artwork()).elements.length === 4, 'PagesStrip selects the second slide page');
    await editor.getByRole('button', { name: 'Page 3', exact: true }).click();
    await editor.getByRole('button', { name: 'Add page', exact: true }).click();
    verify(await stage.getAttribute('aria-label') === 'Design page 4' && await editor.getByRole('button', { name: 'Page 4', exact: true }).count() === 1, 'PagesStrip adds and selects a new page');
    await button('Page notes').click();
    await editor.getByRole('textbox', { name: 'Demo page notes', exact: true }).fill('Remember this small idea.');
    await editor.getByRole('button', { name: 'Page 3', exact: true }).click();
    await editor.getByRole('button', { name: 'Page 4', exact: true }).click();
    verify(await editor.getByRole('textbox', { name: 'Demo page notes', exact: true }).inputValue() === 'Remember this small idea.', 'Page notes persist across page changes');
    await button('Page notes').click();
    await stage.focus();
    await page.keyboard.press('Control+Enter');
    verify(await stage.getAttribute('aria-label') === 'Design page 5', 'Ctrl+Enter adds a page in the demo');
    await page.keyboard.press('t');
    await editor.getByRole('textbox', { name: 'Text', exact: true }).fill('Keyboard idea');
    await page.keyboard.press('Escape');
    await settle();
    verify(await elements.count() === 1 && (await elements.textContent()).includes('Keyboard idea'), 'T adds an editable text object');
    await button('Page 5 options').click();
    await page.getByRole('dialog', { name: 'Page 5 options', exact: true }).getByRole('button', { name: 'Duplicate page', exact: true }).click();
    verify(await stage.getAttribute('aria-label') === 'Design page 6' && await elements.count() === 1, 'Duplicate page copies its content');
    await button('Page 6 options').click();
    await page.getByRole('dialog', { name: 'Page 6 options', exact: true }).getByRole('button', { name: 'Hide page', exact: true }).click();
    verify(await editor.getByRole('button', { name: /Page 6.*hidden/i }).count() === 1, 'Page options hide the duplicated page');
    await editor.getByRole('button', { name: 'Page 5', exact: true }).click();
    await button('Present demo').click();
    const presentation = page.getByRole('dialog', { name: /^Presenting / });
    await presentation.waitFor();
    verify((await presentation.innerText()).includes('5 / 5'), 'Present mode excludes hidden pages');
    await page.keyboard.press('t');
    verify(await presentation.getByRole('button', { name: /^Timer paused at/ }).count() === 1, 'The presentation timer can be paused');
    await page.keyboard.press('Escape');
    verify(await presentation.count() === 0, 'Escape exits presentation');
    const canvasProject = page.getByRole('button', { name: 'Open Canvas demo project', exact: true });
    await canvasProject.click();
    verify(await canvasProject.getAttribute('aria-pressed') === 'true' && await elements.count() === 7, 'Project switching preserves the prior project and its edits');

    await button('Start guided Studio tour').click();
    const tour = editor.getByRole('region', { name: 'Studio guided tour', exact: true });
    verify((await tour.innerText()).includes('Pick a project.'), 'Quick tour opens at its first instruction');
    await editor.getByRole('button', { name: 'Next tutorial step', exact: true }).click();
    verify((await tour.innerText()).includes('Select text. Try the tools.') && await layers.inputValue() === 'demo-heading', 'Tutorial step two selects the heading and explains the tools');
    await editor.getByRole('button', { name: 'Next tutorial step', exact: true }).click();
    await editor.getByRole('region', { name: 'Elements library', exact: true }).waitFor();
    verify(await editor.getByRole('region', { name: 'Elements library', exact: true }).isVisible(), 'Tutorial step three opens the visual element library');
    await editor.getByRole('button', { name: 'Next tutorial step', exact: true }).click();
    verify((await tour.innerText()).includes('Make a page. Keep your design.'), 'Tutorial step four explains pages and keeping the design');
    await editor.getByRole('button', { name: 'Finish tutorial', exact: true }).click();
    verify(await tour.count() === 0, 'The guided tutorial can be completed');
    await button('Start guided Studio tour').click();
    await editor.getByRole('button', { name: 'Skip tutorial', exact: true }).click();
    verify(await tour.count() === 0, 'The tutorial can be skipped');

    const appearance = page.getByRole('group', { name: 'Appearance', exact: true });
    const modes = ['Light', 'Dark', 'Color'];
    const viewports = [{ width: 320, height: 700 }, { width: 390, height: 844 }, { width: 1280, height: 800 }];
    for (const mode of modes) {
      await switchMode(mode);
      verify(await appearance.getByRole('button', { name: mode, exact: true }).getAttribute('aria-pressed') === 'true', `${mode} appearance mode is selected`);
      for (const viewport of viewports) {
        await page.setViewportSize(viewport);
        await settle();
        await inspectLayout(mode, viewport);
      }
    }

    await page.setViewportSize({ width: 1280, height: 800 });
    await selectLayer('');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30000 }),
      button('Download demo image').click(),
    ]);
    verify(await download.failure() === null && download.suggestedFilename().endsWith('.png'), 'The anonymous demo exports a PNG download');
    const inspectDownload = async () => {
      const stream = await download.createReadStream();
      if (!stream) throw new Error('PNG download stream is unavailable.');
      const chunks = [];
      for await (const chunk of stream) chunks.push([...chunk]);
      return page.evaluate(async parts => {
        const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
        const signature = [...bytes.slice(0, 8)].join(',');
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const sha256 = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        const result = { byteLength: bytes.byteLength, isPng: signature === '137,80,78,71,13,10,26,10', sha256, width: image.width, height: image.height };
        image.close();
        return result;
      }, chunks);
    };
    const png = await inspectDownload();
    const reread = await inspectDownload();
    verify(png.isPng && png.byteLength > 1000 && png.width === 1920 && png.height === 1200, 'The downloaded PNG decodes at the design dimensions at standard 2x quality');
    verify(png.sha256 === reread.sha256, 'Two independent reads of the PNG have the same SHA-256');
    report.downloads.push({ filename: download.suggestedFilename(), ...png });

    verify(report.apiWrites.length === 0, 'No API writes were attempted by any demo interaction');
    verify(report.errors.length === 0, 'The demo has no uncaught browser errors');
    verify(page.url() === `${origin}/`, 'Every interaction stayed on the anonymous public home page');
    return report;
  } catch (error) {
    report.failure = error.message;
    throw new Error(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
  }
}
