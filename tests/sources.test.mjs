// sources.md is generated from the page; keep it in sync and complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { html, tmp } from './helpers.mjs';
import { renderSources } from '../scripts/sources.mjs';
import { extractLinks, isExternal, SOURCES_MD, ROOT } from '../scripts/guide.mjs';

test('sources.md matches "npm run sources" output', () => {
  assert.ok(fs.existsSync(SOURCES_MD), 'sources.md missing — run "npm run sources"');
  assert.equal(fs.readFileSync(SOURCES_MD, 'utf8'), renderSources(html), 'sources.md is stale — run "npm run sources"');
});

test('sources.md lists every external URL exactly once, with its section', () => {
  const md = renderSources(html);
  const urls = new Set(extractLinks(html).map((l) => l.href).filter(isExternal));
  assert.ok(urls.size > 0);
  for (const u of urls) {
    const n = md.split(`](${u})`).length - 1;
    assert.equal(n, 1, `${u} listed ${n} times`);
  }
  assert.match(md, new RegExp(`${urls.size} unique URLs`));
  assert.match(md, /— §\d+ /, 'entries name the section they appear in');
});

test('sources.md groups by site with the biggest group first', () => {
  const md = renderSources(html);
  const counts = [...md.matchAll(/^## .* — (\d+) URLs?$/gm)].map((m) => Number(m[1]));
  assert.ok(counts.length > 1);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
});

test('renderSources is deterministic and uses LF line endings', () => {
  const md = renderSources(html);
  assert.equal(md, renderSources(html));
  assert.ok(!md.includes('\r'));
});

test('the CLI --check exits 1 on a stale file and 0 after regenerating', () => {
  const script = path.join(ROOT, 'scripts', 'sources.mjs');
  const dir = tmp('sources');
  const out = path.join(dir, 'sources.md');
  fs.writeFileSync(out, '# stale\n');
  const stale = spawnSync(process.execPath, [script, '--check', '--out', out], { encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /out of date/);
  const write = spawnSync(process.execPath, [script, '--out', out], { encoding: 'utf8' });
  assert.equal(write.status, 0);
  assert.equal(fs.readFileSync(out, 'utf8'), renderSources(html));
  const fresh = spawnSync(process.execPath, [script, '--check', '--out', out], { encoding: 'utf8' });
  assert.equal(fresh.status, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
