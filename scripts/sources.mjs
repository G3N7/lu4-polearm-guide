// Generate sources.md: every external link in the guide grouped by site, with the
// link text and the section each link appears in. `--check` exits 1 if the committed
// file is out of date (used by the tests and CI).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, SOURCES_MD, readGuide, extractLinks, isExternal, sections } from './guide.mjs';

const HOST_LABELS = {
  'mw5.community': 'official forum',
  't.me': 'Telegram',
  'guide.lu4lab.com': 'lu4lab fan database',
  'lu4db.ru': 'lu4db fan database',
  'mw2.wiki': 'MasterWork wiki',
  'mw2.global': 'MasterWork site',
  'l2gm.com': 'news',
  'l2spoilway.ru': 'Bounty Hunter blog',
  'github.com': 'this repository',
};

function mdEscape(s) {
  return String(s).replace(/[\\`*_[\]<>]/g, (c) => `\\${c}`);
}

export function renderSources(html) {
  const secs = new Map(sections(html).map((s) => [s.id, `§${s.num} ${s.title}`]));
  const label = (id) => secs.get(id) || id;
  const links = extractLinks(html).filter((l) => isExternal(l.href));

  // Group by host, then by URL; keep first-appearance order inside each group.
  const hosts = new Map();
  for (const l of links) {
    const u = new URL(l.href);
    const host = u.hostname.replace(/^www\./, '');
    if (!hosts.has(host)) hosts.set(host, new Map());
    const urls = hosts.get(host);
    if (!urls.has(l.href)) urls.set(l.href, { texts: [], sections: [], count: 0 });
    const e = urls.get(l.href);
    e.count++;
    if (l.text && !e.texts.includes(l.text)) e.texts.push(l.text);
    if (!e.sections.includes(l.section)) e.sections.push(l.section);
  }
  const hostList = [...hosts.entries()].sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));
  const unique = hostList.reduce((n, [, m]) => n + m.size, 0);

  const out = [];
  out.push('# Sources');
  out.push('');
  out.push('Generated from `src/index.html` by `npm run sources` — do not edit by hand.');
  out.push(`Every external link in the guide, grouped by site: ${unique} unique URLs across ${links.length} links.`);
  out.push('Claims in the guide are paraphrased from these pages; short quotes only.');
  out.push('');
  for (const [host, urls] of hostList) {
    const desc = HOST_LABELS[host] ? ` (${HOST_LABELS[host]})` : '';
    out.push(`## ${host}${desc} — ${urls.size} URL${urls.size === 1 ? '' : 's'}`);
    out.push('');
    for (const [href, e] of urls) {
      const text = e.texts.length ? mdEscape(e.texts.join(' / ')) : mdEscape(href);
      const where = e.sections.map(label).map(mdEscape).join(', ');
      out.push(`- [${text}](${href}) — ${where}${e.count > 1 ? ` (×${e.count})` : ''}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function cli(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((a) => a !== '--check');
  if (unknown.length) throw new Error(`unknown argument(s): ${unknown.join(' ')}`);
  const md = renderSources(readGuide());
  const rel = path.relative(ROOT, SOURCES_MD);
  const existing = fs.existsSync(SOURCES_MD) ? fs.readFileSync(SOURCES_MD, 'utf8') : null;
  if (existing === md) {
    console.log(`${rel} is up to date`);
    return;
  }
  if (check) {
    console.error(`${rel} is out of date — run "npm run sources" and commit the result`);
    process.exit(1);
  }
  fs.writeFileSync(SOURCES_MD, md);
  console.log(`${existing === null ? 'wrote' : 'updated'} ${rel}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) cli(process.argv.slice(2));
