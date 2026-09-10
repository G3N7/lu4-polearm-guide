// Archive the current src/index.html as versions/v<N>.html, where N is the newest changelog
// entry. Refuses to overwrite a differing snapshot unless --force is given (bump the version in
// the changelog instead). --check only verifies and exits 1 if the snapshot is missing or stale.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SRC, VERSIONS_DIR, ROOT, currentVersion, snapshotPath } from './guide.mjs';

export class SnapshotError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const rel = (p) => path.relative(ROOT, p) || p;

/**
 * @returns {{status: 'unchanged'|'written'|'overwritten', target: string, version: number, date: string}}
 * @throws {SnapshotError} code 'missing' | 'stale' (with check) or 'differs' (without force)
 */
export function snapshot({ src = SRC, versionsDir = VERSIONS_DIR, force = false, check = false } = {}) {
  const html = fs.readFileSync(src, 'utf8');
  const { version, date } = currentVersion(html);
  const target = snapshotPath(version, versionsDir);
  const exists = fs.existsSync(target);
  const same = exists && fs.readFileSync(target, 'utf8') === html;

  if (same) return { status: 'unchanged', target, version, date };
  if (check) {
    throw new SnapshotError(
      exists ? 'stale' : 'missing',
      exists
        ? `${rel(target)} differs from ${rel(src)} — bump the version in the changelog and run "npm run snapshot" (or "npm run snapshot -- --force" to overwrite v${version})`
        : `${rel(target)} is missing — run "npm run snapshot" to archive v${version}`,
    );
  }
  if (exists && !force) {
    throw new SnapshotError(
      'differs',
      `${rel(target)} exists and differs from ${rel(src)}.\n` +
        `If the content changed, add a new changelog entry (v${version + 1}) and run "npm run snapshot" again.\n` +
        `To overwrite the v${version} snapshot anyway: npm run snapshot -- --force`,
    );
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, html);
  return { status: exists ? 'overwritten' : 'written', target, version, date };
}

function cli(argv) {
  const force = argv.includes('--force');
  const check = argv.includes('--check');
  const unknown = argv.filter((a) => a !== '--force' && a !== '--check');
  if (unknown.length) {
    console.error(`unknown argument(s): ${unknown.join(' ')}`);
    process.exit(2);
  }
  try {
    const r = snapshot({ force, check });
    const verb = { unchanged: 'already matches src/index.html', written: 'written', overwritten: 'overwritten' }[r.status];
    console.log(`${rel(r.target)} ${verb} (v${r.version}, ${r.date})`);
  } catch (err) {
    if (!(err instanceof SnapshotError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
