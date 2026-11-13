import { expect, type Page, test } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const TITLE = 'example.md — mded';

/** Moves the cursor off the title without scrolling (CodeMirror only renders what is visible). */
async function cursorAwayFromTitle(page: Page) {
  await page.locator('.cm-line', { hasText: 'Links and images' }).click();
}

const docText = (page: Page) =>
  page.evaluate(() =>
    (
      window as unknown as { __mded: { view: { state: { doc: { toString(): string } } } } }
    ).__mded.view.state.doc.toString(),
  );

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(TITLE);
});

test('renders the example in hybrid mode', async ({ page }) => {
  // Cursor off the title: its "# " is hidden
  await cursorAwayFromTitle(page);
  await expect(page.locator('.cm-line').first()).toHaveText('Welcome to mded');
  await expect(page.locator('.cm-md-h1')).toHaveCount(1);
  await expect(page.locator('.cm-md-image')).toHaveCount(1);
  await expect(page.locator('.cm-md-checkbox')).toHaveCount(2);
  await page.locator('.cm-scroller').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ path: 'screenshots/editor-top.png' });
  await page.screenshot({ path: 'screenshots/editor-full.png', fullPage: true });
});

test('markers appear when the cursor enters', async ({ page }) => {
  const h1 = page.locator('.cm-line').first();
  await cursorAwayFromTitle(page);
  await expect(h1).toHaveText('Welcome to mded');
  await h1.click();
  await expect(h1).toHaveText('# Welcome to mded');
});

test('editing marks the document dirty, saving clears it without rewriting the markdown', async ({
  page,
}) => {
  const original = await docText(page);
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await expect(page).toHaveTitle(`• ${TITLE}`);

  await page.keyboard.press('Backspace');
  await expect(page).toHaveTitle(TITLE); // manually undone = no changes

  await page.keyboard.type(' 2');
  await page.keyboard.press(`${mod}+s`);
  await expect(page).toHaveTitle(TITLE);
  const saved = await page.evaluate(() =>
    (window as unknown as { __mded: { platform: { files: Map<string, string> } } }).__mded.platform.files.get(
      '/examples/example.md',
    ),
  );
  expect(saved).toBe(original.replace('# Welcome to mded', '# Welcome to mded 2'));
});

test('clicking a checkbox turns [ ] into [x] in the text', async ({ page }) => {
  await page.locator('.cm-md-checkbox').first().dispatchEvent('mousedown');
  await expect.poll(() => docText(page)).toContain('- [x] A pending task');
});

test('shows the lines of a paragraph as they are in the file while editing', async ({ page }) => {
  const para = page.locator('.cm-line', { hasText: 'mded shows your markdown' });
  await expect(para).not.toContainText('appear where');
  expect(await docText(page)).toContain('markers only\nappear where');
});

test('Reading Mode with joining on visually joins the lines without changing the text', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('mded.prefs', JSON.stringify({ readingJoin: true })));
  await page.reload();
  await expect(page).toHaveTitle(TITLE);
  await page.keyboard.press(`${mod}+e`);
  const para = page.locator('.cm-line', { hasText: 'mded shows your markdown' });
  await expect(para).toContainText('but it reads as one paragraph');
  expect(await docText(page)).toContain('markers only\nappear where');
});

test.describe('appearance', () => {
  const setPrefs = (p: string) => localStorage.setItem('mded.prefs', p);

  test('dark theme chosen while the system is light', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(setPrefs, JSON.stringify({ theme: 'dark' }));
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
    await page.screenshot({ path: 'screenshots/editor-dark.png' });
  });

  test('light theme chosen while the system is dark', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(setPrefs, JSON.stringify({ theme: 'light' }));
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('system theme follows the system', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(28, 28, 30)');
  });

  test('full width fills the window', async ({ page }) => {
    await page.goto('/');
    const readable = (await page.locator('.cm-content').boundingBox())?.width ?? 0;
    expect(readable).toBeLessThanOrEqual(760);
    await page.evaluate(() => localStorage.setItem('mded.prefs', JSON.stringify({ width: 'full' })));
    await page.reload();
    const full = (await page.locator('.cm-content').boundingBox())?.width ?? 0;
    expect(full).toBeGreaterThan(1000);
  });
});
