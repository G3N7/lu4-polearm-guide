// The Kit Ledger page (src/costs/index.html): a second, unversioned page of the site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load, ROOT } from '../scripts/guide.mjs';
import { assertValidHtml } from './helpers.mjs';

const FILE = path.join(ROOT, 'src', 'costs', 'index.html');
const html = fs.readFileSync(FILE, 'utf8');
const $ = load(html);

test('head: lang, charset, viewport, one title, description', () => {
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('head > meta[charset]').attr('charset'), 'utf-8');
  assert.match($('head > meta[name="viewport"]').attr('content'), /width=device-width/);
  assert.equal($('title').length, 1);
  assert.match($('title').text(), /Kit Ledger/);
  assert.ok($('head > meta[name="description"]').attr('content').length > 40);
});

test('is valid HTML under the repo lint rules', async () => {
  await assertValidHtml(FILE, assert);
});

test('links back to the guide and to the repository; no root-relative URLs', () => {
  assert.ok($('nav.toc a[href="../"]').length >= 1, 'nav back-link');
  assert.ok($('footer a[href="../"]').length >= 1, 'footer back-link');
  assert.ok($('footer a[href="https://github.com/G3N7/lu4-polearm-guide"]').length >= 1);
  assert.equal($('[href^="/"], [src^="/"]').length, 0);
});

test('every in-page anchor resolves and every other link is https or the guide', () => {
  const ids = new Set($('[id]').map((_, el) => $(el).attr('id')).get());
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (href.startsWith('#')) assert.ok(ids.has(href.slice(1)), `broken anchor ${href}`);
    else if (href === '../') return;
    else assert.equal(new URL(href).protocol, 'https:', href);
  });
  $('link[rel="stylesheet"], link[rel="preconnect"]').each((_, l) => assert.match($(l).attr('href'), /^https:\/\/fonts\.googleapis\.com(\/|$)/));
});

test('every table has a header and consistent column counts; grade chips use known grades', () => {
  const tables = $('table');
  assert.ok(tables.length >= 5);
  tables.each((ti, t) => {
    const heads = $(t).find('> thead > tr > th').length;
    assert.ok(heads >= 3, `table ${ti} header`);
    $(t).find('> tbody > tr').each((ri, tr) => {
      assert.equal($(tr).children('td').length, heads, `table ${ti} row ${ri}`);
    });
    assert.ok($(t).closest('.tablewrap').length, `table ${ti} scrolls sideways on phones`);
  });
  $('.grade').each((_, g) => {
    const kinds = ($(g).attr('class') || '').split(/\s+/).filter((c) => c !== 'grade');
    assert.deepEqual(kinds.length, 1);
    assert.ok(['d', 'c', 'b', 'a', 's', 'n'].includes(kinds[0]), kinds[0]);
  });
});

test('the grade ladder in the guide matches the ledger (grade rows and headline totals)', () => {
  const guide = load(fs.readFileSync(path.join(ROOT, 'src', 'index.html'), 'utf8'));
  const cells = ($$, tr) => $$(tr).find('td').toArray().map((td) => $$(td).text().trim());
  const ledgerRows = $('#ladder table tbody tr').toArray().map((tr) => cells($, tr));
  const costTable = guide('#gear table.rt').toArray().find((t) => guide(t).find('th').first().text() === 'Grade' && guide(t).find('th').eq(2).text() === 'Adena');
  assert.ok(costTable, 'the guide has a Grade/Kit/Adena table in §6');
  const guideRows = guide(costTable).find('tbody tr').toArray().map((tr) => cells(guide, tr));
  assert.equal(guideRows.length, ledgerRows.length, 'same number of grade rows');
  ledgerRows.forEach((row, i) => {
    assert.equal(guideRows[i][0].replace(/\s*\(.*\)$/, ''), row[0], `row ${i} grade`);
    assert.equal(guideRows[i][2].replace('—', '–'), row[2], `row ${i} adena`);
    assert.equal(guideRows[i][3].replace('—', '–'), row[3], `row ${i} MC`);
    assert.equal(guideRows[i][4].replace('—', '–'), row[4], `row ${i} USD`);
  });
});
