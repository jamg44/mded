import { expect, type Page, test } from '@playwright/test';

// Search and replace over the text of the file. The Edit menu items and their accelerators are
// native and can't be tested here: Cmd+F, Cmd+G and the rest come from CodeMirror's keymap.

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const TITLE = 'example.md — mded';

interface Hook {
  view: {
    state: {
      sliceDoc(from?: number, to?: number): string;
      selection: { main: { from: number; to: number } };
    };
    dispatch(spec: unknown): void;
    focus(): void;
  };
  platform: { files: Map<string, string> };
}
type Win = { __mded: Hook };

const text = (page: Page) => page.evaluate(() => (window as unknown as Win).__mded.view.state.sliceDoc());
const selection = (page: Page) =>
  page.evaluate(() => {
    const { from, to } = (window as unknown as Win).__mded.view.state.selection.main;
    return [from, to];
  });
const select = (page: Page, anchor: number, head = anchor) =>
  page.evaluate(
    ([a, h]) => {
      const { view } = (window as unknown as Win).__mded;
      view.dispatch({ selection: { anchor: a, head: h } });
      view.focus();
    },
    [anchor, head],
  );

const panel = (page: Page) => page.locator('.cm-search');
const searchField = (page: Page) => page.locator('.cm-search input[name=search]');
const matches = (page: Page) => page.locator('.cm-searchMatch');
const frames = (page: Page) =>
  page.evaluate(
    () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  );

/** Opens a document written for the test (served by path, so the page's own URL is not matched). */
async function openDoc(page: Page, doc: string, prefs?: object) {
  await page.route(
    (url) => url.pathname === '/search-test.md',
    (route) => route.fulfill({ contentType: 'text/markdown', body: doc }),
  );
  if (prefs) await page.addInitScript((p) => localStorage.setItem('mded.prefs', p), JSON.stringify(prefs));
  await page.goto('/?file=/search-test.md');
  await expect(page).toHaveTitle('search-test.md — mded');
}

async function openExample(page: Page, prefs?: object) {
  if (prefs) await page.addInitScript((p) => localStorage.setItem('mded.prefs', p), JSON.stringify(prefs));
  await page.goto('/');
  await expect(page).toHaveTitle(TITLE);
}

/** Opens the panel with the caret in the text, types a search and waits until it is shown. */
async function search(page: Page, query: string) {
  await page.keyboard.press(`${mod}+f`);
  await expect(panel(page)).toBeVisible();
  await page.keyboard.type(query);
}

test.describe('the panel', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`is dressed in the app's colors (${scheme})`, async ({ page }) => {
      await openExample(page, { theme: scheme });
      await page.locator('.cm-line', { hasText: 'Links and images' }).click();
      await search(page, 'mded');
      await expect(matches(page).first()).toBeVisible();
      await select(page, 0);
      await page.keyboard.press(`${mod}+g`);
      await frames(page);

      const css = await page.evaluate(() => {
        const style = (sel: string, prop: string) =>
          getComputedStyle(document.querySelector(sel) as Element).getPropertyValue(prop);
        const token = (name: string) => {
          // Resolve a token to the color the browser computes for it
          const probe = document.createElement('span');
          probe.style.backgroundColor = `var(${name})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).backgroundColor;
          probe.remove();
          return color;
        };
        return {
          panelBg: style('.cm-panels', 'background-color'),
          pageBg: token('--bg'),
          matchBg: style('.cm-searchMatch:not(.cm-searchMatch-selected)', 'background-color'),
          matchToken: token('--match-bg'),
          currentBg: style('.cm-searchMatch-selected', 'background-color'),
          currentToken: token('--match-current-bg'),
          fieldBg: style('.cm-search input[name=search]', 'background-color'),
          buttonImage: style('.cm-search button[name=next]', 'background-image'),
          allButton: style('.cm-search button[name=select]', 'display'),
        };
      });
      expect(css.panelBg).toBe(css.pageBg);
      expect(css.matchBg).toBe(css.matchToken);
      expect(css.currentBg).toBe(css.currentToken);
      expect(css.fieldBg).toBe(css.pageBg);
      expect(css.buttonImage).toBe('none');
      // "all" would select every match, and the editor has no multiple selections
      expect(css.allButton).toBe('none');

      await page.screenshot({ path: `screenshots/search-panel-${scheme}.png` });
    });
  }
});

/** 300 short paragraphs: long enough to scroll halfway down. */
const longDoc = () =>
  Array.from({ length: 300 }, (_, i) => `Paragraph ${i + 1} of the long document`).join('\n\n');

const scrollTo = (page: Page, top: number) =>
  page.locator('.cm-scroller').evaluate((el, y) => {
    el.scrollTop = y;
  }, top);

/** The text of a line that is really in the window (CodeMirror also renders some beyond it). */
const visibleLine = (page: Page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('.cm-line')) {
      const top = el.getBoundingClientRect().top;
      if (top > 300 && top < 600 && el.textContent) return el.textContent;
    }
    return '';
  });

const topOf = (page: Page, line: string) =>
  page
    .locator('.cm-line', { hasText: line })
    .first()
    .evaluate((el) => el.getBoundingClientRect().top);
const bottomOf = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => el.getBoundingClientRect().bottom);

test.describe('the panel does not move the text', () => {
  test.beforeEach(async ({ page }) => {
    await openDoc(page, longDoc());
  });

  test('opening and closing it halfway down leaves every line where it was', async ({ page }) => {
    await scrollTo(page, 2400);
    await frames(page);
    const line = await visibleLine(page);
    expect(line).not.toBe('');
    // A click in the text puts the focus there, without scrolling
    await page.locator('.cm-line', { hasText: line }).first().click();
    await frames(page);
    const before = await topOf(page, line);

    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await frames(page);
    // Half a pixel at most: the panel's height is fractional and the scroll position is rounded
    expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await frames(page);
    expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1);
  });

  test('closing it after scrolling with it open leaves every line where it was', async ({ page }) => {
    await page.locator('.cm-line', { hasText: 'Paragraph 1 ' }).first().click();
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await scrollTo(page, 2400);
    await frames(page);
    const line = await visibleLine(page);
    const before = await topOf(page, line);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await frames(page);
    expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1);
  });

  test('at the start of the document the first line stays below the panel', async ({ page }) => {
    await page.locator('.cm-line', { hasText: 'Paragraph 1 ' }).first().click();
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await frames(page);
    const panelBottom = await bottomOf(page, '.cm-panels-top');
    expect(await topOf(page, 'Paragraph 1 ')).toBeGreaterThanOrEqual(panelBottom);

    // And it goes back up when the panel closes
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await frames(page);
    expect(await topOf(page, 'Paragraph 1 ')).toBeLessThan(panelBottom);
  });

  test('in Reading Mode the pill is below the panel, and still switches to editing', async ({ page }) => {
    await page.locator('.cm-line', { hasText: 'Paragraph 1 ' }).first().click();
    await page.keyboard.press(`${mod}+e`);
    const pill = page.locator('#reading-pill');
    await expect(pill).toBeVisible();
    const pillTopClosed = await pill.evaluate((el) => el.getBoundingClientRect().top);

    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await frames(page);
    const panelBottom = await bottomOf(page, '.cm-panels-top');
    expect(await pill.evaluate((el) => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(panelBottom);
    await page.screenshot({ path: 'screenshots/search-panel-reading.png' });

    await pill.click();
    await expect(page).toHaveTitle('search-test.md — mded');

    // The panel closed: the pill is back where it was
    await page.keyboard.press(`${mod}+e`);
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await frames(page);
    expect(await pill.evaluate((el) => el.getBoundingClientRect().top)).toBe(pillTopClosed);
  });
});

/** Where `needle` starts in `doc`, every time. */
const occurrences = (doc: string, needle: string) => {
  const found: number[] = [];
  for (let i = doc.indexOf(needle); i >= 0; i = doc.indexOf(needle, i + 1)) found.push(i);
  return found;
};

test.describe('opening and closing', () => {
  test('Cmd+F opens the panel with the focus in the search field', async ({ page }) => {
    await openExample(page);
    await select(page, 0);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(searchField(page)).toBeFocused();
    const doc = await text(page);
    await page.keyboard.type('welcome');
    await expect(searchField(page)).toHaveValue('welcome');
    // What was typed went into the field, not into the document
    expect(await text(page)).toBe(doc);
  });

  test('Cmd+Option+F opens the panel with the focus in the replace field', async ({ page }) => {
    const doc = 'cat dog cat\n';
    await openDoc(page, doc);
    await select(page, 0);
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(panel(page)).toBeVisible();
    await expect(page.locator('.cm-search input[name=replace]')).toBeFocused();
    await page.keyboard.type('horse');
    await expect(page.locator('.cm-search input[name=replace]')).toHaveValue('horse');
    expect(await text(page)).toBe(doc);
  });

  test('opening it with some text selected searches for that text', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await select(page, 4, 7);
    await page.keyboard.press(`${mod}+f`);
    await expect(searchField(page)).toHaveValue('dog');
    await expect(matches(page)).toHaveCount(1);
  });

  test('Escape closes the panel, removes the highlights and returns to the text', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await select(page, 0);
    await search(page, 'cat');
    await expect(matches(page)).toHaveCount(2);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(matches(page)).toHaveCount(0);
    await page.keyboard.type('X');
    expect((await text(page)).startsWith('X')).toBe(true);
  });

  test('Cmd+F with the panel already open moves the focus back to the search field', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await select(page, 0);
    await search(page, 'cat');
    await select(page, 4);
    await expect(searchField(page)).not.toBeFocused();

    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toHaveCount(1);
    await expect(searchField(page)).toBeFocused();
  });

  test('emptying the search removes the highlights', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await search(page, 'cat');
    await expect(matches(page)).toHaveCount(2);
    await searchField(page).fill('');
    await expect(matches(page)).toHaveCount(0);
  });
});

test.describe('what is searched', () => {
  test('the markers of the file are matches', async ({ page }) => {
    const doc = 'A **bold** word\n';
    await openDoc(page, doc);
    await search(page, '**');
    const [first, second] = occurrences(doc, '**');
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual([first, first + 2]);
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual([second, second + 2]);
  });

  test('a phrase interrupted by a marker is not a match', async ({ page }) => {
    await openDoc(page, 'It is **important** here\n');
    await select(page, 0);
    await search(page, 'is important');
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual([0, 0]);
    await expect(matches(page)).toHaveCount(0);
  });

  test("text inside a link's hidden URL is a match", async ({ page }) => {
    const doc = 'See [Example](https://example.com) now\n';
    await openDoc(page, doc);
    await search(page, 'example.com');
    await page.keyboard.press('Enter');
    const from = doc.indexOf('example.com');
    expect(await selection(page)).toEqual([from, from + 'example.com'.length]);
  });
});

test.describe('searching does not change the document', () => {
  test('a saved document stays saved', async ({ page }) => {
    await openExample(page);
    const doc = await text(page);
    await search(page, 'mded');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    expect(await text(page)).toBe(doc);
    await expect(page).toHaveTitle(TITLE);
  });
});

test.describe('matches', () => {
  test('every match in view is highlighted, and the current one is told apart', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n\nbird cat\n');
    await select(page, 0);
    await search(page, 'cat');
    await expect(matches(page)).toHaveCount(3);
    await expect(page.locator('.cm-searchMatch-selected')).toHaveCount(0);

    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-searchMatch-selected')).toHaveCount(1);
    await expect(matches(page)).toHaveCount(3);
    const [plain, current] = await page.evaluate(() => {
      const color = (el: Element) => getComputedStyle(el).backgroundColor;
      const all = [...document.querySelectorAll('.cm-searchMatch')];
      const selected = all.find((el) => el.classList.contains('cm-searchMatch-selected')) as Element;
      const other = all.find((el) => el !== selected) as Element;
      return [color(other), color(selected)];
    });
    expect(current).not.toBe(plain);
  });
});

test.describe('stepping through matches', () => {
  const doc = 'cat dog cat\n\nbird cat\n';
  const cats = occurrences(doc, 'cat');

  test('Enter and Shift+Enter in the field go forward and back, wrapping around', async ({ page }) => {
    await openDoc(page, doc);
    await select(page, 0);
    await search(page, 'cat');
    const visited: number[][] = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Enter');
      visited.push(await selection(page));
    }
    expect(visited).toEqual([...cats, cats[0]].map((from) => [from, from + 3]));

    // Back: from the first match (after wrapping) to the last
    await page.keyboard.press('Shift+Enter');
    expect(await selection(page)).toEqual([cats[2], cats[2] + 3]);
  });

  test('Cmd+G and Shift+Cmd+G work from the text', async ({ page }) => {
    await openDoc(page, doc);
    await select(page, 0);
    await search(page, 'cat');
    await select(page, 1);
    await page.keyboard.press(`${mod}+g`);
    expect(await selection(page)).toEqual([cats[1], cats[1] + 3]);
    await page.keyboard.press(`${mod}+Shift+g`);
    expect(await selection(page)).toEqual([cats[0], cats[0] + 3]);
  });

  test('a match further down is scrolled into view, not under the panel', async ({ page }) => {
    await openDoc(page, longDoc());
    await page.locator('.cm-line', { hasText: 'Paragraph 1 ' }).first().click();
    await search(page, 'Paragraph 250 ');
    await page.keyboard.press('Enter');
    const current = page.locator('.cm-searchMatch-selected');
    await expect(current).toBeVisible();
    await frames(page);
    const box = await current.boundingBox();
    const panelBottom = await bottomOf(page, '.cm-panels-top');
    expect(box?.y).toBeGreaterThanOrEqual(panelBottom);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
  });
});

test.describe('options', () => {
  const check = (page: Page, name: 'case' | 're' | 'word') =>
    page.locator(`.cm-search input[name=${name}]`).check();

  test('the search ignores case by default and match case turns that off', async ({ page }) => {
    await openDoc(page, 'Markdown markdown MARKDOWN\n');
    await search(page, 'markdown');
    await expect(matches(page)).toHaveCount(3);
    await check(page, 'case');
    await expect(matches(page)).toHaveCount(1);
  });

  test('whole word skips matches inside longer words', async ({ page }) => {
    await openDoc(page, 'list lists listing\n');
    await search(page, 'list');
    await expect(matches(page)).toHaveCount(3);
    await check(page, 'word');
    await expect(matches(page)).toHaveCount(1);
  });

  test('regular expressions', async ({ page }) => {
    await openDoc(page, 'v1.2 and v3.4 and vx.y\n');
    await search(page, String.raw`v\d\.\d`);
    // Literal until the option is on
    await expect(matches(page)).toHaveCount(0);
    await check(page, 're');
    await expect(matches(page)).toHaveCount(2);
  });

  test('an invalid regular expression matches nothing and breaks nothing', async ({ page }) => {
    const doc = 'one (two) three\n';
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));
    await openDoc(page, doc);
    await search(page, '');
    await check(page, 're');
    await page.keyboard.type('(');
    await page.keyboard.press('Enter');
    await expect(matches(page)).toHaveCount(0);
    expect(await text(page)).toBe(doc);
    await expect(page).toHaveTitle('search-test.md — mded');
    expect(errors).toEqual([]);
  });
});

test.describe('the match counter', () => {
  const counter = (page: Page) => page.locator('.cm-search-count');
  const sevenCats = 'cat one\n\ncat two\n\ncat three\n\ncat four\n\ncat five\n\ncat six\n\ncat seven\n';

  test('says which match is selected and how many there are', async ({ page }) => {
    await openDoc(page, sevenCats);
    await select(page, 0);
    await search(page, 'cat');
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await expect(counter(page)).toHaveText('3 of 7');
    await page.keyboard.press('Shift+Enter');
    await expect(counter(page)).toHaveText('2 of 7');
  });

  test('counts the matches that are out of view', async ({ page }) => {
    const filler = Array.from({ length: 200 }, (_, i) => `filler ${i}`).join('\n\n');
    const far = Array.from({ length: 5 }, (_, i) => `needle far ${i}`).join('\n\n');
    await openDoc(page, `needle one\n\nneedle two\n\n${filler}\n\n${far}\n`);
    await select(page, 3);
    await search(page, 'needle');
    // Two in view and five far below: all seven, with no position (the caret is on none)
    await expect(matches(page)).toHaveCount(2);
    await expect(counter(page)).toHaveText('7 matches');
  });

  test('has no position once the selection leaves the match', async ({ page }) => {
    await openDoc(page, sevenCats);
    await select(page, 0);
    await search(page, 'cat');
    await page.keyboard.press('Enter');
    await expect(counter(page)).toHaveText('1 of 7');
    await page.locator('.cm-line', { hasText: 'cat four' }).click({ position: { x: 3, y: 4 } });
    await page.keyboard.press('ArrowRight');
    await expect(counter(page)).toHaveText('7 matches');
  });

  test('says when there are no matches, and says nothing without a search', async ({ page }) => {
    await openDoc(page, sevenCats);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(counter(page)).toHaveText('');
    await page.keyboard.type('zebra');
    await expect(counter(page)).toHaveText('No matches');
    await searchField(page).fill('');
    await expect(counter(page)).toHaveText('');
  });

  test('follows the options', async ({ page }) => {
    await openDoc(page, 'Cat cat CAT\n');
    await search(page, 'cat');
    await expect(counter(page)).toHaveText('3 matches');
    await page.locator('.cm-search input[name=case]').check();
    await expect(counter(page)).toHaveText('1 match');
  });

  test('is still there when the panel is opened again', async ({ page }) => {
    await openDoc(page, sevenCats);
    await select(page, 0);
    await search(page, 'cat');
    await expect(counter(page)).toHaveText('7 matches');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await select(page, 0);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(counter(page)).toHaveText('7 matches');
    await expect(counter(page)).toHaveCount(1);
  });
});

test.describe('a match on hidden text', () => {
  const doc = 'See [Example](https://example.com) now\n\nA **bold** word\n\nend';
  const linkLine = (page: Page) => page.locator('.cm-line', { hasText: 'See ' });
  const boldLine = (page: Page) => page.locator('.cm-line', { hasText: 'word' });
  const dimmed = (line: ReturnType<typeof linkLine>) => line.locator('.cm-md-mark');

  test.beforeEach(async ({ page }) => {
    await openDoc(page, doc);
    // The caret away from both lines: nothing is revealed by it
    await select(page, doc.length);
  });

  test("a link's URL shows the link with its markers dimmed, and the match highlighted", async ({ page }) => {
    await expect(linkLine(page)).toHaveText('See Example now');
    await search(page, 'example.com');
    await expect(linkLine(page)).toHaveText('See [Example](https://example.com) now');
    // The highlight of the match splits the dimmed URL in two, so compare the whole of it
    await expect
      .poll(async () => (await dimmed(linkLine(page)).allTextContents()).join(''))
      .toBe('[](https://example.com)');
    await expect(matches(page)).toHaveText(['example.com']);
    // Only that link: the bold below stays rendered
    await expect(boldLine(page)).toHaveText('A bold word');
  });

  test('a match on visible text leaves the markers hidden', async ({ page }) => {
    await search(page, 'bold');
    await expect(matches(page)).toHaveText(['bold']);
    await expect(boldLine(page)).toHaveText('A bold word');
    await expect(dimmed(boldLine(page))).toHaveCount(0);
  });

  test('a match on the markers of a bold shows both', async ({ page }) => {
    await search(page, '**');
    await expect(boldLine(page)).toHaveText('A **bold** word');
    await expect(dimmed(boldLine(page))).toHaveText(['**', '**']);
  });

  test('closing the panel renders the element again', async ({ page }) => {
    await search(page, 'example.com');
    await expect(linkLine(page)).toHaveText('See [Example](https://example.com) now');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(linkLine(page)).toHaveText('See Example now');
  });

  test('changing the search follows: the markers are hidden again when nothing hidden matches', async ({
    page,
  }) => {
    await search(page, 'example.com');
    await expect(linkLine(page)).toHaveText('See [Example](https://example.com) now');
    // Typed, not filled: the panel reads the field on key up and on change
    await searchField(page).press(`${mod}+a`);
    await page.keyboard.type('word');
    await expect(linkLine(page)).toHaveText('See Example now');
  });

  test('works while reading, and the markers go away with the panel', async ({ page }) => {
    await page.keyboard.press(`${mod}+e`);
    await expect(page).toHaveTitle('search-test.md (Reading) — mded');
    await expect(linkLine(page)).toHaveText('See Example now');
    await search(page, 'example.com');
    await expect(linkLine(page)).toHaveText('See [Example](https://example.com) now');
    await expect(matches(page)).toHaveText(['example.com']);
    await page.screenshot({ path: 'screenshots/search-reveal-reading.png' });
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect(linkLine(page)).toHaveText('See Example now');
  });
});

test.describe('replacing', () => {
  const replaceField = (page: Page) => page.locator('.cm-search input[name=replace]');
  const replaceButton = (page: Page) => page.locator('.cm-search button[name=replace]');
  const replaceAllButton = (page: Page) => page.locator('.cm-search button[name=replaceAll]');
  const counter = (page: Page) => page.locator('.cm-search-count');
  const FILE = '/search-test.md';
  const savedFile = (page: Page) =>
    page.evaluate((p) => (window as unknown as Win).__mded.platform.files.get(p), FILE);
  const DIRTY = '• search-test.md — mded';
  const CLEAN = 'search-test.md — mded';

  /**
   * Shows the replace row with the Find and Replace shortcut, which leaves the focus in its field,
   * and types into it (typed, not filled: the panel reads it on key up).
   */
  async function typeReplacement(page: Page, replacement: string) {
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(replaceField(page)).toBeFocused();
    await page.keyboard.type(replacement);
  }

  test('replace changes the current match and selects the next one', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n\nbird cat\n');
    await search(page, 'cat');
    await page.keyboard.press('Enter');
    await typeReplacement(page, 'horse');
    await replaceButton(page).click();

    expect(await text(page)).toBe('horse dog cat\n\nbird cat\n');
    expect(await selection(page)).toEqual([10, 13]);
    await expect(page).toHaveTitle(DIRTY);
  });

  test('replace all changes every match and nothing else', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n\nbird cat\n');
    await search(page, 'cat');
    await typeReplacement(page, 'horse');
    await replaceAllButton(page).click();

    expect(await text(page)).toBe('horse dog horse\n\nbird horse\n');
    await expect(page).toHaveTitle(DIRTY);
  });

  test('replace and replace all with no matches change nothing', async ({ page }) => {
    const doc = 'cat dog cat\n';
    await openDoc(page, doc);
    await search(page, 'zebra');
    await typeReplacement(page, 'horse');
    await replaceButton(page).click();
    await replaceAllButton(page).click();

    expect(await text(page)).toBe(doc);
    await expect(page).toHaveTitle(CLEAN);
  });

  test('the counter follows a replacement', async ({ page }) => {
    const sevenCats = Array.from({ length: 7 }, (_, i) => `cat ${i + 1}`).join('\n\n');
    await openDoc(page, sevenCats);
    await search(page, 'cat');
    await page.keyboard.press('Enter');
    await expect(counter(page)).toHaveText('1 of 7');
    await typeReplacement(page, 'dog');
    await replaceButton(page).click();
    // The next cat is now the first of six
    await expect(counter(page)).toHaveText('1 of 6');
  });

  test('one Undo undoes a replace all', async ({ page }) => {
    const doc = 'cat dog cat\n\nbird cat\n';
    await openDoc(page, doc);
    await search(page, 'cat');
    await typeReplacement(page, 'horse');
    await replaceAllButton(page).click();
    expect(await text(page)).not.toBe(doc);

    // Back in the text, as a user would be before pressing Cmd+Z
    await select(page, 0);
    await page.keyboard.press(`${mod}+z`);
    expect(await text(page)).toBe(doc);
    await expect(page).toHaveTitle(CLEAN);
  });

  test('a file with Windows line endings is saved with every line ending intact', async ({ page }) => {
    await openDoc(page, 'one two\r\nthree two\r\n');
    await search(page, 'two');
    await typeReplacement(page, '2');
    await replaceAllButton(page).click();
    await page.keyboard.press(`${mod}+s`);
    await expect(page).toHaveTitle(CLEAN);

    expect(await savedFile(page)).toBe('one 2\r\nthree 2\r\n');
  });

  test("a line break typed as \\n in a Windows file is written as that file's own", async ({ page }) => {
    await openDoc(page, 'one two\r\nthree two\r\n');
    await search(page, 'two');
    await typeReplacement(page, String.raw`x\ny`);
    await replaceAllButton(page).click();
    await page.keyboard.press(`${mod}+s`);
    await expect(page).toHaveTitle(CLEAN);

    expect(await savedFile(page)).toBe('one x\r\ny\r\nthree x\r\ny\r\n');
  });
});

test.describe('switching modes with the panel open', () => {
  const counter = (page: Page) => page.locator('.cm-search-count');
  // The ones that are shown: while editing they are in the panel all along, hidden until asked for
  const replaceControls = (page: Page) =>
    page
      .locator(
        '.cm-search input[name=replace], .cm-search button[name=replace], .cm-search button[name=replaceAll]',
      )
      .filter({ visible: true });
  /** Opens the panel, searches, goes to the first match and shows the replace row. */
  async function searchWithReplace(page: Page, query: string) {
    await search(page, query);
    await page.keyboard.press('Enter');
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(replaceControls(page)).toHaveCount(3);
  }

  test.beforeEach(async ({ page }) => {
    await openDoc(page, longDoc());
    // The caret at the start: the first match is then the one right there
    await select(page, 0);
  });

  test('keeps the panel, the search and the counter, and takes the replace controls away and back', async ({
    page,
  }) => {
    await searchWithReplace(page, 'Paragraph 1');
    await expect(counter(page)).toHaveText('1 of 111');

    await page.keyboard.press(`${mod}+e`);
    await expect(page).toHaveTitle('search-test.md (Reading) — mded');
    await expect(panel(page)).toHaveCount(1);
    await expect(searchField(page)).toHaveValue('Paragraph 1');
    await expect(counter(page)).toHaveText('1 of 111');
    await expect(replaceControls(page)).toHaveCount(0);
    // The text is where the user was typing or about to: in the editor, not in the panel
    await expect(page.locator('.cm-content')).toBeFocused();

    await page.keyboard.press(`${mod}+e`);
    await expect(page).toHaveTitle('search-test.md — mded');
    await expect(panel(page)).toHaveCount(1);
    await expect(searchField(page)).toHaveValue('Paragraph 1');
    await expect(counter(page)).toHaveText('1 of 111');
    await expect(replaceControls(page)).toHaveCount(3);
  });

  test('does not replace a regular expression with the text it matched', async ({ page }) => {
    const pattern = String.raw`Para\w+ 1\b`;
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await page.locator('.cm-search input[name=re]').check();
    await searchField(page).click();
    await page.keyboard.type(pattern);
    await page.keyboard.press('Enter');
    await expect(counter(page)).toHaveText(/^1 of \d+$/);
    // The selection is now the text "Paragraph 1": what a rebuilt panel would offer instead
    expect(await selection(page)).toEqual([0, 11]);

    await page.keyboard.press(`${mod}+e`);
    await expect(searchField(page)).toHaveValue(pattern);
    await expect(page.locator('.cm-search input[name=re]')).toBeChecked();
    await page.keyboard.press(`${mod}+e`);
    await expect(searchField(page)).toHaveValue(pattern);
    await expect(page.locator('.cm-search input[name=re]')).toBeChecked();
  });

  for (const direction of ['into Reading Mode', 'back to editing'] as const) {
    test(`keeps every line where it was, ${direction}`, async ({ page }) => {
      await searchWithReplace(page, 'Paragraph 1');
      if (direction === 'back to editing') {
        await page.keyboard.press(`${mod}+e`);
        await expect(replaceControls(page)).toHaveCount(0);
      }
      await scrollTo(page, 2400);
      await frames(page);
      const line = await visibleLine(page);
      expect(line).not.toBe('');
      const before = await topOf(page, line);

      await page.keyboard.press(`${mod}+e`);
      await expect(replaceControls(page)).toHaveCount(direction === 'into Reading Mode' ? 0 : 3);
      await frames(page);
      expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1.5);
    });
  }
});

test.describe('searching while reading', () => {
  const doc = 'cat dog cat\n\nend\n';
  const READING = 'search-test.md (Reading) — mded';
  const replaceControls = (page: Page) =>
    page.locator(
      '.cm-search input[name=replace], .cm-search button[name=replace], .cm-search button[name=replaceAll]',
    );
  const notice = (page: Page) => page.getByRole('status');

  test.beforeEach(async ({ page }) => {
    await openDoc(page, doc);
    await select(page, 0);
    await page.keyboard.press(`${mod}+e`);
    await expect(page).toHaveTitle(READING);
  });

  test('finds, highlights and selects, without changing the text or showing the notice', async ({ page }) => {
    await search(page, 'cat');
    await expect(matches(page)).toHaveCount(2);
    await page.keyboard.press('Enter');
    await expect(page.locator('.cm-searchMatch-selected')).toHaveCount(1);
    expect(await selection(page)).toEqual([0, 3]);
    await page.keyboard.press('Enter');
    expect(await selection(page)).toEqual([8, 11]);

    expect(await text(page)).toBe(doc);
    await expect(page).toHaveTitle(READING);
    // The notice that tells how to edit is for trying to edit: searching is reading
    await expect(notice(page)).toBeHidden();
  });

  test('Cmd+G steps from the text', async ({ page }) => {
    await search(page, 'cat');
    await select(page, 1);
    await page.keyboard.press(`${mod}+g`);
    expect(await selection(page)).toEqual([8, 11]);
    await expect(notice(page)).toBeHidden();
  });

  test('has no replace field or replace buttons', async ({ page }) => {
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(searchField(page)).toBeVisible();
    await expect(page.locator('.cm-search input[name=case]')).toBeVisible();
    await expect(replaceControls(page)).toHaveCount(0);
  });

  test('Find and Replace does not open anything', async ({ page }) => {
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(panel(page)).toHaveCount(0);
    expect(await text(page)).toBe(doc);
  });
});

test.describe('matches inside styled text', () => {
  test('a match inside inline code is highlighted and does not break the code apart', async ({ page }) => {
    const doc = 'de `00-vision-sistema-agentes-sdlc.md` aqui\n\nend\n';
    await openDoc(page, doc);
    await select(page, doc.length - 1);
    const code = page.locator('.cm-md-code');
    await expect(code).toHaveCount(1);
    const widthBefore = await code.evaluate((el) => el.getBoundingClientRect().width);

    await search(page, 'si');
    await expect(matches(page)).toHaveText(['si', 'si']);
    // Still one piece of code, as wide as before: the highlight is inside it, not cutting it up
    await expect(code).toHaveCount(1);
    const width = await code.evaluate((el) => el.getBoundingClientRect().width);
    expect(Math.abs(width - widthBefore)).toBeLessThan(1);
    // And the highlight shows: nothing with a background of its own sits on top of the match
    const covered = await matches(page)
      .first()
      .evaluate((el) =>
        [...el.querySelectorAll('*')].some((c) => getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)'),
      );
    expect(covered).toBe(false);
    await page.screenshot({ path: 'screenshots/search-in-inline-code.png' });
  });
});

test.describe('the replace row is shown on request', () => {
  const replaceControls = (page: Page) =>
    page
      .locator(
        '.cm-search input[name=replace], .cm-search button[name=replace], .cm-search button[name=replaceAll]',
      )
      .filter({ visible: true });
  const toggle = (page: Page) => page.locator('.cm-search button[name=toggle-replace]');
  const replaceField = (page: Page) => page.locator('.cm-search input[name=replace]');

  test('Cmd+F opens the panel to search only', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(replaceControls(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await page.screenshot({ path: 'screenshots/search-panel-find-only.png' });
  });

  test('the arrow at the left shows and hides it, without taking the focus', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await search(page, 'cat');
    await toggle(page).click();
    await expect(replaceControls(page)).toHaveCount(3);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(searchField(page)).toBeFocused();
    await expect(searchField(page)).toHaveValue('cat');

    await toggle(page).click();
    await expect(replaceControls(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(searchField(page)).toBeFocused();
  });

  test('hiding it while typing in the replace field moves the focus to the search field', async ({
    page,
  }) => {
    await openDoc(page, 'cat dog cat\n');
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(replaceField(page)).toBeFocused();
    await toggle(page).click();
    await expect(replaceControls(page)).toHaveCount(0);
    await expect(searchField(page)).toBeFocused();
  });

  test('the fields of both rows line up', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await page.keyboard.press(`${mod}+Alt+f`);
    const left = (name: string) =>
      page.locator(`.cm-search input[name=${name}]`).evaluate((el) => el.getBoundingClientRect().left);
    expect(await left('replace')).toBe(await left('search'));
    await page.screenshot({ path: 'screenshots/search-panel-replace.png' });
  });

  test('Cmd+F on an open panel leaves the row as it is, and opening the panel again starts without it', async ({
    page,
  }) => {
    await openDoc(page, 'cat dog cat\n');
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(replaceControls(page)).toHaveCount(3);
    await page.keyboard.press(`${mod}+f`);
    await expect(searchField(page)).toBeFocused();
    await expect(replaceControls(page)).toHaveCount(3);

    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await expect(replaceControls(page)).toHaveCount(0);
  });

  test('it comes back after a visit to Reading Mode, which has no arrow', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await page.keyboard.press(`${mod}+Alt+f`);
    await expect(replaceControls(page)).toHaveCount(3);
    await page.keyboard.press(`${mod}+e`);
    await expect(page).toHaveTitle('search-test.md (Reading) — mded');
    await expect(panel(page)).toHaveCount(1);
    await expect(replaceControls(page)).toHaveCount(0);
    await expect(toggle(page)).toHaveCount(0);

    await page.keyboard.press(`${mod}+e`);
    await expect(replaceControls(page)).toHaveCount(3);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('showing and hiding it halfway down leaves every line where it was', async ({ page }) => {
    await openDoc(page, longDoc());
    await select(page, 0);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    await scrollTo(page, 2400);
    await frames(page);
    const line = await visibleLine(page);
    const before = await topOf(page, line);

    await toggle(page).click();
    await expect(replaceControls(page)).toHaveCount(3);
    await frames(page);
    expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1.5);

    await toggle(page).click();
    await expect(replaceControls(page)).toHaveCount(0);
    await frames(page);
    expect(Math.abs((await topOf(page, line)) - before)).toBeLessThan(1.5);
  });
});

test.describe('the look of the controls', () => {
  test('previous and next are arrows, in that order, and keep their names', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await select(page, 0);
    await search(page, 'cat');
    const previous = page.locator('.cm-search button[name=prev]');
    const next = page.locator('.cm-search button[name=next]');
    const arrow = (button: typeof next) =>
      button.evaluate((el) => getComputedStyle(el, '::before').content.replace(/"/g, ''));
    expect(await arrow(previous)).toBe('↑');
    expect(await arrow(next)).toBe('↓');
    // What a screen reader says is words, not the arrow
    await expect(previous).toHaveAccessibleName('Previous match');
    await expect(next).toHaveAccessibleName('Next match');
    const [previousLeft, nextLeft] = await Promise.all(
      [previous, next].map((b) => b.evaluate((el) => el.getBoundingClientRect().left)),
    );
    expect(previousLeft).toBeLessThan(nextLeft);

    // And they still step
    await next.click();
    expect(await selection(page)).toEqual([0, 3]);
    await next.click();
    expect(await selection(page)).toEqual([8, 11]);
    await previous.click();
    expect(await selection(page)).toEqual([0, 3]);
  });

  test('the counter sits right after the search field and keeps its room when empty', async ({ page }) => {
    await openDoc(page, 'cat dog cat\n');
    await select(page, 0);
    await page.keyboard.press(`${mod}+f`);
    await expect(panel(page)).toBeVisible();
    const counter = page.locator('.cm-search-count');
    await expect(counter).toHaveText('');
    const left = (selector: string) =>
      page.locator(selector).evaluate((el) => el.getBoundingClientRect().left);
    const buttonBefore = await left('.cm-search button[name=prev]');

    await page.keyboard.type('cat');
    await expect(counter).toHaveText('2 matches');
    await page.keyboard.press('Enter');
    await expect(counter).toHaveText('1 of 2');
    // The buttons after it did not move
    expect(await left('.cm-search button[name=prev]')).toBe(buttonBefore);
    // It comes right after the field, before the buttons
    const after = await page.evaluate(() => {
      const field = document.querySelector('.cm-search input[name=search]') as Element;
      return (field.nextElementSibling as Element).className;
    });
    expect(after).toBe('cm-search-count');
    expect(await left('.cm-search-count')).toBeLessThan(buttonBefore);
  });
});
