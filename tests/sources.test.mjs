// sources.md is generated from the page; keep it in sync and complete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { html } from './helpers.mjs';
import { renderSources } from '../scripts/sources.mjs';
import { extractLinks, isExternal, SOURCES_MD } from '../scripts/guide.mjs';

test('sources.md matches "npm run sources" output', () => {
  assert.ok(fs.existsSync(SOURCES_MD), 'sources.md missing — run "npm run sources"');
  assert.equal(fs.readFileSync(SOURCES_MD, 'utf8'), renderSources(html), 'sources.md is stale — run "npm run sources"');
});

test('sources.md lists every external URL exactly once', () => {
  const md = renderSources(html);
  const urls = new Set(extractLinks(html).map((l) => l.href).filter(isExternal));
  for (const u of urls) {
    const n = md.split(`](${u})`).length - 1;
    assert.equal(n, 1, `${u} listed ${n} times`);
  }
  assert.match(md, new RegExp(`${urls.size} unique URLs`));
});

test('sources.md groups by site with the biggest group first', () => {
  const md = renderSources(html);
  const counts = [...md.matchAll(/^## .* — (\d+) URLs?$/gm)].map((m) => Number(m[1]));
  assert.ok(counts.length >= 5);
  for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1]);
});

test('renderSources is deterministic', () => {
  assert.equal(renderSources(html), renderSources(html));
});
