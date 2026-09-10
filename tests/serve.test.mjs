// The static server used by "npm start" and the e2e tests.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../scripts/serve.mjs';
import { build } from '../scripts/build.mjs';

let server, base, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lu4-serve-'));
  build({ out: dir });
  server = createServer(dir);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('serves the guide at /', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<title>LU4 Polearm Guide<\/title>/);
});

test('serves json and directory indexes', async () => {
  const json = await fetch(`${base}/versions.json`);
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type'), /application\/json/);
  assert.equal(typeof (await json.json()).current, 'number');
  const v = await fetch(`${base}/v/`);
  assert.equal(v.status, 200);
  assert.match(await v.text(), /versions/);
});

test('redirects a directory without a trailing slash', async () => {
  const res = await fetch(`${base}/v`, { redirect: 'manual' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/v/');
});

test('answers misses with the 404 page and status 404', async () => {
  const res = await fetch(`${base}/nope/`);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /Page not found/);
});

test('does not escape the served directory', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/v/../../package.json']) {
    const res = await fetch(`${base}${p}`);
    assert.notEqual(res.status, 200, p);
    assert.doesNotMatch(await res.text(), /"devDependencies"/, p);
  }
});

test('HEAD requests carry headers only', async () => {
  const res = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.ok(Number(res.headers.get('content-length')) > 10000);
  assert.equal(await res.text(), '');
});
