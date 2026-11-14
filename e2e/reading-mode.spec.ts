import { expect, type Page, test } from '@playwright/test';

// Edit mode shows the file's line breaks as they are; Reading Mode shows the document
// rendered, protected from changes, and optionally joins lines. Native menu items and the
// accelerator can't be tested here: Cmd+E in the browser build is the same action.

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const FILE = '/examples/example.md';
const TITLE = 'example.md — mded';
const READING_TITLE = 'example.md (Reading) — mded';

interface Hook {
  view: {
    state: { sliceDoc(from?: number, to?: number): string; selection: { main: { head: number } } };
    dispatch(spec: unknown): void;
    contentDOM: HTMLElement;
    focus(): void;
  };
  platform: {
    files: Map<string, string>;
    simulateExternalChange(path: string, contents: string | null, notify?: boolean): void;
  };
  settled(): Promise<void>;
}
type Win = { __mded: Hook };

const text = (page: Page) => page.evaluate(() => (window as unknown as Win).__mded.view.state.sliceDoc());
const head = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__mded.view.state.selection.main.head);
const select = (page: Page, anchor: number, headPos = anchor) =>
  page.evaluate(
    ([a, h]) => {
      const { view } = (window as unknown as Win).__mded;
      view.dispatch({ selection: { anchor: a, head: h } });
      view.focus();
    },
    [anchor, headPos],
  );

const editor = (page: Page) => page.locator('.cm-editor');
const lines = (page: Page) => page.locator('.cm-line');
const notice = (page: Page) => page.getByRole('status');
const alert = (page: Page) => page.getByRole('alert');
const incoming = (page: Page) => page.locator('.cm-line.cm-incoming');
const toggleReading = (page: Page) => page.keyboard.press(`${mod}+e`);
const paragraph = (page: Page) => lines(page).filter({ hasText: 'mded shows' });

/** Opens `doc` as the file (the web platform fetches it from the dev server: intercept that). */
async function openDoc(page: Page, doc: string, prefs?: object) {
  // By pathname: a glob would also match the page's own URL (`/?file=/reading-mode-test.md`)
  await page.route(
    (url) => url.pathname === '/reading-mode-test.md',
    (route) => route.fulfill({ contentType: 'text/markdown', body: doc }),
  );
  if (prefs) await page.addInitScript((p) => localStorage.setItem('mded.prefs', p), JSON.stringify(prefs));
  await page.goto('/?file=/reading-mode-test.md');
  await expect(page).toHaveTitle('reading-mode-test.md — mded');
}

async function openExample(page: Page, prefs?: object) {
  if (prefs) await page.addInitScript((p) => localStorage.setItem('mded.prefs', p), JSON.stringify(prefs));
  await page.goto('/');
  await expect(page).toHaveTitle(TITLE);
}

test.describe('edit mode', () => {
  test('a line typed after Enter at the end of a paragraph stays on its own line', async ({ page }) => {
    await openDoc(page, 'Alpha\nbeta\n\nOmega\n');
    await select(page, 10);
    await page.keyboard.press('Enter');
    await page.keyboard.type('new');
    await expect(lines(page)).toHaveText(['Alpha', 'beta', 'new', '', 'Omega', '']);
    expect(await text(page)).toBe('Alpha\nbeta\nnew\n\nOmega\n');
  });

  test('typing on the blank line between two paragraphs does not join them', async ({ page }) => {
    await openDoc(page, 'one\n\ntwo');
    await select(page, 4);
    await page.keyboard.type('x');
    await expect(lines(page)).toHaveText(['one', 'x', 'two']);
  });

  test('Enter in the middle of a line starts a new line', async ({ page }) => {
    await openDoc(page, 'foobar');
    await select(page, 3);
    await page.keyboard.press('Enter');
    await expect(lines(page)).toHaveText(['foo', 'bar']);
  });

  test('the join option does not affect it', async ({ page }) => {
    await openDoc(page, 'one\ntwo\nthree', { readingJoin: true });
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
    await expect(lines(page)).toHaveText(['one', 'two', 'three']);
  });
});

test.describe('reading mode', () => {
  test('Cmd+E turns it on and off', async ({ page }) => {
    await openExample(page);
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
    await toggleReading(page);
    await expect(editor(page)).toHaveClass(/cm-reading/);
    await toggleReading(page);
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
  });

  test('always starts in edit mode', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    await expect(editor(page)).toHaveClass(/cm-reading/);
    await page.reload();
    await expect(page).toHaveTitle(TITLE);
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
  });

  test('the caret does not reveal markers', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    const title = lines(page).filter({ hasText: 'Welcome to mded' });
    await title.click();
    await expect(title).toHaveText('Welcome to mded');
    // Selecting a bold word keeps its ** hidden
    await paragraph(page).getByText('rendered').dblclick();
    await expect(paragraph(page)).not.toContainText('**');
    await toggleReading(page);
    await paragraph(page).getByText('rendered').first().click();
    await expect(paragraph(page)).toContainText('**rendered**');
  });

  test('typing, Enter and Backspace change nothing and say how to edit', async ({ page }) => {
    await openExample(page);
    const original = await text(page);
    await toggleReading(page);
    await paragraph(page).click();
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Backspace');
    expect(await text(page)).toBe(original);
    await expect(page).toHaveTitle(READING_TITLE);
    await expect(notice(page)).toHaveText(/Reading Mode: press (⌘E|Ctrl\+E) to edit/);
  });

  test('moving the caret shows no notice', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    await paragraph(page).click();
    const before = await head(page);
    await page.keyboard.press('ArrowRight');
    expect(await head(page)).toBe(before + 1);
    await expect(notice(page)).toBeHidden();
  });

  test('paste, drop and cut change nothing', async ({ page }) => {
    await openExample(page);
    const original = await text(page);
    await toggleReading(page);
    await select(page, 0, 7);
    await page.evaluate(() => {
      const { view } = (window as unknown as Win).__mded;
      const fire = (type: string, init: Record<string, unknown>) => {
        const data = new DataTransfer();
        data.setData('text/plain', 'PASTED');
        view.contentDOM.dispatchEvent(
          new ClipboardEvent(type, { clipboardData: data, bubbles: true, cancelable: true, ...init }),
        );
      };
      fire('paste', {});
      fire('cut', {});
    });
    await page.keyboard.press(`${mod}+x`);
    expect(await text(page)).toBe(original);
    await expect(page).toHaveTitle(READING_TITLE);
  });

  test('undo does nothing', async ({ page }) => {
    await openExample(page);
    await select(page, 0);
    await page.keyboard.type('!');
    const edited = await text(page);
    expect(edited.startsWith('!')).toBe(true);
    await toggleReading(page);
    await page.keyboard.press(`${mod}+z`);
    expect(await text(page)).toBe(edited);
  });

  test('copy gives the markdown text as in the file', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    const start = (await text(page)).indexOf('**rendered**');
    await select(page, start, start + 12);
    const copied = await page.evaluate(() => {
      const data = new DataTransfer();
      (window as unknown as Win).__mded.view.contentDOM.dispatchEvent(
        new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }),
      );
      return data.getData('text/plain');
    });
    expect(copied).toBe('**rendered**');
  });

  test('task checkboxes cannot be toggled', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    await page.locator('.cm-md-checkbox').first().dispatchEvent('mousedown');
    await page.locator('.cm-md-checkbox').last().dispatchEvent('mousedown');
    expect(await text(page)).toContain('- [ ] A pending task');
    expect(await text(page)).toContain('- [x] A finished task');
    await expect(page).toHaveTitle(READING_TITLE);
  });

  test('File > New goes back to editing, opening a file keeps the mode', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press(`${mod}+o`)]);
    await chooser.setFiles({ name: 'other.md', mimeType: 'text/markdown', buffer: Buffer.from('# Other\n') });
    await expect(page).toHaveTitle('other.md (Reading) — mded');
    await expect(editor(page)).toHaveClass(/cm-reading/);
    await page.keyboard.press(`${mod}+n`);
    await expect(page).toHaveTitle('Untitled — mded');
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
  });
});

test.describe('showing the mode', () => {
  const pill = (page: Page) => page.getByRole('button', { name: 'Reading' });
  const caret = (page: Page) => page.locator('.cm-cursor').first();

  test('pill, title and no caret while reading; none of them while editing', async ({ page }) => {
    await openExample(page);
    await lines(page).filter({ hasText: 'Links and images' }).click();
    await expect(pill(page)).toBeHidden();
    await expect(caret(page)).toBeVisible();
    await toggleReading(page);
    await expect(pill(page)).toBeVisible();
    await expect(page).toHaveTitle(READING_TITLE);
    await expect(caret(page)).toBeHidden();
    await page.screenshot({ path: 'screenshots/reading-pill-light.png' });
    await toggleReading(page);
    await expect(pill(page)).toBeHidden();
    await expect(page).toHaveTitle(TITLE);
    await expect(caret(page)).toBeVisible();
  });

  test('the pill in dark mode', async ({ page }) => {
    await openExample(page, { theme: 'dark' });
    await toggleReading(page);
    await expect(pill(page)).toBeVisible();
    await page.screenshot({ path: 'screenshots/reading-pill-dark.png' });
  });

  test('the title keeps the unsaved mark', async ({ page }) => {
    await openExample(page);
    await select(page, 0);
    await page.keyboard.type('!');
    await toggleReading(page);
    await expect(page).toHaveTitle(`• ${READING_TITLE}`);
  });

  test('clicking the pill goes back to editing and typing goes into the text', async ({ page }) => {
    await openExample(page);
    await select(page, 0);
    await toggleReading(page);
    await pill(page).click();
    await expect(editor(page)).not.toHaveClass(/cm-reading/);
    await expect(pill(page)).toBeHidden();
    await expect(page).toHaveTitle(TITLE);
    await page.keyboard.type('X');
    expect((await text(page)).startsWith('X# Welcome')).toBe(true);
  });

  test('task checkboxes do not look clickable', async ({ page }) => {
    await openExample(page);
    const box = page.locator('.cm-md-checkbox').first();
    await expect(box).toHaveCSS('cursor', 'pointer');
    await toggleReading(page);
    await expect(box).toHaveCSS('cursor', 'default');
  });
});

test.describe('join lines when reading', () => {
  test('is off by default: the lines of a paragraph stay separate', async ({ page }) => {
    await openExample(page);
    await toggleReading(page);
    await expect(paragraph(page)).not.toContainText('appear where');
    await page.screenshot({ path: 'screenshots/reading-not-joined.png' });
  });

  test('joins the lines without changing the text', async ({ page }) => {
    await openExample(page, { readingJoin: true });
    const original = await text(page);
    await toggleReading(page);
    await expect(paragraph(page)).toContainText('but it reads as one paragraph');
    expect(await text(page)).toBe(original);
    expect(original).toContain('markers only\nappear where');
    await page.screenshot({ path: 'screenshots/reading-joined.png' });
    // ...and editing shows the file's lines again
    await toggleReading(page);
    await expect(paragraph(page)).not.toContainText('appear where');
  });

  test('keeps hard breaks', async ({ page }) => {
    await openDoc(page, 'one  \ntwo\nthree', { readingJoin: true });
    await toggleReading(page);
    await expect(lines(page)).toHaveText(['one', 'two three']);
  });
});

test.describe('switching modes keeps the place', () => {
  const doc = Array.from({ length: 200 }, (_, i) => `P${i} a\nP${i} b\nP${i} c`).join('\n\n');

  const scrollTop = (page: Page) => page.locator('.cm-scroller').evaluate((el) => Math.round(el.scrollTop));

  /**
   * Waits until the scroll position stops changing. CodeMirror estimates the height of lines it
   * has not drawn and corrects the scroll as it measures them, so right after scrolling far it
   * is not where it was put.
   */
  const settleScroll = (page: Page) =>
    page.locator('.cm-scroller').evaluate(
      (el) =>
        new Promise<void>((resolve) => {
          let last = -1;
          let stable = 0;
          const frame = () => {
            stable = el.scrollTop === last ? stable + 1 : 0;
            last = el.scrollTop;
            if (stable >= 15) resolve();
            else requestAnimationFrame(frame);
          };
          frame();
        }),
    );

  /** Number of the paragraph at the top of the window. */
  const topParagraph = (page: Page) =>
    page.evaluate(() => {
      const top = (document.querySelector('.cm-scroller') as HTMLElement).getBoundingClientRect().top;
      for (const line of document.querySelectorAll('.cm-line')) {
        const rect = line.getBoundingClientRect();
        if (rect.bottom > top + 1) return Number(/P(\d+)/.exec(line.textContent ?? '')?.[1]);
      }
      return -1;
    });

  test('Up and Down scroll by a line without moving the selection', async ({ page }) => {
    await openDoc(page, doc);
    const at = doc.indexOf('P0 b');
    await select(page, at);
    await toggleReading(page);
    await settleScroll(page);
    const y = await scrollTop(page);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await settleScroll(page);
    const down = (await scrollTop(page)) - y;
    // About two lines (line height is 16px * 1.65)
    expect(down).toBeGreaterThan(40);
    expect(down).toBeLessThan(70);
    expect(await head(page)).toBe(at);
    await page.keyboard.press('ArrowUp');
    await settleScroll(page);
    expect((await scrollTop(page)) - y).toBeLessThan(down);
    expect(await head(page)).toBe(at);
    // Editing again: the arrows move the caret
    await toggleReading(page);
    await page.keyboard.press('ArrowDown');
    expect(await head(page)).toBe(doc.indexOf('P0 c'));
  });

  for (const join of [false, true]) {
    test(`caret and top line, with joining ${join ? 'on' : 'off'}`, async ({ page }) => {
      await openDoc(page, doc, { readingJoin: join });
      const at = doc.indexOf('P90 b');
      await select(page, at);
      await page.locator('.cm-scroller').evaluate((el) => {
        el.scrollTop = 4000;
      });
      await settleScroll(page);
      const top = await topParagraph(page);
      const y = await scrollTop(page);
      expect(top).toBeGreaterThan(20);
      for (let i = 0; i < 2; i++) {
        await toggleReading(page);
        await settleScroll(page);
        expect(await topParagraph(page)).toBe(top);
        expect(await head(page)).toBe(at);
        await toggleReading(page);
        await settleScroll(page);
        expect(await topParagraph(page)).toBe(top);
        expect(await head(page)).toBe(at);
      }
      // Without joining nothing changes height, so the window must not move at all
      if (!join) expect(Math.abs((await scrollTop(page)) - y)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('changes on disk while reading', () => {
  const external = (page: Page, contents: string | null) =>
    page.evaluate(
      async ([p, c]) => {
        const m = (window as unknown as Win).__mded;
        m.platform.simulateExternalChange(p as string, c as string | null);
        await m.settled();
      },
      [FILE, contents],
    );

  test('are reloaded and highlighted, and the mode stays on', async ({ page }) => {
    await openExample(page);
    const original = await text(page);
    await toggleReading(page);
    await external(page, original.replace('Second', 'Second, edited elsewhere'));
    await expect(incoming(page)).toHaveCount(1);
    await expect(incoming(page)).toContainText('Second, edited elsewhere');
    await expect(editor(page)).toHaveClass(/cm-reading/);
  });

  test('highlight the joined paragraph when one of its lines changed', async ({ page }) => {
    await openExample(page, { readingJoin: true });
    const original = await text(page);
    await toggleReading(page);
    await external(page, original.replace('appear where', 'appear only where'));
    await expect(incoming(page).filter({ hasText: 'mded shows your markdown' })).toHaveCount(1);
  });

  test('the conflict bar buttons work', async ({ page }) => {
    await openExample(page);
    const original = await text(page);
    await select(page, 0);
    await page.keyboard.type('mine ');
    await toggleReading(page);
    const theirs = original.replace('# Welcome', '# Hello');
    await external(page, theirs);
    await expect(alert(page)).toBeVisible();
    await alert(page).getByRole('button', { name: 'Reload from disk' }).click();
    await expect.poll(() => text(page)).toBe(theirs);
    await expect(alert(page)).toBeHidden();
  });
});

// A search match is the one thing that shows markers while reading (the `search` capability says
// how a match is found; this is what Reading Mode does with it)
test.describe('search while reading', () => {
  const doc = 'A **bold** word\n\nend\n';
  const boldLine = (page: Page) => lines(page).filter({ hasText: 'word' });

  test.beforeEach(async ({ page }) => {
    await openDoc(page, doc);
    // The caret on the last line, away from the bold
    await select(page, doc.length - 1);
    await toggleReading(page);
    await expect(page).toHaveTitle('reading-mode-test.md (Reading) — mded');
  });

  test('a match on visible text keeps the markers hidden', async ({ page }) => {
    await page.keyboard.press(`${mod}+f`);
    await page.keyboard.type('bold');
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-searchMatch-selected')).toHaveText('bold');
    await expect(boldLine(page)).toHaveText('A bold word');
    await expect(boldLine(page).locator('.cm-md-mark')).toHaveCount(0);
  });

  test('a match on the markers shows them dimmed until the panel is closed', async ({ page }) => {
    await page.keyboard.press(`${mod}+f`);
    await page.keyboard.type('**');
    await expect(boldLine(page)).toHaveText('A **bold** word');
    await expect(boldLine(page).locator('.cm-md-mark')).toHaveText(['**', '**']);

    await page.keyboard.press('Escape');
    await expect(boldLine(page)).toHaveText('A bold word');
    await expect(boldLine(page).locator('.cm-md-mark')).toHaveCount(0);
    // Still reading, and the text is as it was
    await expect(page).toHaveTitle('reading-mode-test.md (Reading) — mded');
    expect(await text(page)).toBe(doc);
  });
});
