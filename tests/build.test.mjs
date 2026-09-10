// The build: dist layout, archived copies, versions.json, archive index, 404, extras, validity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { html, tmp, assertValidHtml } from './helpers.mjs';
import { build, rebaseRelativeLinks, archiveCopy, assertSafeOutDir, normaliseSiteUrl } from '../scripts/build.mjs';
import { currentVersion, parseChangelog, listSnapshots, ROOT, load } from '../scripts/guide.mjs';

/** A copy of the real page whose newest changelog entry is bumped to `version`. */
function pageAt(version, date = currentVersion(html).date) {
  const cur = currentVersion(html);
  return html
    .replace(`<b>${cur.date} v${cur.version}</b>`, `<b>${date} v${version}</b>`)
    .replace(`<span class="version">v${cur.version}</span>`, `<span class="version">v${version}</span>`)
    .replace(`v${cur.version} · `, `v${version} · `);
}

/** A temp src/ directory holding the given page (and nothing else). */
function srcDir(page = html) {
  const dir = tmp('src');
  const src = path.join(dir, 'index.html');
  fs.writeFileSync(src, page);
  return { dir, src };
}

test('rebaseRelativeLinks prefixes only site-relative URLs', () => {
  const input = '<a href="v/">x</a> <a href="#top">y</a> <a href="https://e.x/">z</a> <link href="data:image/svg+xml,a"> <a href="/root">r</a> <img src="img/a.png"> <a href="">e</a> <a href="costs/">c</a>';
  assert.equal(
    rebaseRelativeLinks(input, '../../'),
    '<a href="../../v/">x</a> <a href="#top">y</a> <a href="https://e.x/">z</a> <link href="data:image/svg+xml,a"> <a href="/root">r</a> <img src="../../img/a.png"> <a href="">e</a> <a href="../../costs/">c</a>',
  );
  assert.equal(rebaseRelativeLinks("a.getAttribute('href') === '#'", '../'), "a.getAttribute('href') === '#'", 'script text untouched');
});

test('archiveCopy adds banner, TOC chip, noindex, title prefix and rebased links', () => {
  const out = archiveCopy(html, { version: 4, date: '2026-09-09', isCurrent: false });
  const $ = load(out);
  assert.equal($('title').text(), 'v4 · LU4 Polearm Guide');
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
  assert.equal($('body > .archived-banner').length, 1);
  assert.match($('.archived-banner').text(), /Archived v4 \(2026-09-09\)/);
  assert.equal($('.archived-banner a[href="../../"]').length, 1);
  assert.equal($('.archived-banner a[href="../../v/"]').length, 1);
  assert.equal($('nav.toc .scroller > a.archived-chip[href="../../"]').length, 1, 'chip inside the sticky TOC');
  assert.match($('nav.toc a.archived-chip').text(), /archived v4/);
  assert.equal($('footer a[href="../../v/"]').length, 1, 'footer "all versions" link rebased');
  assert.equal($('footer a[href="v/"]').length, 0);
  assert.equal($('#gear a[href="../../costs/"]').length, 1, 'link to the ledger rebased');
  assert.equal($('a.sk').length, load(html)('a.sk').length, 'content preserved');
  const cur = archiveCopy(html, { version: 9, date: '2026-09-10', isCurrent: true });
  assert.match(load(cur)('.archived-banner').text(), /Snapshot of the current version, v9/);
  assert.match(load(cur)('nav.toc a.archived-chip').text(), /snapshot v9/);
});

test('archiveCopy tolerates body attributes and CRLF line endings', () => {
  const crlf = html.replace(/\n/g, '\r\n').replace('<body>', '<body class="x">');
  const $ = load(archiveCopy(crlf, { version: 1, date: '2026-01-01', isCurrent: false }));
  assert.equal($('body.x > .archived-banner').length, 1);
});

test('archiveCopy refuses pages without the landmarks it needs', () => {
  assert.throws(() => archiveCopy('<html><head></head><body></body></html>', { version: 1, date: 'x', isCurrent: false }), /exactly one match/);
});

test('assertSafeOutDir refuses the repository, its parents, and other projects', () => {
  assert.throws(() => assertSafeOutDir(ROOT), /contains the repository/);
  assert.throws(() => assertSafeOutDir(path.dirname(ROOT)), /contains the repository/);
  assert.throws(() => assertSafeOutDir('/'), /contains the repository/);
  const other = tmp('other');
  fs.writeFileSync(path.join(other, 'package.json'), '{}');
  assert.throws(() => assertSafeOutDir(other), /contains package\.json/);
  assert.equal(assertSafeOutDir(path.join(ROOT, 'dist')), path.join(ROOT, 'dist'));
  fs.rmSync(other, { recursive: true, force: true });
});

test('normaliseSiteUrl always ends with a slash', () => {
  assert.equal(normaliseSiteUrl('https://example.org/guide'), 'https://example.org/guide/');
  assert.equal(normaliseSiteUrl('https://example.org/guide/'), 'https://example.org/guide/');
  assert.equal(normaliseSiteUrl('https://example.org'), 'https://example.org/');
});

test('build writes the current page, extras, archives, versions.json, archive index, 404 and .nojekyll', async () => {
  const out = tmp('dist');
  const r = build({ out });
  const cur = currentVersion(html);
  assert.equal(r.current.version, cur.version);
  assert.equal(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), html, 'dist/index.html is src/index.html byte for byte');
  assert.ok(fs.existsSync(path.join(out, '.nojekyll')));
  assert.ok(r.extras.includes('costs/index.html'));
  assert.equal(fs.readFileSync(path.join(out, 'costs', 'index.html'), 'utf8'), fs.readFileSync(path.join(ROOT, 'src', 'costs', 'index.html'), 'utf8'));
  assert.ok(r.siteLinks.includes('costs/') && r.siteLinks.includes('v/'));

  const snaps = listSnapshots();
  assert.deepEqual(r.snapshots, snaps.map((s) => s.version));
  for (const s of snaps) {
    const file = path.join(out, 'v', String(s.version), 'index.html');
    assert.ok(fs.existsSync(file), `v/${s.version}/index.html`);
    const $ = load(fs.readFileSync(file, 'utf8'));
    assert.equal($('.archived-banner').length, 1);
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
    await assertValidHtml(file, assert);
  }

  const json = JSON.parse(fs.readFileSync(path.join(out, 'versions.json'), 'utf8'));
  assert.equal(json.current, cur.version);
  assert.equal(json.lastUpdated, cur.date);
  assert.equal(json.site, 'https://g3n7.github.io/lu4-polearm-guide/');
  assert.deepEqual(json.versions.map((v) => v.version), parseChangelog(html).map((e) => e.version));
  assert.equal(json.versions[0].current, true);
  assert.equal(json.versions.filter((v) => v.current).length, 1);
  for (const v of json.versions) {
    const isSnap = snaps.some((s) => s.version === v.version);
    assert.equal(v.archived, isSnap, `v${v.version} archived flag`);
    assert.equal(v.path, isSnap ? `v/${v.version}/` : null);
    assert.ok(v.summary.length > 10);
  }

  const index = path.join(out, 'v', 'index.html');
  const $i = load(fs.readFileSync(index, 'utf8'));
  for (const v of json.versions) {
    if (v.archived) assert.equal($i(`a[href="${v.version}/"]`).length, 1, `archive index links v${v.version}`);
    else assert.equal($i(`a[href="${v.version}/"]`).length, 0, `archive index must not link unarchived v${v.version}`);
  }
  assert.equal($i('li.current').length, 1);
  assert.equal($i('a[href="../"]').length, 1);
  if (json.versions.some((v) => !v.archived)) assert.match($i('p').first().text(), /no archived copy/);
  await assertValidHtml(index, assert);

  const nf = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  assert.match(nf, /href="\/lu4-polearm-guide\/"/);
  assert.match(nf, /href="\/lu4-polearm-guide\/v\/"/);
  await assertValidHtml(path.join(out, '404.html'), assert);

  fs.rmSync(out, { recursive: true, force: true });
});

test('build honours siteUrl (with or without a trailing slash) for the 404 page and versions.json', () => {
  for (const siteUrl of ['https://example.org/guide/', 'https://example.org/guide']) {
    const out = tmp('site');
    build({ out, siteUrl });
    assert.match(fs.readFileSync(path.join(out, '404.html'), 'utf8'), /href="\/guide\/v\/"/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'versions.json'), 'utf8')).site, 'https://example.org/guide/');
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('build fails when a snapshot declares a different version than its filename', () => {
  const versionsDir = tmp('versions');
  fs.writeFileSync(path.join(versionsDir, 'v4.html'), html);
  assert.throws(() => build({ out: tmp('dist'), versionsDir }), new RegExp(`v4\\.html declares v${currentVersion(html).version}`));
  fs.rmSync(versionsDir, { recursive: true, force: true });
});

test('build fails when a snapshot has no changelog entry', () => {
  const versionsDir = tmp('versions');
  fs.writeFileSync(path.join(versionsDir, 'v99.html'), pageAt(99));
  assert.throws(() => build({ out: tmp('dist'), versionsDir }), /v99\.html has no matching changelog entry/);
  fs.rmSync(versionsDir, { recursive: true, force: true });
});

test('build fails when the header date and the newest changelog entry disagree', () => {
  const { dir, src } = srcDir(pageAt(10, '2026-12-01'));
  assert.throws(() => build({ src, out: tmp('dist'), versionsDir: tmp('versions') }), /Last updated.*2026-12-01/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build fails on a malformed changelog entry', () => {
  const cur = currentVersion(html);
  const { dir, src } = srcDir(html.replace(`<b>${cur.date} v${cur.version}</b>`, '<b>version ten</b>'));
  assert.throws(() => build({ src, out: tmp('dist'), versionsDir: tmp('versions') }), /must start with <b>YYYY-MM-DD vN<\/b>/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build fails when the guide links to a page that is not in src/', () => {
  const { dir, src } = srcDir(html); // only index.html: the costs/ link has nowhere to go
  assert.throws(() => build({ src, out: tmp('dist'), versionsDir: tmp('versions') }), /links to "costs\/" but the build has no costs\/index\.html/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('build refuses to wipe the repository or another project', () => {
  assert.throws(() => build({ out: ROOT }), /refusing to build into/);
  assert.ok(fs.existsSync(path.join(ROOT, 'package.json')));
});

test('build tolerates an empty versions directory', () => {
  const out = tmp('dist');
  const r = build({ out, versionsDir: tmp('versions') });
  assert.deepEqual(r.snapshots, []);
  const json = JSON.parse(fs.readFileSync(path.join(out, 'versions.json'), 'utf8'));
  assert.ok(json.versions.every((v) => v.archived === false));
  assert.ok(fs.existsSync(path.join(out, 'v', 'index.html')));
  fs.rmSync(out, { recursive: true, force: true });
});

test('the CLI builds into a directory from the repo root', () => {
  const out = tmp('cli');
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs'), '--out', out], { encoding: 'utf8' });
  assert.match(stdout, new RegExp(`built v${currentVersion(html).version}`));
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  fs.rmSync(out, { recursive: true, force: true });
});
