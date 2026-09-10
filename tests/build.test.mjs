// The build: dist layout, archived copies, versions.json, archive index, 404, and validity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HtmlValidate } from 'html-validate';
import { html } from './helpers.mjs';
import { build, rebaseRelativeLinks, archiveCopy } from '../scripts/build.mjs';
import { currentVersion, parseChangelog, listSnapshots, ROOT, load } from '../scripts/guide.mjs';

const validator = new HtmlValidate();
async function assertValid(file) {
  const report = await validator.validateFile(file);
  const messages = report.results.flatMap((r) => r.messages.map((m) => `${m.line}:${m.column} ${m.message} (${m.ruleId})`));
  assert.deepEqual(messages, [], `${path.basename(file)} is not valid HTML`);
}

function tmp(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `lu4-${name}-`));
}

/** A copy of the real page whose newest changelog entry is bumped to `version`. */
function pageAt(version, date = currentVersion(html).date) {
  const cur = currentVersion(html);
  return html.replace(`<b>${cur.date} v${cur.version}</b>`, `<b>${date} v${version}</b>`);
}

test('rebaseRelativeLinks prefixes only site-relative URLs', () => {
  const input = '<a href="v/">x</a> <a href="#top">y</a> <a href="https://e.x/">z</a> <link href="data:image/svg+xml,a"> <a href="/root">r</a> <img src="img/a.png"> <a href="">e</a>';
  assert.equal(
    rebaseRelativeLinks(input, '../../'),
    '<a href="../../v/">x</a> <a href="#top">y</a> <a href="https://e.x/">z</a> <link href="data:image/svg+xml,a"> <a href="/root">r</a> <img src="../../img/a.png"> <a href="">e</a>',
  );
  assert.equal(rebaseRelativeLinks("a.getAttribute('href') === '#'", '../'), "a.getAttribute('href') === '#'", 'script text untouched');
});

test('archiveCopy adds banner, noindex, title prefix and rebased links', () => {
  const out = archiveCopy(html, { version: 4, date: '2026-09-09', isCurrent: false });
  const $ = load(out);
  assert.equal($('title').text(), 'v4 · LU4 Polearm Guide');
  assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
  assert.equal($('body > .archived-banner').length, 1);
  assert.match($('.archived-banner').text(), /Archived v4 \(2026-09-09\)/);
  assert.equal($('.archived-banner a[href="../../"]').length, 1);
  assert.equal($('.archived-banner a[href="../../v/"]').length, 1);
  assert.equal($('footer a[href="../../v/"]').length, 1, 'footer "all versions" link rebased');
  assert.equal($('footer a[href="v/"]').length, 0);
  assert.equal($('a.sk').length, load(html)('a.sk').length, 'content preserved');
  const cur = archiveCopy(html, { version: 9, date: '2026-09-10', isCurrent: true });
  assert.match(load(cur)('.archived-banner').text(), /Snapshot of the current version, v9/);
});

test('build writes the current page, archives, versions.json, archive index, 404 and .nojekyll', async () => {
  const out = tmp('dist');
  const r = build({ out });
  const cur = currentVersion(html);
  assert.equal(r.current.version, cur.version);
  assert.equal(fs.readFileSync(path.join(out, 'index.html'), 'utf8'), html, 'dist/index.html is src/index.html byte for byte');
  assert.ok(fs.existsSync(path.join(out, '.nojekyll')));

  const snaps = listSnapshots();
  assert.deepEqual(r.snapshots, snaps.map((s) => s.version));
  for (const s of snaps) {
    const file = path.join(out, 'v', String(s.version), 'index.html');
    assert.ok(fs.existsSync(file), `v/${s.version}/index.html`);
    const $ = load(fs.readFileSync(file, 'utf8'));
    assert.equal($('.archived-banner').length, 1);
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex');
    await assertValid(file);
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
  await assertValid(index);

  const nf = fs.readFileSync(path.join(out, '404.html'), 'utf8');
  assert.match(nf, /href="\/lu4-polearm-guide\/"/);
  assert.match(nf, /href="\/lu4-polearm-guide\/v\/"/);
  await assertValid(path.join(out, '404.html'));

  fs.rmSync(out, { recursive: true, force: true });
});

test('build honours --site-url / siteUrl for the 404 page and versions.json', () => {
  const out = tmp('site');
  build({ out, siteUrl: 'https://example.org/guide/' });
  assert.match(fs.readFileSync(path.join(out, '404.html'), 'utf8'), /href="\/guide\/"/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'versions.json'), 'utf8')).site, 'https://example.org/guide/');
  fs.rmSync(out, { recursive: true, force: true });
});

test('build fails when a snapshot declares a different version than its filename', () => {
  const versionsDir = tmp('versions');
  fs.writeFileSync(path.join(versionsDir, 'v4.html'), html); // real page declares v9
  assert.throws(() => build({ out: tmp('dist'), versionsDir }), /v4\.html declares v9/);
  fs.rmSync(versionsDir, { recursive: true, force: true });
});

test('build fails when a snapshot has no changelog entry', () => {
  const versionsDir = tmp('versions');
  fs.writeFileSync(path.join(versionsDir, 'v99.html'), pageAt(99));
  assert.throws(() => build({ out: tmp('dist'), versionsDir }), /v99\.html has no matching changelog entry/);
  fs.rmSync(versionsDir, { recursive: true, force: true });
});

test('build fails when the header date and the newest changelog entry disagree', () => {
  const srcDir = tmp('src');
  const src = path.join(srcDir, 'index.html');
  fs.writeFileSync(src, pageAt(10, '2026-12-01'));
  assert.throws(() => build({ src, out: tmp('dist'), versionsDir: tmp('versions') }), /Last updated.*2026-12-01/);
  fs.rmSync(srcDir, { recursive: true, force: true });
});

test('build fails on a malformed changelog entry', () => {
  const srcDir = tmp('src');
  const src = path.join(srcDir, 'index.html');
  const cur = currentVersion(html);
  fs.writeFileSync(src, html.replace(`<b>${cur.date} v${cur.version}</b>`, '<b>version nine</b>'));
  assert.throws(() => build({ src, out: tmp('dist'), versionsDir: tmp('versions') }), /must start with <b>YYYY-MM-DD vN<\/b>/);
  fs.rmSync(srcDir, { recursive: true, force: true });
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

test('the CLI builds into dist/ from the repo root', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = tmp('cli');
  const stdout = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs'), '--out', out], { encoding: 'utf8' });
  assert.match(stdout, new RegExp(`built v${currentVersion(html).version}`));
  assert.ok(fs.existsSync(path.join(out, 'index.html')));
  fs.rmSync(out, { recursive: true, force: true });
});
