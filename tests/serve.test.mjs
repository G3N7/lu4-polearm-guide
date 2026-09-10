// The static server used by "npm start" and the e2e tests, with and without a base path.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import { tmp } from './helpers.mjs';
import { createServer, normaliseBase } from '../scripts/serve.mjs';
import { build } from '../scripts/build.mjs';

let dir, plain, based, base, baseB;

before(async () => {
  dir = tmp('serve');
  build({ out: dir });
  plain = createServer(dir);
  based = createServer(dir, { base: 'lu4-polearm-guide' });
  await new Promise((r) => plain.listen(0, '127.0.0.1', r));
  await new Promise((r) => based.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${plain.address().port}`;
  baseB = `http://127.0.0.1:${based.address().port}`;
});

after(async () => {
  await new Promise((r) => plain.close(r));
  await new Promise((r) => based.close(r));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('normaliseBase', () => {
  assert.equal(normaliseBase('/'), '/');
  assert.equal(normaliseBase(''), '/');
  assert.equal(normaliseBase('lu4'), '/lu4/');
  assert.equal(normaliseBase('/lu4/'), '/lu4/');
  assert.equal(normaliseBase('//lu4//'), '/lu4/');
});

test('serves the guide at /', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(await res.text(), /<title>LU4 Polearm Guide<\/title>/);
});

test('serves json, the ledger, and directory indexes', async () => {
  const json = await fetch(`${base}/versions.json`);
  assert.equal(json.status, 200);
  assert.match(json.headers.get('content-type'), /application\/json/);
  assert.equal(typeof (await json.json()).current, 'number');
  const v = await fetch(`${base}/v/`);
  assert.equal(v.status, 200);
  assert.match(await v.text(), /versions/);
  const costs = await fetch(`${base}/costs/`);
  assert.equal(costs.status, 200);
  assert.match(await costs.text(), /Kit Ledger/);
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

test('rejects control characters and null bytes in the path without crashing', async () => {
  // Percent-encoded control characters decode into the path; they must never reach the file
  // system or a Location header (which would throw ERR_INVALID_CHAR and take the process down).
  const port = plain.address().port;
  const raw = (target) => new Promise((resolve, reject) => {
    const sock = net.connect(port, '127.0.0.1');
    let data = '';
    sock.on('connect', () => sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
    sock.on('data', (d) => { data += d; });
    sock.on('end', () => resolve(data.split('\r\n')[0]));
    sock.on('error', reject);
  });
  for (const target of ['/v%0a', '/v%0d%0aX', '/v%00', '/%09v', '/v/%D0%B0%0a', '/v%0a/']) {
    assert.match(await raw(target), /^HTTP\/1\.1 404/, target);
  }
  const alive = await fetch(`${base}/`);
  assert.equal(alive.status, 200);
});

test('directory redirects carry a percent-encoded Location', async () => {
  fs.mkdirSync(`${dir}/caf\u00e9 bar`, { recursive: true });
  fs.writeFileSync(`${dir}/caf\u00e9 bar/index.html`, '<!DOCTYPE html><title>x</title>');
  const res = await fetch(`${base}/caf%C3%A9%20bar`, { redirect: 'manual' });
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('location'), '/caf%C3%A9%20bar/');
  const followed = await fetch(`${base}/caf%C3%A9%20bar/`);
  assert.equal(followed.status, 200);
});

test('HEAD requests carry headers only', async () => {
  const res = await fetch(`${base}/`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.ok(Number(res.headers.get('content-length')) > 10000);
  assert.equal(await res.text(), '');
});

test('with a base path: redirects the root, serves under the prefix, and 404s outside it', async () => {
  const root = await fetch(`${baseB}/`, { redirect: 'manual' });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get('location'), '/lu4-polearm-guide/');
  const noslash = await fetch(`${baseB}/lu4-polearm-guide`, { redirect: 'manual' });
  assert.equal(noslash.status, 302);
  assert.equal(noslash.headers.get('location'), '/lu4-polearm-guide/');
  const guide = await fetch(`${baseB}/lu4-polearm-guide/`);
  assert.equal(guide.status, 200);
  assert.match(await guide.text(), /<title>LU4 Polearm Guide<\/title>/);
  const dirRedirect = await fetch(`${baseB}/lu4-polearm-guide/v`, { redirect: 'manual' });
  assert.equal(dirRedirect.status, 301);
  assert.equal(dirRedirect.headers.get('location'), '/lu4-polearm-guide/v/');
  const archive = await fetch(`${baseB}/lu4-polearm-guide/v/`);
  assert.equal(archive.status, 200);
  const outside = await fetch(`${baseB}/index.html`);
  assert.equal(outside.status, 404);
  const escape = await fetch(`${baseB}/lu4-polearm-guide/../package.json`);
  assert.notEqual(escape.status, 200);
});
