// Structural invariants of src/index.html that the CSS and JS rely on. These test shape,
// not prose, so ordinary content edits do not break them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, $ } from './helpers.mjs';
import { sections, extractLinks, isExternal } from '../scripts/guide.mjs';

const TAG_KINDS = new Set(['fact', 'consensus', 'opinion', 'retail', 'na', 'stale']);
const SITE_LINK = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/$/; // "v/", "costs/": a page in this site

test('document head: lang, charset, viewport, title, description, icon', () => {
  assert.equal($('html').attr('lang'), 'en');
  assert.equal($('head > meta[charset]').attr('charset'), 'utf-8');
  assert.match($('head > meta[name="viewport"]').attr('content'), /width=device-width/);
  assert.equal($('head > title').length, 1);
  assert.equal($('head > title').text(), 'LU4 Polearm Guide');
  assert.ok($('head > meta[name="description"]').attr('content').length > 40);
  assert.match($('head > link[rel="icon"]').attr('href'), /^data:image\/svg\+xml/);
  assert.equal($('title').length, 1, 'title must only appear once (in head)');
});

test('page is self-contained: no external scripts, stylesheets, or root-relative URLs', () => {
  assert.equal($('script[src]').length, 0);
  assert.equal($('link[rel="stylesheet"]').length, 0);
  assert.equal($('head > style').length, 1);
  assert.equal($('body script').length, 1);
  const rootRelative = $('[href^="/"], [src^="/"]');
  assert.equal(rootRelative.length, 0, 'root-relative URLs break under the /lu4-polearm-guide/ base path');
});

test('exactly one h1 and the header chips the tests parse', () => {
  assert.equal($('h1').length, 1);
  assert.equal($('header.site h1').text(), 'LU4 Polearm Guide');
  assert.equal($('header.site .meta .updated').length, 1);
  assert.equal($('header.site .meta .version').length, 1);
});

test('sections are numbered 1..n in order, each a collapsible block with summary, h2 and body', () => {
  const secs = sections(html);
  assert.ok(secs.length > 0);
  secs.forEach((s, i) => {
    assert.ok(s.id, `section ${i + 1} has an id`);
    assert.equal(s.num, String(i + 1), `section #${s.id} number`);
    assert.ok(s.title.length > 3, `section #${s.id} has an h2 title`);
  });
  $('main > section.block').each((_, s) => {
    const id = $(s).attr('id');
    assert.equal($(s).children('details').length, 1, `#${id} details`);
    assert.equal($(s).find('> details > summary').length, 1, `#${id} summary`);
    assert.equal($(s).find('> details > summary > .num').length, 1, `#${id} .num`);
    assert.equal($(s).find('> details > summary > h2').length, 1, `#${id} h2`);
    assert.equal($(s).find('> details > .body').length, 1, `#${id} .body`);
  });
  assert.ok(secs.some((s) => s.id === 'changelog'), 'the changelog section exists (versioning depends on it)');
});

test('the TOC mirrors the sections in order', () => {
  const links = $('nav.toc a');
  const secs = sections(html);
  assert.equal(links.length, secs.length);
  links.each((i, a) => {
    assert.equal($(a).attr('href'), `#${secs[i].id}`);
    assert.match($(a).text().trim(), new RegExp(`^${i + 1} `), `TOC label ${i + 1} starts with its number`);
  });
});

test('all ids are unique', () => {
  const ids = $('[id]').map((_, el) => $(el).attr('id')).get();
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, []);
});

test('every in-page anchor points at an existing id', () => {
  const ids = new Set($('[id]').map((_, el) => $(el).attr('id')).get());
  const broken = extractLinks(html)
    .filter((l) => l.href.startsWith('#'))
    .filter((l) => !ids.has(l.href.slice(1)));
  assert.deepEqual(broken, []);
});

test('every link is a fragment, a page of this site, or a valid https URL', () => {
  const links = extractLinks(html);
  assert.ok(links.length > 0);
  for (const l of links) {
    assert.ok(l.href.length > 0, `empty href near "${l.text}"`);
    if (l.href.startsWith('#') || SITE_LINK.test(l.href)) continue;
    assert.ok(isExternal(l.href), `unexpected href: ${l.href}`);
    const u = new URL(l.href);
    assert.equal(u.protocol, 'https:', `insecure link: ${l.href}`);
    assert.ok(!/\s/.test(l.href), `whitespace in href: ${l.href}`);
  }
});

test('href attributes in the source have no unencoded ampersands', () => {
  // cheerio decodes entities, so check the raw source: "&" must be "&amp;" or a named/numeric entity.
  const bad = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]).filter((h) => /&(?!amp;|#\d+;|#x[0-9a-f]+;|[a-z]+;)/i.test(h));
  assert.deepEqual(bad, []);
});

test('skill links all point at lu4lab skill pages', () => {
  const sk = $('a.sk');
  assert.ok(sk.length > 0);
  sk.each((_, a) => {
    assert.match($(a).attr('href'), /^https:\/\/guide\.lu4lab\.com\/classes\/skill\/\d+-[a-z0-9-]+\/\d+$/, $(a).text());
    assert.ok($(a).text().trim().length > 0, 'skill link has text');
  });
});

test('responsive tables: header/cell counts match, first cell is the key, others carry data-l labels', () => {
  const tables = $('table.rt');
  assert.ok(tables.length > 0);
  tables.each((ti, t) => {
    const heads = $(t).find('> thead > tr > th');
    assert.ok(heads.length >= 2, `table ${ti} has a header row`);
    assert.ok($(t).closest('.rtwrap').length, `table ${ti} is wrapped in .rtwrap`);
    $(t)
      .find('> tbody > tr')
      .each((ri, tr) => {
        const cells = $(tr).children('td');
        const where = `table ${ti} row ${ri} ("${cells.first().text().trim()}")`;
        assert.equal(cells.length, heads.length, `${where} cell count`);
        assert.ok(cells.first().hasClass('k'), `${where} first cell has class k`);
        cells.slice(1).each((ci, td) => {
          assert.ok(($(td).attr('data-l') || '').trim().length > 0, `${where} cell ${ci + 1} needs data-l`);
        });
      });
  });
});

test('every table is a responsive .rt table (plain tables do not stack on phones)', () => {
  assert.equal($('table:not(.rt)').length, 0);
});

test('tags use only known kinds and the legend explains them', () => {
  $('.tag').each((_, el) => {
    const kinds = ($(el).attr('class') || '').split(/\s+/).filter((c) => c !== 'tag');
    assert.equal(kinds.length, 1, `tag "${$(el).text()}" has one kind`);
    assert.ok(TAG_KINDS.has(kinds[0]), `unknown tag kind ${kinds[0]}`);
  });
  for (const kind of ['fact', 'consensus', 'opinion', 'retail']) {
    assert.ok($(`.controls .legend .tag.${kind}`).length, `legend explains ${kind}`);
  }
});

test('callouts have a title', () => {
  $('.callout').each((_, el) => {
    assert.ok($(el).children('.t').first().text().trim().length > 0);
  });
});

test('key-value grids label every cell', () => {
  $('.kv > div').each((_, el) => {
    assert.ok($(el).children('b').first().text().trim().length > 0, 'kv cell label');
  });
});

test('definition lists pair every dt with a dd', () => {
  $('dl').each((_, dl) => {
    assert.equal($(dl).children('dt').length, $(dl).children('dd').length);
  });
});

test('interactive controls the script depends on exist', () => {
  for (const id of ['search', 'expandAll', 'collapseAll', 'top', 'top-of-page']) {
    assert.equal($(`#${id}`).length, 1, `#${id}`);
  }
  assert.equal($('#search').attr('type'), 'search');
  assert.ok($('#search').attr('aria-label'));
  assert.equal($('#expandAll').attr('type'), 'button');
  assert.equal($('#collapseAll').attr('type'), 'button');
});

test('the footer links to the repository, sources.md and the version archive', () => {
  const hrefs = $('footer a').map((_, a) => $(a).attr('href')).get();
  assert.ok(hrefs.includes('https://github.com/G3N7/lu4-polearm-guide'));
  assert.ok(hrefs.some((h) => /github\.com\/G3N7\/lu4-polearm-guide\/blob\/HEAD\/sources\.md$/.test(h)));
  assert.ok(hrefs.includes('v/'));
});

test('the gear section links to the Kit Ledger page', () => {
  assert.equal($('#gear a[href="costs/"]').length, 1);
});
