// Archive the current src/index.html as versions/v<N>.html, where N is the newest
// changelog entry. Refuses to overwrite a differing snapshot unless --force is given
// (bump the version in the changelog instead). --check only verifies and exits 1 if stale.
import fs from 'node:fs';
import path from 'node:path';
import { SRC, ROOT, readGuide, currentVersion, snapshotPath } from './guide.mjs';

const args = process.argv.slice(2);
const force = args.includes('--force');
const check = args.includes('--check');
const unknown = args.filter((a) => a !== '--force' && a !== '--check');
if (unknown.length) {
  console.error(`unknown argument(s): ${unknown.join(' ')}`);
  process.exit(2);
}

const html = readGuide();
const { version, date } = currentVersion(html);
const target = snapshotPath(version);
const rel = path.relative(ROOT, target);
const exists = fs.existsSync(target);
const same = exists && fs.readFileSync(target, 'utf8') === html;

if (same) {
  console.log(`${rel} already matches ${path.relative(ROOT, SRC)} (v${version}, ${date})`);
  process.exit(0);
}
if (check) {
  console.error(
    exists
      ? `${rel} differs from src/index.html — bump the version in the changelog and run "npm run snapshot" (or "npm run snapshot -- --force" to overwrite v${version})`
      : `${rel} is missing — run "npm run snapshot" to archive v${version}`,
  );
  process.exit(1);
}
if (exists && !force) {
  console.error(
    `${rel} exists and differs from src/index.html.\n` +
      `If the content changed, add a new changelog entry (v${version + 1}) and run "npm run snapshot" again.\n` +
      `To overwrite the v${version} snapshot anyway: npm run snapshot -- --force`,
  );
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log(`${exists ? 'overwrote' : 'wrote'} ${rel} (v${version}, ${date})`);
