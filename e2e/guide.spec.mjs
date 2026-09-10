// Browser tests for the built site: the page's own JS (TOC, search, expand/collapse,
// hash navigation, back-to-top), responsive layout, and the version archive.
import { test, expect } from '@playwright/test';

const OPEN_BY_DEFAULT = ['overview', 'classes', 'leveling', 'party'];
const CLOSED_BY_DEFAULT = ['tiers', 'quests', 'gear', 'glossary', 'changelog'];
const details = (page, id) => page.locator(`#${id} > details`);

let pageErrors;
test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
});
test.afterEach(() => {
  expect(pageErrors, 'no page or console errors').toEqual([]);
});

test('loads with the right title and default open sections', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('LU4 Polearm Guide');
  await expect(page.locator('h1')).toHaveText('LU4 Polearm Guide');
  for (const id of OPEN_BY_DEFAULT) await expect(details(page, id), id).toHaveJSProperty('open', true);
  for (const id of CLOSED_BY_DEFAULT) await expect(details(page, id), id).toHaveJSProperty('open', false);
});

test('expand all / collapse all toggle every section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Expand all' }).click();
  for (const id of [...OPEN_BY_DEFAULT, ...CLOSED_BY_DEFAULT]) await expect(details(page, id), id).toHaveJSProperty('open', true);
  await page.getByRole('button', { name: 'Collapse all' }).click();
  for (const id of [...OPEN_BY_DEFAULT, ...CLOSED_BY_DEFAULT]) await expect(details(page, id), id).toHaveJSProperty('open', false);
});

test('a URL hash opens its section on load', async ({ page }) => {
  await page.goto('/#gear');
  await expect(details(page, 'gear')).toHaveJSProperty('open', true);
  await expect(details(page, 'tiers')).toHaveJSProperty('open', false);
});

test('clicking a TOC chip opens the section and marks the chip active', async ({ page }) => {
  await page.goto('/');
  await page.locator('nav.toc a[href="#glossary"]').click();
  await expect(details(page, 'glossary')).toHaveJSProperty('open', true);
  await expect(page).toHaveURL(/#glossary$/);
  await expect(page.locator('nav.toc a[href="#glossary"]')).toHaveClass(/active/);
});

test('scrolling highlights the section in view in the TOC', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.getElementById('party').scrollIntoView({ block: 'start' }));
  await expect(page.locator('nav.toc a[href="#party"]')).toHaveClass(/active/);
  await expect(page.locator('nav.toc a.active')).toHaveCount(1);
});

test('search opens matching sections and highlights matches; clearing restores the page', async ({ page }) => {
  await page.goto('/');
  const original = await page.locator('#classes .body').innerHTML();
  await page.getByLabel('Search').fill('Provoke');
  await expect(page.locator('mark').first()).toBeVisible();
  const marks = page.locator('mark');
  expect(await marks.count()).toBeGreaterThan(3);
  for (const t of await marks.allTextContents()) expect(t.toLowerCase()).toBe('provoke');
  await expect(details(page, 'classes')).toHaveJSProperty('open', true);
  await expect(details(page, 'party')).toHaveJSProperty('open', true);
  await page.getByLabel('Search').fill('');
  await expect(marks).toHaveCount(0);
  expect(await page.locator('#classes .body').innerHTML()).toBe(original);
});

test('search is case-insensitive and ignores one-character queries', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search').fill('fATIGUE');
  await expect(page.locator('mark').first()).toBeVisible();
  await page.getByLabel('Search').fill('f');
  await expect(page.locator('mark')).toHaveCount(0);
});

test('search treats regex metacharacters literally', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('Search');
  await search.fill('+5 per stat');
  await expect(page.locator('mark').first()).toBeVisible();
  await expect(page.locator('mark').first()).toHaveText('+5 per stat');
  await search.fill('(rep.)');
  await expect(page.locator('mark').first()).toHaveText('(rep.)');
  await search.fill('[[');
  await expect(page.locator('mark')).toHaveCount(0);
});

test('search finds Cyrillic glossary terms', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Search').fill('Усталость');
  await expect(page.locator('#glossary mark').first()).toBeVisible();
  await expect(details(page, 'glossary')).toHaveJSProperty('open', true);
});

test('back-to-top appears after scrolling and returns to the top', async ({ page }) => {
  await page.goto('/');
  const top = page.locator('#top');
  await expect(top).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 1500));
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});

test('every skill link opens a lu4lab skill page (href shape)', async ({ page }) => {
  await page.goto('/');
  const hrefs = await page.locator('a.sk').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  expect(hrefs.length).toBeGreaterThan(40);
  for (const h of hrefs) expect(h).toMatch(/^https:\/\/guide\.lu4lab\.com\/classes\/skill\/\d+-[a-z0-9-]+\/\d+$/);
});

test.describe('phone layout', () => {
  test.use({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });

  test('does not scroll sideways and stacks tables into label/value rows', async ({ page }) => {
    await page.goto('/');
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
});

test.describe('desktop layout', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('shows table headers and two columns', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('table.rt thead').first()).toBeVisible();
    const cols = await page.locator('.two').first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
    await expect(page.locator('.cards, .comp').first()).toBeVisible();
  });
});

test.describe('version archive', () => {
  test('versions.json describes the current version', async ({ request }) => {
    const res = await request.get('/versions.json');
    expect(res.ok()).toBe(true);
    const json = await res.json();
    expect(json.current).toBeGreaterThanOrEqual(9);
    expect(json.versions[0].version).toBe(json.current);
    expect(json.versions[0].archived).toBe(true);
  });

  test('the archive index links every archived version and back to the latest', async ({ page, request }) => {
    const json = await (await request.get('/versions.json')).json();
    await page.goto('/v/');
    await expect(page).toHaveTitle(/versions/);
    for (const v of json.versions) {
      const link = page.locator(`a[href="${v.version}/"]`);
      await expect(link).toHaveCount(v.archived ? 1 : 0);
    }
    await page.locator('a[href="../"]').first().click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page).toHaveTitle('LU4 Polearm Guide');
  });

  test('an archived copy shows the banner, keeps its JS working and links back', async ({ page, request }) => {
    const json = await (await request.get('/versions.json')).json();
    await page.goto(`/v/${json.current}/`);
    await expect(page).toHaveTitle(`v${json.current} · LU4 Polearm Guide`);
    const banner = page.locator('.archived-banner');
    await expect(banner).toBeVisible();
    await page.getByLabel('Search').fill('Provoke');
    await expect(page.locator('mark').first()).toBeVisible();
    await expect(page.locator('footer a', { hasText: 'all versions' })).toHaveAttribute('href', '../../v/');
    await banner.getByRole('link', { name: 'Read the latest version' }).click();
    await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  });

  test('unknown paths get the 404 page with a way back', async ({ page }) => {
    const res = await page.goto('/does-not-exist/');
    expect(res.status()).toBe(404);
    await expect(page.locator('h1')).toHaveText('Page not found');
    await expect(page.locator('a[href="/lu4-polearm-guide/"]')).toBeVisible();
    // The browser logs the deliberate 404 document response as a console error; that one is expected.
    pageErrors = pageErrors.filter((e) => !/status of 404/.test(e));
    expect(pageErrors).toEqual([]);
  });
});
