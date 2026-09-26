// Run with playwright-cli -s=editor run-code --filename=ops/scripts/test/playwright-editor.js.
// Requires a signed-in local demo and the existing "Page workspace review" (two pages)
// and "Writing pages review" fixtures. Creates and removes one text upload. It never
// sends a prompt to a provider; import failure uses an intercepted local response.
async (page) => {
  const { origin, hostname } = await page.evaluate(() => ({ origin: location.origin, hostname: location.hostname }));
  if (!['localhost', '127.0.0.1'].includes(hostname)) throw new Error('Use the local development server.');
  page.setDefaultTimeout(15000);
  const report = { checks: [], downloads: [], screenshots: [], errors: [] };
  const recordError = error => report.errors.push(error.message);
  page.on('pageerror', recordError);
  const verify = (condition, description) => {
    if (!condition) throw new Error(description);
    report.checks.push(description);
  };
  const go = async route => {
    const response = await page.goto(`${origin}/${route}`);
    if (!response?.ok()) throw new Error(`Navigation failed: ${route} (${response?.status()})`);
    await page.locator('#learn-main-content').waitFor();
  };
  const screenshot = async name => {
    const path = `output/playwright/${name}.png`;
    await page.screenshot({ path, fullPage: false });
    report.screenshots.push(path);
  };
  const originalDraft = await page.evaluate(() => localStorage.getItem('learn_ai_tutor_draft_v1'));
  let uploadedId = '';
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => localStorage.setItem('learn_ai_tutor_draft_v1', JSON.stringify({
      message: 'Explain this short source.', reply: '# A clear idea\n\nOne focused explanation.', activeTaskKey: 'source_explanation', sourceScope: 'Manual only',
    })));
    await go('ai');
    await page.getByRole('heading', { name: 'A clear idea', exact: true }).waitFor();
    verify(await page.getByRole('heading', { name: 'A clear idea', exact: true }).count() === 1, 'AI renders one formatted answer');
    verify(await page.locator('details').filter({ has: page.getByText('Original text', { exact: true }) }).getAttribute('open') === null, 'AI original text starts collapsed');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.keyboard.press('Escape');
    verify(await page.getByRole('button', { name: 'Filters', exact: true }).getAttribute('aria-expanded') === 'false', 'AI filters dismiss with Escape');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('heading', { name: 'AI tutor', exact: true }).click();
    verify(await page.getByRole('button', { name: 'Filters', exact: true }).getAttribute('aria-expanded') === 'false', 'AI filters dismiss outside');
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.getByRole('combobox', { name: 'Source', exact: true }).selectOption('Uploaded files');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Add source', exact: true }).click();
    await page.getByRole('textbox', { name: 'Import content' }).waitFor();
    verify(await page.getByRole('button', { name: 'Tools', exact: true }).getAttribute('aria-expanded') === 'true', 'Add source opens the import tools');
    await page.getByRole('textbox', { name: 'Import content' }).fill('A source retained after an import error.');
    await page.route('**/api/import', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture: import unavailable' }) }));
    await page.getByRole('button', { name: 'Organize into Studio', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Fixture: import unavailable' }).waitFor();
    verify(await page.getByRole('textbox', { name: 'Import content' }).inputValue() === 'A source retained after an import error.', 'Failed import keeps the source and displays its error');
    await page.unroute('**/api/import');
    await screenshot('ai-nested-workflow');

    await go('files');
    const filename = 'learn-playwright-preview-fixture.txt';
    const uploadResponse = page.waitForResponse(response => response.url().endsWith('/api/files') && response.request().method() === 'POST');
    await page.getByLabel('Upload files', { exact: true }).setInputFiles('src/tests/fixtures/learn-playwright-preview-fixture.txt');
    const uploaded = await (await uploadResponse).json();
    uploadedId = uploaded.file?.id || '';
    verify(Boolean(uploadedId), 'File upload creates a local asset');
    await page.getByRole('textbox', { name: 'Search files' }).fill(filename);
    await page.getByRole('button', { name: 'Grid view', exact: true }).click();
    await page.locator(`button[data-file-id="${uploadedId}"]`).click();
    const preview = page.getByRole('complementary', { name: 'File preview', exact: true });
    await preview.getByText('Preview fixture: readable text remains in the file panel.', { exact: true }).waitFor();
    verify(page.url().endsWith('/files'), 'File preview opens in place');
    await page.keyboard.press('Escape');
    await preview.waitFor({ state: 'detached' });
    verify(await page.evaluate(id => document.activeElement?.getAttribute('data-file-id') === id, uploadedId), 'Closing grid preview restores the file focus');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(`button[data-file-id="${uploadedId}"]`).click();
    await preview.waitFor();
    await preview.getByText('Preview fixture: readable text remains in the file panel.', { exact: true }).waitFor();
    await page.waitForTimeout(400);
    const previewBox = await preview.boundingBox();
    verify(previewBox && previewBox.y < 844 && previewBox.y >= 0, 'Mobile file preview scrolls into view');
    await screenshot('files-mobile-preview');
    await preview.getByRole('button', { name: 'Delete file', exact: true }).click();
    await preview.getByRole('button', { name: 'Confirm delete', exact: true }).click();
    await preview.waitFor({ state: 'detached' });
    await page.getByRole('heading', { name: /^No (matching files|files yet)$/ }).waitFor();
    verify(await page.getByRole('heading', { name: 'No matching files', exact: true }).count() + await page.getByRole('heading', { name: 'No files yet', exact: true }).count() === 1, 'Deleting the fixture closes the file preview');
    uploadedId = '';

    await page.setViewportSize({ width: 1440, height: 900 });
    await go('dashboard');
    await page.getByRole('button', { name: 'Open Page workspace review', exact: true }).click();
    await page.getByRole('application', { name: 'Design page 2', exact: true }).waitFor();
    const pages = page.locator('.design-workspace-page');
    const initialPages = await pages.count();
    verify(initialPages === 2, 'A4 fixture uses two vertically stacked pages');
    await page.getByRole('button', { name: 'Duplicate page 1', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('.design-workspace-page').length === count, initialPages + 1);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('.design-workspace-page').length === count, initialPages);
    verify(await pages.count() === initialPages, 'Canvas duplication participates in undo');
    await page.getByRole('button', { name: 'Magic', exact: true }).click();
    await page.getByRole('button', { name: 'Outline', exact: true }).click();
    await page.getByRole('textbox', { name: 'Outline to design' }).waitFor();
    verify(await page.getByRole('button', { name: 'Create pages', exact: true }).isDisabled(), 'Empty outline cannot create blank generated pages');
    await page.getByRole('button', { name: 'Example', exact: true }).click();
    verify((await page.getByRole('textbox', { name: 'Outline to design' }).inputValue()).includes('# The water cycle'), 'Magic example fills an editable outline');
    await page.getByRole('button', { name: 'Layout', exact: true }).click();
    verify(await page.getByRole('textbox', { name: 'Outline to design' }).count() === 0, 'Magic only displays the selected tool');
    await page.getByRole('button', { name: 'Close panel', exact: true }).click();
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const downloadDialog = page.getByRole('dialog', { name: 'Download', exact: true });
    await downloadDialog.getByRole('radio', { name: 'PDF', exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), downloadDialog.getByRole('button', { name: 'Download 2 pages', exact: true }).click()]);
    await download.saveAs('output/playwright/editor-pages.pdf');
    verify((await download.failure()) === null && download.suggestedFilename().endsWith('.pdf'), 'Canvas PDF downloads successfully');
    report.downloads.push('output/playwright/editor-pages.pdf');
    await page.keyboard.press('Escape');
    await screenshot('editor-pages-desktop');
    await page.setViewportSize({ width: 390, height: 844 });
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Canvas fits the phone viewport');
    await screenshot('editor-pages-phone');

    await page.setViewportSize({ width: 1440, height: 900 });
    await go('dashboard');
    await page.getByRole('button', { name: 'Open Writing pages review', exact: true }).click();
    await page.getByRole('textbox', { name: 'Document content', exact: true }).waitFor();
    const writingPages = page.locator('.writing-page-node');
    const count = await writingPages.count();
    verify(count === 2, 'Writing fixture keeps two editable sheets');
    await page.getByRole('button', { name: 'Duplicate document page 1', exact: true }).click();
    await page.waitForFunction(total => document.querySelectorAll('.writing-page-node').length === total, count + 1);
    await page.getByRole('textbox', { name: 'Document content', exact: true }).press('Control+z');
    await page.waitForFunction(total => document.querySelectorAll('.writing-page-node').length === total, count);
    verify(await writingPages.count() === count, 'Writing duplication participates in shared undo');
    await page.setViewportSize({ width: 390, height: 844 });
    verify(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Writing editor fits the phone viewport');
    await screenshot('writing-pages-phone-audit');
    verify(report.errors.length === 0, 'No unhandled browser exceptions in editor workflows');
    return report;
  } catch (error) {
    throw new Error(`${report.checks.length} checks passed before failure: ${error.message}`);
  } finally {
    await page.unroute('**/api/import');
    // Leave the draft route before restoring storage to avoid its autosave overwriting it.
    await go('dashboard');
    await page.evaluate(value => value === null ? localStorage.removeItem('learn_ai_tutor_draft_v1') : localStorage.setItem('learn_ai_tutor_draft_v1', value), originalDraft);
    if (uploadedId) await page.evaluate(async id => { await fetch(`/api/files?id=${encodeURIComponent(id)}`, { method: 'DELETE' }); }, uploadedId);
    page.off('pageerror', recordError);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
}
