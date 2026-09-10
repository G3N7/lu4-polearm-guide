// Browser tests for the built site served under /lu4-polearm-guide/: the page's own JS
// (TOC, search, expand/collapse, hash navigation, back-to-top), responsive layout, the
// Kit Ledger page, and the version archive. Fixtures are derived from the page itself so
// ordinary content edits do not break them.
import { test, expect } from '@playwright/test';
import { BASE_PATH } from '../playwright.config.mjs';

const details = (page, id) => page.locator(`#${id} > details`);

let pageErrors;
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  // The ledger page pulls web fonts; keep the tests offline and deterministic.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
});
test.afterEach(() => {
  const real = pageErrors.filter((e) => !/fonts\.(googleapis|gstatic)\.com|net::ERR_FAILED/.test(e));
  expect(real, 'no page or console errors').toEqual([]);
});

/** Which sections the author opened by default, read from the served HTML itself. */
async function authoredOpenState(request) {
  const src = await (await request.get('./')).text();
  const out = {};
  for (const m of src.matchAll(/<section class="block" id="([\w-]+)">\s*<details( open)?>/g)) out[m[1]] = !!m[2];
  return out;
}

test('loads under the Pages base path with the right title and the authored open/closed state', async ({ page, request }) => {
  await page.goto('./');
  await expect(page).toHaveURL(new RegExp(`${BASE_PATH}$`));
  await expect(page).toHaveTitle('LU4 Polearm Guide');
  await expect(page.locator('h1')).toHaveText('LU4 Polearm Guide');
  const authored = await authoredOpenState(request);
  const ids = Object.keys(authored);
  expect(ids.length).toBeGreaterThan(3);
  expect(ids.some((id) => authored[id])).toBe(true);
  expect(ids.some((id) => !authored[id])).toBe(true);
  for (const id of ids) await expect(details(page, id), id).toHaveJSProperty('open', authored[id]);
});

test('the header shows the version and date that the changelog declares', async ({ page }) => {
  await page.goto('./');
  const chip = await page.locator('header.site .meta .version').innerText();
  // The changelog section is collapsed by default, so read the text node rather than innerText.
  const first = await page.locator('#changelog ul li b').first().evaluate((b) => b.textContent);
  expect(first.endsWith(' ' + chip)).toBe(true); // "YYYY-MM-DD vN" ends with the chip "vN"
  await expect(page.locator('footer')).toContainText(chip + ' · ');
});

test('expand all / collapse all toggle every section', async ({ page, request }) => {
  await page.goto('./');
  const ids = Object.keys(await authoredOpenState(request));
  await page.getByRole('button', { name: 'Expand all' }).click();
  for (const id of ids) await expect(details(page, id), id).toHaveJSProperty('open', true);
  await page.getByRole('button', { name: 'Collapse all' }).click();
  for (const id of ids) await expect(details(page, id), id).toHaveJSProperty('open', false);
});

test('a URL hash opens its section on load', async ({ page, request }) => {
  const authored = await authoredOpenState(request);
  const closed = Object.keys(authored).find((id) => !authored[id]);
  await page.goto(`./#${closed}`);
  await expect(details(page, closed)).toHaveJSProperty('open', true);
});

test('clicking a TOC chip opens the section and marks the chip active', async ({ page, request }) => {
  const authored = await authoredOpenState(request);
  const closed = Object.keys(authored).filter((id) => !authored[id]).pop();
  await page.goto('./');
  await page.locator(`nav.toc a[href="#${closed}"]`).click();
  await expect(details(page, closed)).toHaveJSProperty('open', true);
  await expect(page).toHaveURL(new RegExp(`#${closed}$`));
  await expect(page.locator(`nav.toc a[href="#${closed}"]`)).toHaveClass(/active/);
});

test('scrolling highlights the section in view in the TOC', async ({ page, request }) => {
  const authored = await authoredOpenState(request);
  const target = Object.keys(authored).filter((id) => authored[id]).pop(); // last open section
  await page.goto('./');
  await page.evaluate((id) => document.getElementById(id).scrollIntoView({ block: 'start', behavior: 'instant' }), target);
  await expect(page.locator(`nav.toc a[href="#${target}"]`)).toHaveClass(/active/);
  await expect(page.locator('nav.toc a.active')).toHaveCount(1);
});

test('search opens matching sections and highlights matches; clearing restores the page', async ({ page }) => {
  await page.goto('./');
  // A word that appears in at least two sections, taken from the page itself.
  const word = await page.evaluate(() => {
    const bodies = [...document.querySelectorAll('section.block .body')].map((b) => b.textContent.toLowerCase());
    const words = new Set(bodies[0].match(/\b[a-z]{7,}\b/g));
    return [...words].find((w) => bodies.filter((t) => t.includes(w)).length >= 2);
  });
  expect(word).toBeTruthy();
  const original = await page.locator('section.block .body').first().innerHTML();
  await page.getByLabel('Search').fill(word);
  await expect(page.locator('mark').first()).toBeVisible();
  const marks = page.locator('mark');
  expect(await marks.count()).toBeGreaterThan(1);
  for (const t of await marks.allTextContents()) expect(t.toLowerCase()).toBe(word);
  const openWithMarks = await page.evaluate(() => [...document.querySelectorAll('mark')].map((m) => m.closest('section.block').querySelector('details').open));
  expect(openWithMarks.every(Boolean)).toBe(true);
  await page.getByLabel('Search').fill('');
  await expect(marks).toHaveCount(0);
  expect(await page.locator('section.block .body').first().innerHTML()).toBe(original);
});

test('search is case-insensitive and ignores one-character queries', async ({ page }) => {
  await page.goto('./');
  const word = await page.evaluate(() => document.querySelector('section.block .body').textContent.match(/\b[A-Za-z]{6,}\b/)[0]);
  await page.getByLabel('Search').fill(word.toUpperCase());
  await expect(page.locator('mark').first()).toBeVisible();
  await page.getByLabel('Search').fill(word[0]);
  await expect(page.locator('mark')).toHaveCount(0);
});

test('search treats regex metacharacters literally', async ({ page }) => {
  await page.goto('./');
  // A short real snippet containing a regex metacharacter, sampled from a text node.
  const sample = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) {
      const m = /[A-Za-z0-9]{2,}[+().*?[\]][A-Za-z0-9 ]{1,6}/.exec(n.nodeValue);
      if (m) return m[0];
    }
    return null;
  });
  expect(sample).toBeTruthy();
  const search = page.getByLabel('Search');
  await search.fill(sample);
  await expect(page.locator('mark').first()).toHaveText(sample);
  await search.fill('[[');
  await expect(page.locator('mark')).toHaveCount(0);
});

test('search finds Cyrillic glossary terms', async ({ page }) => {
  await page.goto('./');
  const term = await page.evaluate(() => {
    for (const dt of document.querySelectorAll('#glossary dt')) {
      const m = /[Ѐ-ӿ]{4,}/.exec(dt.textContent);
      if (m) return m[0];
    }
    return null;
  });
  expect(term).toBeTruthy();
  await page.getByLabel('Search').fill(term);
  await expect(page.locator('#glossary mark').first()).toBeVisible();
  await expect(details(page, 'glossary')).toHaveJSProperty('open', true);
});

test('back-to-top appears after scrolling and returns to the top', async ({ page }) => {
  await page.goto('./');
  const top = page.locator('#top');
  await expect(top).toBeHidden();
  await page.evaluate(() => window.scrollTo({ top: 1500, behavior: 'instant' }));
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});

test('every skill link points at a lu4lab skill page', async ({ page }) => {
  await page.goto('./');
  const hrefs = await page.locator('a.sk').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(0);
  for (const h of hrefs) expect(h).toMatch(/^https:\/\/guide\.lu4lab\.com\/classes\/skill\/\d+-[a-z0-9-]+\/\d+$/);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test('does not scroll sideways and stacks tables into label/value rows', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Expand all' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
    await expect(page.locator('table.rt thead').first()).toBeHidden();
    const firstCell = page.locator('table.rt tbody td[data-l]').first();
    const label = await firstCell.evaluate((td) => getComputedStyle(td, '::before').content);
    expect(label).toContain(await firstCell.getAttribute('data-l'));
    const cols = await page.locator('.two').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(1);
  });

  test('an archived copy keeps its "archived" chip in the sticky TOC while scrolling', async ({ page, request }) => {
    const json = await (await request.get('./versions.json')).json();
    await page.goto(`./v/${json.current}/`);
    await expect(page.locator('.archived-banner')).toBeVisible();
    await page.getByRole('button', { name: 'Expand all' }).click();
    await page.evaluate(() => window.scrollTo({ top: 3000, behavior: 'instant' }));
    await expect(page.locator('.archived-banner')).not.toBeInViewport();
    await expect(page.locator('nav.toc a.archived-chip')).toBeInViewport();
  });
});

test.describe('desktop layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('shows table headers and two columns', async ({ page }) => {
    await page.goto('./');
    await expect(page.locator('table.rt thead').first()).toBeVisible();
    const cols = await page.locator('.two').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
  });
});

test.describe('Kit Ledger page', () => {
  test('is reachable from the gear section and links back', async ({ page }) => {
    await page.goto('./#gear');
    await page.locator('#gear a[href="costs/"]').click();
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}costs/$`));
    await expect(page).toHaveTitle(/Kit Ledger/);
    await expect(page.locator('h1')).toHaveText('Lu4 Polearm Kit Ledger');
    await expect(page.locator('#ladder table tbody tr')).not.toHaveCount(0);
    await page.locator('nav.toc a.back').click();
    await expect(page).toHaveTitle('LU4 Polearm Guide');
  });

  test('in-page anchors work and the page fits a phone without body overflow', async ({ page }) => {
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto('./costs/#b');
    await expect(page.locator('#b h2')).toBeInViewport();
    const bodyOverflow = await page.evaluate(() => document.body.scrollWidth - window.innerWidth);
    expect(bodyOverflow).toBeLessThanOrEqual(0);
  });
});

test.describe('version archive', () => {
  test('versions.json describes the current version', async ({ request }) => {
    const res = await request.get('./versions.json');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.versions[0].version).toBe(json.current);
    expect(json.versions[0].archived).toBe(true);
    expect(json.versions.filter((v) => v.current)).toHaveLength(1);
  });

  test('the archive index links every archived version and back to the latest', async ({ page, request }) => {
    const json = await (await request.get('./versions.json')).json();
    await page.goto('./v/');
    await expect(page).toHaveTitle(/versions/);
    for (const v of json.versions) {
      await expect(page.locator(`a[href="${v.version}/"]`)).toHaveCount(v.archived ? 1 : 0);
    }
    await page.locator('a[href="../"]').first().click();
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}$`));
    await expect(page).toHaveTitle('LU4 Polearm Guide');
  });

  test('an archived copy shows the banner, keeps its JS working and links back to the latest', async ({ page, request }) => {
    const json = await (await request.get('./versions.json')).json();
    await page.goto(`./v/${json.current}/`);
    await expect(page).toHaveTitle(`v${json.current} · LU4 Polearm Guide`);
    const banner = page.locator('.archived-banner');
    await expect(banner).toBeVisible();
    const word = await page.evaluate(() => document.querySelector('section.block .body').textContent.match(/\b[A-Za-z]{6,}\b/)[0]);
    await page.getByLabel('Search').fill(word);
    await expect(page.locator('mark').first()).toBeVisible();
    await expect(page.locator('footer a', { hasText: 'all versions' })).toHaveAttribute('href', '../../v/');
    await page.locator('footer a', { hasText: 'all versions' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}v/$`));
    await page.goBack();
    await banner.getByRole('link', { name: 'Read the latest version' }).click();
    await expect(page).toHaveURL(new RegExp(`${BASE_PATH}$`));
  });

  test('unknown paths get the 404 page whose links lead back into the site', async ({ page }) => {
    const res = await page.goto('./does-not-exist/');
    expect(res.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
    await page.getByRole('link', { name: 'Open the guide' }).click();
    await expect(page).toHaveTitle('LU4 Polearm Guide');
    // The browser logs the deliberate 404 document response as a console error; that one is expected.
    pageErrors = pageErrors.filter((e) => !/status of 404/.test(e));
  });
});
