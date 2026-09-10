# LU4 Polearm Guide

Warlord and AoE-group handbook for **Liberta Ultimata 4** (LU4, «Луч»), published at
**https://g3n7.github.io/lu4-polearm-guide/**.

The guide is a single, self-contained HTML page (`src/index.html`): no framework, no build-time
templating, vanilla CSS and JS. This repository adds what a page needs to live on GitHub Pages:
a versioned archive, a test suite, and a publishing pipeline.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.html` | The guide. The only file you edit to change content. |
| `versions/vN.html` | Frozen snapshots, one per published version. Published at `/v/N/`. |
| `sources.md` | Every external link in the guide, grouped by site. Generated. |
| `scripts/` | `build.mjs` (site → `dist/`), `snapshot.mjs`, `sources.mjs`, `serve.mjs`, `guide.mjs` (shared parsing). |
| `tests/` | Unit tests (`node --test` + cheerio): page structure, versioning rules, build output, server. |
| `e2e/` | Playwright tests against the built site: search, TOC, expand/collapse, hash links, phone layout, archive pages. |
| `.github/workflows/pages.yml` | Test → build → publish to GitHub Pages. |
| `.github/workflows/link-check.yml` | Weekly external-link report (never blocks publishing). |

The built site (`dist/`, not committed) contains:

- `index.html` — the current guide, byte-for-byte `src/index.html`
- `v/N/index.html` — each archived version with an "archived" banner and `noindex`
- `v/index.html` — list of all versions; `versions.json` — the same list as data
- `404.html`, `.nojekyll`

## Versions

The page's own **Changelog** section is the version log. Its newest entry, written as
`<b>YYYY-MM-DD vN</b> — summary`, defines the current version, and the header's
"Last updated" chip must carry the same date. Every version published from this repository is
archived under `versions/vN.html` and served at `/v/N/`. Versions v1–v8 predate the repository and
are listed but not archived.

## Editing the guide

1. Edit `src/index.html`.
2. In the Changelog section add a new first entry with the next version number, and update
   "Last updated" in the header to the same date.
3. Run `npm run snapshot` to archive the new version, and `npm run sources` if links changed.
4. Run `npm test`.
5. Commit and push. Pushing to the default branch publishes the site.

`npm test` fails if the snapshot or `sources.md` are stale, if the changelog and header disagree,
or if the HTML breaks one of the invariants the layout relies on (for example every responsive-table
cell needs a `data-l` label for the phone view).

## Local development

```sh
npm ci
npm start              # build and serve http://127.0.0.1:4173/
npm run lint           # html-validate
npm run test:unit      # node --test
npm run test:e2e       # Playwright (first time: npx playwright install chromium)
npm test               # all of the above
npm run check          # snapshot + sources.md are current
```

Node 22 or newer (`.nvmrc`).

## Publishing pipeline

`pages.yml` runs on every push and pull request:

1. **test** — `npm run check`, `npm run lint`, unit tests, Playwright tests (report uploaded on failure).
2. **build** — `npm run build`, uploaded as the Pages artifact.
3. **deploy** — only for pushes to the repository's default branch. Deploys the artifact with
   `actions/deploy-pages`. The `github-pages` environment URL points at the live site.

The deploy step tries to enable GitHub Pages automatically the first time it runs. If the first
deploy fails with a permissions error, enable it once by hand: **Settings → Pages → Build and
deployment → Source: GitHub Actions**, then re-run the workflow.

The site is served from a project path (`/lu4-polearm-guide/`), so links inside the page are
relative or fragment links; tests reject root-relative URLs.

## Credits

Unofficial, fan-made. Not affiliated with MasterWork / E-Global. All claims link to their source
(see `sources.md`); summaries are paraphrased, short quotes only.
