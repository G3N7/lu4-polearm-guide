// scripts/snapshot.mjs: the only thing protecting archived versions from silent edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { html, tmp } from './helpers.mjs';
import { snapshot, SnapshotError } from '../scripts/snapshot.mjs';
import { currentVersion, ROOT } from '../scripts/guide.mjs';

const cur = currentVersion(html);

function fixture() {
  const dir = tmp('snap');
  const src = path.join(dir, 'index.html');
  fs.writeFileSync(src, html);
  const versionsDir = path.join(dir, 'versions');
  return { dir, src, versionsDir, target: path.join(versionsDir, `v${cur.version}.html`) };
}

test('writes a missing snapshot, then reports it unchanged', () => {
  const f = fixture();
  const r1 = snapshot({ src: f.src, versionsDir: f.versionsDir });
  assert.equal(r1.status, 'written');
  assert.equal(r1.version, cur.version);
  assert.equal(fs.readFileSync(f.target, 'utf8'), html);
  const r2 = snapshot({ src: f.src, versionsDir: f.versionsDir });
  assert.equal(r2.status, 'unchanged');
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('--check fails when the snapshot is missing or stale, and passes when current', () => {
  const f = fixture();
  assert.throws(() => snapshot({ src: f.src, versionsDir: f.versionsDir, check: true }), (e) => e instanceof SnapshotError && e.code === 'missing');
  fs.mkdirSync(f.versionsDir, { recursive: true });
  fs.writeFileSync(f.target, html + '<!-- edited -->');
  assert.throws(() => snapshot({ src: f.src, versionsDir: f.versionsDir, check: true }), (e) => e.code === 'stale' && /bump the version/.test(e.message));
  fs.writeFileSync(f.target, html);
  assert.equal(snapshot({ src: f.src, versionsDir: f.versionsDir, check: true }).status, 'unchanged');
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('refuses to overwrite a differing snapshot unless forced, and leaves it untouched', () => {
  const f = fixture();
  fs.mkdirSync(f.versionsDir, { recursive: true });
  const frozen = html + '<!-- published -->';
  fs.writeFileSync(f.target, frozen);
  assert.throws(() => snapshot({ src: f.src, versionsDir: f.versionsDir }), (e) => e.code === 'differs' && /--force/.test(e.message));
  assert.equal(fs.readFileSync(f.target, 'utf8'), frozen, 'file untouched after refusal');
  const r = snapshot({ src: f.src, versionsDir: f.versionsDir, force: true });
  assert.equal(r.status, 'overwritten');
  assert.equal(fs.readFileSync(f.target, 'utf8'), html);
  fs.rmSync(f.dir, { recursive: true, force: true });
});

test('the CLI exits 0 when current, 1 on --check failure, 2 on unknown flags', () => {
  const script = path.join(ROOT, 'scripts', 'snapshot.mjs');
  const ok = execFileSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  assert.match(ok, new RegExp(`v${cur.version}\\.html already matches`));
  const bad = spawnSync(process.execPath, [script, '--bogus'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown argument/);
});
