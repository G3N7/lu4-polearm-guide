// Shared helpers for reading the guide: paths, changelog/version parsing, links, snapshots.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SRC = path.join(ROOT, 'src', 'index.html');
export const VERSIONS_DIR = path.join(ROOT, 'versions');
export const SOURCES_MD = path.join(ROOT, 'sources.md');
export const DEFAULT_SITE_URL = 'https://g3n7.github.io/lu4-polearm-guide/';

export function readGuide(file = SRC) {
  return fs.readFileSync(file, 'utf8');
}

export function load(html) {
  return cheerio.load(html);
}

const ENTRY_RE = /^(\d{4}-\d{2}-\d{2}) v(\d+)$/;

/**
 * Parse the changelog list (newest first). Every <li> must start with
 * <b>YYYY-MM-DD vN</b> followed by a dash and a summary.
 * @returns {{date: string, version: number, summary: string}[]}
 */
export function parseChangelog(html) {
  const $ = load(html);
  const items = $('#changelog ul li');
  if (!items.length) throw new Error('changelog list not found (#changelog ul li)');
  return items
    .map((i, li) => {
      const b = $(li).children('b').first();
      const label = b.text().trim();
      const m = ENTRY_RE.exec(label);
      if (!m) {
        throw new Error(
          `changelog entry ${i + 1} must start with <b>YYYY-MM-DD vN</b>, got: "${label || $(li).text().slice(0, 40)}"`,
        );
      }
      const summary = $(li)
        .text()
        .replace(label, '')
        .replace(/\s+/g, ' ')
        .replace(/^\s*[—–-]\s*/, '')
        .trim();
      return { date: m[1], version: Number(m[2]), summary };
    })
    .get();
}

/** The newest changelog entry: the version the page currently is. */
export function currentVersion(html) {
  return parseChangelog(html)[0];
}

const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };

/** "Last updated: 10 Sep 2026" (header chip) → "2026-09-10". */
export function lastUpdated(html) {
  const $ = load(html);
  const text = $('header.site .meta .updated').text().replace(/\s+/g, ' ').trim();
  const m = /^Last updated: (\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(text);
  if (!m) throw new Error(`unexpected "Last updated" chip: "${text}"`);
  const month = MONTHS[m[2]];
  if (!month) throw new Error(`unknown month in "Last updated" chip: ${m[2]}`);
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

export function isExternal(href) {
  return /^https?:\/\//i.test(href);
}

/**
 * Sections of the guide in document order.
 * @returns {{id: string, num: string, title: string}[]}
 */
export function sections(html) {
  const $ = load(html);
  return $('main > section.block')
    .map((_, s) => ({
      id: $(s).attr('id') || '',
      num: $(s).find('> details > summary .num').first().text().trim(),
      title: $(s).find('> details > summary h2').first().text().replace(/\s+/g, ' ').trim(),
    }))
    .get();
}

/**
 * Every link in the page with its text and the section it lives in.
 * @returns {{href: string, text: string, section: string}[]}
 */
export function extractLinks(html) {
  const $ = load(html);
  const out = [];
  $('a[href]').each((_, a) => {
    const el = $(a);
    let section = el.closest('section.block').attr('id');
    if (!section) section = el.closest('header.site').length ? 'header' : el.closest('footer').length ? 'footer' : 'page';
    out.push({ href: el.attr('href') || '', text: el.text().replace(/\s+/g, ' ').trim(), section });
  });
  return out;
}

/** Archived snapshots on disk: versions/vN.html → [{version, file}] ascending. */
export function listSnapshots(dir = VERSIONS_DIR) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^v\d+\.html$/.test(f))
    .map((f) => ({ version: Number(f.slice(1, -5)), file: path.join(dir, f) }))
    .sort((a, b) => a.version - b.version);
}

export function snapshotPath(version, dir = VERSIONS_DIR) {
  return path.join(dir, `v${version}.html`);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
