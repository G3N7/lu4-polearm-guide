// Version bookkeeping: changelog format, header date, and archived snapshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { html } from './helpers.mjs';
import { parseChangelog, currentVersion, lastUpdated, listSnapshots, snapshotPath, VERSIONS_DIR, ROOT } from '../scripts/guide.mjs';

test('changelog entries are "<b>YYYY-MM-DD vN</b> — summary", newest first, strictly descending', () => {
  const entries = parseChangelog(html);
  assert.ok(entries.length >= 3);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    assert.ok(Number.isInteger(e.version) && e.version > 0, `entry ${i} version`);
    assert.match(e.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!Number.isNaN(Date.parse(e.date)), `entry ${i} date parses`);
    assert.ok(e.summary.length > 10, `entry ${i} has a summary`);
    if (i > 0) {
      assert.ok(e.version < entries[i - 1].version, `v${e.version} must come after v${entries[i - 1].version}`);
      assert.ok(e.date <= entries[i - 1].date, `v${e.version} dated after the newer v${entries[i - 1].version}`);
    }
  }
});

test('the header "Last updated" chip matches the newest changelog entry', () => {
  assert.equal(lastUpdated(html), currentVersion(html).date);
});

test('the current version is archived under versions/ and matches src/index.html byte for byte', () => {
  const { version } = currentVersion(html);
  const file = snapshotPath(version);
  assert.ok(fs.existsSync(file), `missing ${path.relative(ROOT, file)} — run "npm run snapshot"`);
  assert.equal(
    fs.readFileSync(file, 'utf8'),
    html,
    `${path.relative(ROOT, file)} is stale — bump the changelog version and run "npm run snapshot"`,
  );
});

test('every snapshot declares the version in its filename, has a changelog entry, and is not newer than current', () => {
  const entries = parseChangelog(html);
  const current = entries[0].version;
  const snaps = listSnapshots();
  assert.ok(snaps.length >= 1);
  for (const s of snaps) {
    const snapHtml = fs.readFileSync(s.file, 'utf8');
    const declared = currentVersion(snapHtml);
    assert.equal(declared.version, s.version, `${path.basename(s.file)} declares v${declared.version}`);
    assert.ok(s.version <= current, `${path.basename(s.file)} is newer than the current v${current}`);
    const entry = entries.find((e) => e.version === s.version);
    assert.ok(entry, `${path.basename(s.file)} has no changelog entry in src/index.html`);
    assert.equal(entry.date, declared.date, `changelog date for v${s.version} drifted from the snapshot`);
    assert.equal(lastUpdated(snapHtml), declared.date, `${path.basename(s.file)} header date`);
  }
});

test('versions/ contains only vN.html snapshots', () => {
  const stray = fs.readdirSync(VERSIONS_DIR).filter((f) => !/^v\d+\.html$/.test(f));
  assert.deepEqual(stray, []);
});

test('the changelog tells editors how to update the page in this repo', () => {
  const note = html.match(/<p class="src">To update:[^<]*<code>([^<]+)<\/code>/);
  assert.ok(note, 'update note present');
  assert.equal(note[1], 'src/index.html');
});
