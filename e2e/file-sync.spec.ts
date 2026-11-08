import { expect, type Page, test } from '@playwright/test';

// The web platform keeps the "disk" in memory. `simulateExternalChange` is another program
// writing to it, with or without the watcher noticing (`notify: false`).

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const FILE = '/examples/example.md';
const TITLE = 'example.md — mded';

interface Hook {
  view: { state: { sliceDoc(): string; selection: { main: { head: number } } } };
  platform: {
    files: Map<string, string>;
    writeFile(path: string, contents: string): Promise<void>;
    simulateExternalChange(path: string, contents: string | null, notify?: boolean): void;
  };
  settled(): Promise<void>;
}
type Win = { __mded: Hook; __writes: string[] };

/** Another program changes (or deletes, with null) the file. Resolves when the editor has reacted. */
const external = (page: Page, contents: string | null, notify = true, path = FILE) =>
  page.evaluate(
    async ([p, c, n]) => {
      const m = (window as unknown as Win).__mded;
      m.platform.simulateExternalChange(p as string, c as string | null, n as boolean);
      await m.settled();
    },
    [path, contents, notify],
  );

/** Waits for the checks and button actions the editor has queued. */
const settled = (page: Page) => page.evaluate(() => (window as unknown as Win).__mded.settled());

const text = (page: Page) => page.evaluate(() => (window as unknown as Win).__mded.view.state.sliceDoc());
const head = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__mded.view.state.selection.main.head);
const disk = (page: Page, path = FILE) =>
  page.evaluate((p) => (window as unknown as Win).__mded.platform.files.get(p), path);

/** Records what the editor writes, to tell "saved the same text" from "did not save". */
const spyWrites = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Win;
    w.__writes = [];
    const platform = w.__mded.platform;
    const write = platform.writeFile.bind(platform);
    platform.writeFile = async (path, contents) => {
      w.__writes.push(contents);
      return write(path, contents);
    };
  });
const writes = (page: Page) => page.evaluate(() => (window as unknown as Win).__writes);

const alert = (page: Page) => page.getByRole('alert');
const notice = (page: Page) => page.getByRole('status');

/** Types at the end of the title line, with real key presses (the cursor stays there afterwards). */
async function typeAtEnd(page: Page, s: string) {
  await page.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(s);
}

const save = (page: Page) => page.keyboard.press(`${mod}+s`);

/** The example with something different in its title line. */
const retitled = (original: string, suffix: string) =>
  original.replace('# Welcome to mded', `# Welcome to mded${suffix}`);

test.describe('with the example open', () => {
  let original: string;

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(TITLE);
    original = await text(page);
  });

  test.describe('document without unsaved changes', () => {
    test('an external change is reloaded and the document stays saved', async ({ page }) => {
      const changed = retitled(original, ' v2');
      await external(page, changed);
      expect(await text(page)).toBe(changed);
      await expect(page).toHaveTitle(TITLE);
      await expect(alert(page)).toBeHidden();
    });

    test('the cursor stays in the same place in unchanged text', async ({ page }) => {
      await page.locator('.cm-line', { hasText: 'Links and images' }).click();
      const before = await head(page);
      const added = 'Added by someone else.\n\n';
      await external(page, added + original);
      expect(await head(page)).toBe(before + added.length);
    });

    test('a touch with identical content does nothing', async ({ page }) => {
      await external(page, original);
      await expect(notice(page)).toBeHidden();
      await expect(alert(page)).toBeHidden();
      await expect(page).toHaveTitle(TITLE);
      expect(await text(page)).toBe(original);
    });

    test('shows a discreet notice that goes away on its own and never takes the keyboard', async ({
      page,
    }) => {
      await typeAtEnd(page, '!');
      await page.keyboard.press(`${mod}+z`); // back to a clean document, cursor in the editor
      await external(page, retitled(original, ' v2'));

      await expect(notice(page)).toBeVisible();
      await expect(notice(page)).toHaveText('Reloaded from disk');
      await page.keyboard.type('Z');
      expect(await text(page)).toContain('Z');

      await expect(notice(page)).toBeHidden({ timeout: 5000 });
    });

    test('undo after an automatic reload brings the previous text back, as unsaved', async ({ page }) => {
      await external(page, retitled(original, ' v2'));
      await page.locator('.cm-content').click();
      await page.keyboard.press(`${mod}+z`);
      expect(await text(page)).toBe(original);
      await expect(page).toHaveTitle(`• ${TITLE}`);
    });

    test('the check when the window gets focus finds what the watcher missed', async ({ page }) => {
      const changed = retitled(original, ' v3');
      await external(page, changed, false);
      expect(await text(page)).toBe(original); // nobody told the editor

      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await settled(page);
      expect(await text(page)).toBe(changed);
    });
  });

  test.describe('document with unsaved changes', () => {
    test('an external change shows the conflict bar and keeps the text; typing still goes to the editor', async ({
      page,
    }) => {
      await typeAtEnd(page, ' mine');
      const mine = await text(page);
      await external(page, retitled(original, ' theirs'));

      await expect(alert(page)).toBeVisible();
      await expect(alert(page)).toContainText('changed on disk');
      await expect(alert(page).getByRole('button', { name: 'Reload from disk' })).toBeVisible();
      await expect(alert(page).getByRole('button', { name: 'Keep mine' })).toBeVisible();
      expect(await text(page)).toBe(mine);
      await expect(page).toHaveTitle(`• ${TITLE}`);

      // Keys, Enter included, belong to the editor: the bar cannot be answered by accident
      await page.keyboard.type(' more');
      await page.keyboard.press('Enter');
      const after = await text(page);
      expect(after).toContain(' mine more\n');
      expect(after.length).toBe(mine.length + ' more'.length + 1);
      await expect(alert(page)).toBeVisible();
      expect(await disk(page)).toBe(retitled(original, ' theirs'));
    });

    test('the bar goes away by itself when the document is edited to match the disk', async ({ page }) => {
      await typeAtEnd(page, ' Y');
      const theirs = retitled(original, ' X');
      await external(page, theirs);
      await expect(alert(page)).toBeVisible();

      await page.keyboard.press('Backspace');
      await page.keyboard.press('Backspace');
      await expect(alert(page)).toBeVisible();
      await page.keyboard.type(' X');

      expect(await text(page)).toBe(theirs);
      await expect(alert(page)).toBeHidden();
      await expect(page).toHaveTitle(TITLE);
    });

    test('the bar goes away when whoever changed the file puts it back', async ({ page }) => {
      await typeAtEnd(page, ' mine');
      await external(page, retitled(original, ' theirs'));
      await expect(alert(page)).toBeVisible();

      await external(page, original); // back to what we had read
      await expect(alert(page)).toBeHidden();
    });

    test('a change with the same content as the document is not a conflict', async ({ page }) => {
      await typeAtEnd(page, ' same');
      await external(page, await text(page));
      await expect(alert(page)).toBeHidden();
      await expect(page).toHaveTitle(TITLE);
    });

    test('Reload from disk shows the current disk content, and undo brings the text back', async ({
      page,
    }) => {
      await typeAtEnd(page, ' mine');
      const mine = await text(page);
      await external(page, retitled(original, ' theirs'));
      await expect(alert(page)).toBeVisible();

      // Changed again after the bar appeared, and the editor was not told
      const latest = retitled(original, ' theirs, twice');
      await external(page, latest, false);

      await alert(page).getByRole('button', { name: 'Reload from disk' }).click();
      await settled(page);
      expect(await text(page)).toBe(latest);
      await expect(alert(page)).toBeHidden();
      await expect(page).toHaveTitle(TITLE);

      // The click did not take the focus away from the editor
      await page.keyboard.press(`${mod}+z`);
      expect(await text(page)).toBe(mine);
      await expect(page).toHaveTitle(`• ${TITLE}`);
    });

    test('Keep mine hides the bar and lets the next save overwrite the file', async ({ page }) => {
      await typeAtEnd(page, ' mine');
      const mine = await text(page);
      await external(page, retitled(original, ' theirs'));
      await alert(page).getByRole('button', { name: 'Keep mine' }).click();
      await settled(page);

      await expect(alert(page)).toBeHidden();
      expect(await text(page)).toBe(mine);
      await expect(page).toHaveTitle(`• ${TITLE}`);

      await save(page);
      await expect(page).toHaveTitle(TITLE);
      expect(await disk(page)).toBe(mine);
    });

    test('after Keep mine, another change on disk shows the bar again', async ({ page }) => {
      await typeAtEnd(page, ' mine');
      await external(page, retitled(original, ' theirs'));
      await alert(page).getByRole('button', { name: 'Keep mine' }).click();
      await settled(page);
      await expect(alert(page)).toBeHidden();

      await external(page, retitled(original, ' theirs again'));
      await expect(alert(page)).toBeVisible();
    });
  });

  test.describe('saving', () => {
    test('does not overwrite a change the editor was never told about', async ({ page }) => {
      await typeAtEnd(page, '!');
      await external(page, 'written by someone else\n', false);
      await save(page);

      await expect(alert(page)).toBeVisible();
      expect(await disk(page)).toBe('written by someone else\n');
      await expect(page).toHaveTitle(`• ${TITLE}`);
    });

    test('with no unsaved changes, an unseen change is reloaded and not overwritten', async ({ page }) => {
      await external(page, 'written by someone else\n', false);
      await save(page);

      await expect.poll(() => text(page)).toBe('written by someone else\n');
      expect(await disk(page)).toBe('written by someone else\n');
      await expect(page).toHaveTitle(TITLE);
    });

    test('two saves in a row, with an edit in between, both write and never conflict', async ({ page }) => {
      await spyWrites(page);
      await typeAtEnd(page, '!');
      await save(page);
      await expect(page).toHaveTitle(TITLE);
      await typeAtEnd(page, '?');
      await save(page);
      await expect(page).toHaveTitle(TITLE);

      expect(await writes(page)).toHaveLength(2);
      expect(await disk(page)).toBe(await text(page));
      await expect(alert(page)).toBeHidden();
    });

    test('our own save is not taken for an external change', async ({ page }) => {
      await typeAtEnd(page, '!');
      await save(page);
      await expect(page).toHaveTitle(TITLE);
      // What the watcher does after our own write
      await external(page, await text(page));
      await expect(notice(page)).toBeHidden();
      await expect(alert(page)).toBeHidden();
    });
  });

  test.describe('file deleted or moved', () => {
    test('keeps the text, marks it unsaved and tells the user', async ({ page }) => {
      await external(page, null);
      await expect(alert(page)).toBeVisible();
      await expect(alert(page)).toContainText('no longer exists');
      await expect(alert(page).getByRole('button')).toHaveCount(0);
      expect(await text(page)).toBe(original);
      await expect(page).toHaveTitle(`• ${TITLE}`);
    });

    test('saving creates the file again', async ({ page }) => {
      await external(page, null);
      await expect(alert(page)).toBeVisible();
      await save(page);

      await expect(alert(page)).toBeHidden();
      await expect(page).toHaveTitle(TITLE);
      expect(await disk(page)).toBe(original);
    });

    test('the file coming back is treated like any other external change', async ({ page }) => {
      await external(page, null);
      await expect(alert(page)).toBeVisible();
      const back = retitled(original, ' restored');
      await external(page, back);

      await expect(alert(page)).toBeHidden();
      expect(await text(page)).toBe(back);
      await expect(page).toHaveTitle(TITLE);
    });

    test('the file coming back while there are unsaved changes is a conflict', async ({ page }) => {
      await typeAtEnd(page, ' mine');
      await external(page, null);
      await external(page, retitled(original, ' restored'));
      await expect(alert(page)).toContainText('changed on disk');
    });
  });
});

test.describe('without a file', () => {
  test('a new document ignores changes to files, and the focus check', async ({ page }) => {
    await page.goto('/?file=');
    await expect(page).toHaveTitle('Untitled — mded');
    await page.locator('.cm-content').click();
    await page.keyboard.type('hello');

    await external(page, 'something else\n', true, FILE);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await settled(page);

    await expect(alert(page)).toBeHidden();
    await expect(notice(page)).toBeHidden();
    expect(await text(page)).toBe('hello');
  });
});

test.describe('line endings', () => {
  const CRLF = '/fixtures/crlf.md';
  const LF = '/fixtures/lf.md';

  test.beforeEach(async ({ page }) => {
    // By pathname: a glob would also match the page's own URL (?file=/fixtures/crlf.md)
    await page.route(
      (u) => u.pathname === CRLF,
      (r) => r.fulfill({ contentType: 'text/markdown', body: 'one\r\ntwo\r\n' }),
    );
    await page.route(
      (u) => u.pathname === LF,
      (r) => r.fulfill({ contentType: 'text/markdown', body: 'one\ntwo\n' }),
    );
  });

  test('a CRLF file reloaded after an external change is saved byte for byte', async ({ page }) => {
    await page.goto(`/?file=${CRLF}`);
    await expect(page).toHaveTitle('crlf.md — mded');
    await spyWrites(page);

    const changed = 'one\r\ntwo\r\nthree\r\n';
    await external(page, changed, true, CRLF);
    expect(await text(page)).toBe(changed);

    await save(page);
    await expect.poll(() => writes(page)).toEqual([changed]);
  });

  test('a file converted from LF to CRLF is reloaded and saved with CRLF', async ({ page }) => {
    await page.goto(`/?file=${LF}`);
    await expect(page).toHaveTitle('lf.md — mded');
    await spyWrites(page);

    const converted = 'one\r\ntwo\r\nthree\r\n';
    await external(page, converted, true, LF);
    expect(await text(page)).toBe(converted);
    await expect(page).toHaveTitle('lf.md — mded');

    await save(page);
    await expect.poll(() => writes(page)).toEqual([converted]);
  });
});

test.describe('look of the bar and the notice', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`conflict, deleted and notice in ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(page).toHaveTitle(TITLE);
      const original = await text(page);

      await external(page, retitled(original, ' v2'));
      await expect(notice(page)).toBeVisible();
      await page.screenshot({ path: `screenshots/file-notice-${scheme}.png` });

      await typeAtEnd(page, ' mine');
      await external(page, retitled(original, ' v3'));
      await expect(alert(page)).toBeVisible();
      await page.screenshot({ path: `screenshots/file-conflict-${scheme}.png` });

      // Layout: the bar takes space, it does not cover the editor
      const barBox = await alert(page).boundingBox();
      const editorBox = await page.locator('#editor').boundingBox();
      expect(barBox && editorBox && editorBox.y >= barBox.y + barBox.height - 1).toBe(true);
      // ...and the page does not grow: the editor shrinks and scrolls inside its own box
      const overflow = await page.evaluate(
        () => document.documentElement.scrollHeight - document.documentElement.clientHeight,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      await external(page, null);
      await expect(alert(page)).toContainText('no longer exists');
      await page.screenshot({ path: `screenshots/file-deleted-${scheme}.png` });
    });
  }
});
