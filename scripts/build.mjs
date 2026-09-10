// Build the GitHub Pages site into dist/:
//   index.html        the current guide (src/index.html, byte-for-byte)
//   costs/…, etc.     every other file under src/ copied as-is (extra pages and assets)
//   v/N/index.html    every archived snapshot from versions/vN.html, with an "archived" banner
//   v/index.html      list of all versions from the changelog
//   versions.json     machine-readable version list
//   404.html, .nojekyll
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT, SRC, VERSIONS_DIR, DEFAULT_SITE_URL,
  parseChangelog, lastUpdated, listSnapshots, escapeHtml, extractLinks, isExternal,
} from './guide.mjs';

const SKIP_PREFIX = /^(?:#|\/|[a-z][a-z0-9+.-]*:)/i;

/**
 * Prefix site-relative href/src values (e.g. href="v/") so a page copied into a
 * sub-directory still points at the same targets. Fragment-only, root-relative and
 * absolute/scheme URLs are left alone.
 */
export function rebaseRelativeLinks(html, prefix) {
  return html.replace(/(\s(?:href|src)=")([^"]*)(")/g, (m, open, url, close) =>
    url === '' || SKIP_PREFIX.test(url) ? m : `${open}${prefix}${url}${close}`,
  );
}

const BANNER_CSS = `
.archived-banner { background: #2b2210; color: #f0c96b; border-bottom: 1px solid #c9a961; padding: .55rem .9rem; text-align: center; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.archived-banner a { color: #fff; text-decoration: underline; }
nav.toc a.archived-chip { border-color: #c9a961; color: #f0c96b; background: #2b2210; font-weight: 700; }
`;

/**
 * Turn a snapshot into an archive page: banner, a chip in the sticky TOC (so the "archived"
 * signal survives scrolling), noindex, prefixed title, rebased links.
 */
export function archiveCopy(html, { version, date, isCurrent, depth = 2 }) {
  const up = '../'.repeat(depth);
  const note = isCurrent
    ? `Snapshot of the current version, <b>v${version}</b> (${escapeHtml(date)}).`
    : `Archived <b>v${version}</b> (${escapeHtml(date)}) — this copy is frozen and may be out of date.`;
  const banner = `<div class="archived-banner" role="note">${note} <a href="${up}">Read the latest version</a> · <a href="${up}v/">all versions</a></div>\n`;
  const chip = `<a class="archived-chip" href="${up}">${isCurrent ? 'snapshot' : 'archived'} v${version} → latest</a>\n`;
  let out = rebaseRelativeLinks(html, up);
  out = replaceOnce(out, /<title>/, `<meta name="robots" content="noindex">\n<title>v${version} · `);
  out = replaceOnce(out, /<\/head>/, `<style>${BANNER_CSS}</style>\n</head>`);
  out = replaceOnce(out, /<body[^>]*>\s*/, (m) => `${m}${banner}`);
  out = replaceOnce(out, /(<nav class="toc"[^>]*>\s*<div class="scroller">\s*)/, (m) => `${m}${chip}`);
  return out;
}

/** Replace exactly one match of `re` (a non-global RegExp) in `str`; throw if there are 0 or 2+. */
function replaceOnce(str, re, to) {
  const g = new RegExp(re.source, re.flags.replace('g', '') + 'g');
  const matches = [...str.matchAll(g)];
  if (matches.length !== 1) throw new Error(`expected exactly one match of ${re} in the page, found ${matches.length}`);
  const m = matches[0];
  const repl = typeof to === 'function' ? to(m[0]) : to;
  return str.slice(0, m.index) + repl + str.slice(m.index + m[0].length);
}

const PAGE_CSS = `
:root { color-scheme: dark; }
body { margin: 0; background: #0b0d12; color: #d8d4c8; font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 1.5rem 1rem 3rem; }
h1 { font-family: "Palatino Linotype", Palatino, Georgia, serif; color: #e6c97a; font-size: 1.6rem; margin: 0 0 .3rem; }
p { margin: .5rem 0; }
a { color: #e6c97a; }
ul { list-style: none; padding: 0; margin: 1.2rem 0; }
li { border: 1px solid #2a3040; border-radius: 8px; background: #12151d; padding: .7rem .9rem; margin: .6rem 0; }
li.current { border-color: #c9a961; }
.v { font-family: "Palatino Linotype", Palatino, Georgia, serif; color: #e6c97a; font-weight: 700; }
.d { color: #8f8a7c; font-size: .85rem; margin-left: .4rem; }
.s { margin: .25rem 0 0; font-size: .95rem; }
.na { color: #8f8a7c; font-size: .85rem; }
`;

function htmlPage({ title, body, robots = true }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
${robots ? '' : '<meta name="robots" content="noindex">\n'}<meta name="color-scheme" content="dark">
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;
}

export function archiveIndex(versions) {
  const items = versions
    .map((v) => {
      const head = v.archived
        ? `<a class="v" href="${v.version}/">v${v.version}</a>`
        : `<span class="v">v${v.version}</span>`;
      const tail = v.archived ? '' : ' <span class="na">(no archived copy)</span>';
      const cur = v.current ? ' <span class="na">— current</span>' : '';
      return `<li${v.current ? ' class="current"' : ''}>${head}<span class="d">${escapeHtml(v.date)}</span>${cur}${tail}<p class="s">${escapeHtml(v.summary)}</p></li>`;
    })
    .join('\n');
  const missing = versions.filter((v) => !v.archived).map((v) => v.version);
  const note = missing.length
    ? ` ${missing.length === 1 ? `Version v${missing[0]} has` : `Versions v${Math.min(...missing)}–v${Math.max(...missing)} have`} no archived copy: only the changelog summary survives.`
    : '';
  return htmlPage({
    title: 'LU4 Polearm Guide · versions',
    body: `<h1>LU4 Polearm Guide · versions</h1>
<p><a href="../">Read the latest version</a>. Archived copies are frozen as published; the changelog on the current page has the full history.${note}</p>
<ul>
${items}
</ul>`,
  });
}

export function notFoundPage(siteUrl) {
  const base = new URL(siteUrl).pathname;
  return htmlPage({
    title: 'LU4 Polearm Guide · not found',
    robots: false,
    body: `<h1>Page not found</h1>
<p>Nothing lives at this address. <a href="${escapeHtml(base)}">Open the guide</a> or browse <a href="${escapeHtml(base)}v/">all versions</a>.</p>`,
  });
}

/** Refuse output directories that would wipe the repository or another project. */
export function assertSafeOutDir(out) {
  const abs = path.resolve(out);
  const inside = (parent, child) => {
    const rel = path.relative(parent, child);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };
  if (inside(abs, ROOT)) throw new Error(`refusing to build into ${abs}: it contains the repository`);
  for (const marker of ['.git', 'package.json']) {
    if (fs.existsSync(path.join(abs, marker))) throw new Error(`refusing to build into ${abs}: it contains ${marker}`);
  }
  return abs;
}

/** Copy every file under srcDir except the root index.html (which is written separately). */
function copyExtras(srcDir, out) {
  const copied = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(srcDir, abs);
      if (entry.isDirectory()) walk(abs);
      else if (rel !== 'index.html') {
        fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true });
        fs.copyFileSync(abs, path.join(out, rel));
        copied.push(rel.split(path.sep).join('/'));
      }
    }
  };
  walk(srcDir);
  return copied.sort();
}

/** Every site-relative link in the guide must resolve to something in the build. */
function assertSiteLinksResolve(html, out) {
  const rels = [...new Set(extractLinks(html).map((l) => l.href).filter((h) => h && !h.startsWith('#') && !isExternal(h)))];
  for (const href of rels) {
    const clean = href.split('#')[0].split('?')[0];
    const target = path.join(out, clean);
    const ok = fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html')));
    if (!ok) throw new Error(`src/index.html links to "${href}" but the build has no ${clean}${clean.endsWith('/') ? 'index.html' : ''}`);
  }
  return rels;
}

export function normaliseSiteUrl(siteUrl) {
  const u = new URL(siteUrl);
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

export function build({
  src = SRC,
  versionsDir = VERSIONS_DIR,
  out = path.join(ROOT, 'dist'),
  siteUrl = process.env.SITE_URL || DEFAULT_SITE_URL,
} = {}) {
  out = assertSafeOutDir(out);
  siteUrl = normaliseSiteUrl(siteUrl);
  const html = fs.readFileSync(src, 'utf8');
  const changelog = parseChangelog(html);
  const current = changelog[0];
  const updated = lastUpdated(html);
  if (updated !== current.date) {
    throw new Error(`header says "Last updated" ${updated} but the newest changelog entry is v${current.version} dated ${current.date}`);
  }

  const snapshots = listSnapshots(versionsDir);
  const archived = new Map(snapshots.map((s) => [s.version, s]));
  for (const s of snapshots) {
    if (!changelog.some((e) => e.version === s.version)) {
      throw new Error(`${path.basename(s.file)} has no matching changelog entry in src/index.html`);
    }
  }

  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, 'v'), { recursive: true });
  fs.writeFileSync(path.join(out, 'index.html'), html);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');
  const extras = copyExtras(path.dirname(src), out);

  for (const s of snapshots) {
    const snapHtml = fs.readFileSync(s.file, 'utf8');
    const declared = parseChangelog(snapHtml)[0];
    if (declared.version !== s.version) {
      throw new Error(`${path.basename(s.file)} declares v${declared.version} in its changelog`);
    }
    const dir = path.join(out, 'v', String(s.version));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'index.html'),
      archiveCopy(snapHtml, { version: s.version, date: declared.date, isCurrent: s.version === current.version }),
    );
  }

  const versions = changelog.map((e) => ({
    version: e.version,
    date: e.date,
    summary: e.summary,
    current: e.version === current.version,
    archived: archived.has(e.version),
    path: archived.has(e.version) ? `v/${e.version}/` : null,
  }));

  fs.writeFileSync(
    path.join(out, 'versions.json'),
    JSON.stringify({ site: siteUrl, current: current.version, lastUpdated: updated, versions }, null, 2) + '\n',
  );
  fs.writeFileSync(path.join(out, 'v', 'index.html'), archiveIndex(versions));
  fs.writeFileSync(path.join(out, '404.html'), notFoundPage(siteUrl));
  const siteLinks = assertSiteLinksResolve(html, out);

  return { out, current, versions, snapshots: snapshots.map((s) => s.version), extras, siteLinks };
}

function cli(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') opts.out = path.resolve(argv[++i]);
    else if (argv[i] === '--site-url') opts.siteUrl = argv[++i];
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  const r = build(opts);
  const arch = r.snapshots.length ? r.snapshots.map((v) => `v${v}`).join(', ') : 'none';
  console.log(`built v${r.current.version} (${r.current.date}) → ${path.relative(process.cwd(), r.out) || '.'}; archived: ${arch}; extra files: ${r.extras.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
