# LU4 Polearm Guide

Warlord and AoE-group handbook for **Liberta Ultimata 4** (LU4, «Луч»), published at
**https://g3n7.github.io/lu4-polearm-guide/**.

The guide is a single, self-contained HTML page (`src/index.html`): no framework, no build-time
templating, vanilla CSS and JS. This repository adds what a page needs to live on GitHub Pages:
a versioned archive, a test suite, and a publishing pipeline.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.html` | The guide. The only file you edit to change the guide. |
| `src/costs/index.html` | The Kit Ledger: what a polearm kit costs per grade and slot. Served at `/costs/`, linked from §6. Not versioned. |
| `versions/vN.html` | Frozen snapshots, one per version published from here. Served at `/v/N/`. |
| `sources.md` | Every external link in the guide, grouped by site. Generated. |
| `scripts/` | `build.mjs` (site → `dist/`), `snapshot.mjs`, `sources.mjs`, `serve.mjs`, `guide.mjs` (shared parsing). |
| `tests/` | Unit tests (`node --test` + cheerio): page structure, versioning rules, build output, scripts, server. |
| `e2e/` | Playwright tests against the built site under `/lu4-polearm-guide/`: search, TOC, expand/collapse, hash links, phone layout, archive pages. |
| `.github/workflows/pages.yml` | Test → build → publish to GitHub Pages. |
| `.github/workflows/link-check.yml` | External-link report, weekly and on content changes (never blocks publishing). |

The built site (`dist/`, not committed) contains:

- `index.html` — the current guide, byte-for-byte `src/index.html`
- `costs/index.html` and any other file under `src/`, copied as-is
- `v/N/index.html` — each archived version with an "archived" banner, a chip in the sticky
  table of contents, and `noindex`
- `v/index.html` — list of all versions; `versions.json` — the same list as data
- `404.html`, `.nojekyll`

## Versions

The page's own **Changelog** section is the version log. Its newest entry, written as
`<b>YYYY-MM-DD vN</b> — summary`, defines the current version. The same version and date appear
in the header chips ("Last updated", "vN") and in the footer; the tests fail if they disagree.

Every version published from this repository is archived as `versions/vN.html` and served at
`/v/N/`. The first one is v9. Versions v1–v8 were published before the repository existed, so
they appear in the version list from the changelog but have no archived copy.

**Backfilling an old version.** If you still have the HTML of an earlier version, save it as
`versions/vN.html` and run `npm test`. The build only needs the file to have one `<title>`, one
`</head>`, one `<body>`, a sticky table of contents (`nav.toc` with a `.scroller`) and a
changelog whose newest entry reads `vN`. The archive page gets its banner and chip at build time.

## Editing the guide

1. Edit `src/index.html`.
2. Set the next version number and date in three places: the header chips ("Last updated: …"
   and "vN"), the footer ("vN · date"), and a new first entry in the Changelog section.
3. Run `npm run snapshot` to archive the new version, and `npm run sources` if links changed.
4. Run `npm test`.
5. Commit and push. Pushing to the default branch publishes the site.

The build fails if the guide links to a page that is not in `src/` (for example `costs/`).
`npm test` fails if the snapshot or `sources.md` are stale, if the version or date differ
between header, footer and changelog, or if the HTML breaks one of the invariants the layout
relies on (for example every responsive-table cell needs a `data-l` label for the phone view).
`npm run snapshot` refuses to overwrite a differing snapshot of the same version; bump the version,
or pass `--force` for a version that was never published.

## Local development

```sh
npm ci
npx playwright install chromium   # once, for the browser tests
npm start              # build and serve http://127.0.0.1:4173/
npm run lint           # html-validate
npm run test:unit      # node --test
npm run test:e2e       # Playwright, against http://127.0.0.1:4174/lu4-polearm-guide/
npm test               # lint + unit + e2e
npm run check          # snapshot and sources.md are current
```

Node 22 or newer (`.nvmrc`). `node scripts/serve.mjs --pages-path` serves the build under the
same `/lu4-polearm-guide/` prefix GitHub Pages uses.

## Publishing pipeline

`pages.yml` runs on every push (and on pull requests from forks):

1. **test** — `npm run check`, `npm run lint`, unit tests, Playwright tests (report uploaded on failure).
2. **build** — `npm run build`, uploaded as the Pages artifact.
3. **deploy** — for pushes to the repository's **default branch**, and for manual
   "Run workflow" runs (which publish whatever branch they are started from). Uses
   `actions/deploy-pages`; the `github-pages` environment URL points at the live site.

**First deploy.** GitHub Pages has to be switched on once by hand, because the workflow token
is not allowed to do it:

1. Open **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**.
2. Open **Actions → Test & publish → Run workflow** on the default branch (or push a commit).
3. The run's **Publish to GitHub Pages** job prints the site URL.

**Default branch.** The deploy job follows whatever branch is set as the repository's default
(Settings → General → Default branch). The repository was created from the branch
`claude/focused-galileo-xwig8c`, which GitHub made the default because it was the first push. To
publish from `main` instead: create `main` from that branch, make it the default in Settings, and
then check **Settings → Environments → github-pages → Deployment branches** allows `main` (GitHub
pins that rule to the default branch at the time Pages was enabled).

The site is served from a project path (`/lu4-polearm-guide/`), so links inside the page are
relative or fragment links; the tests reject root-relative URLs and run the browser suite under
that same prefix.

`link-check.yml` runs lychee over the page's links weekly, on manual dispatch, and on pushes that
change `src/index.html`; the report is in the run summary. GitHub disables scheduled workflows in
repositories with no commits for 60 days; a manual run re-enables it.

## Credits

Unofficial, fan-made. Not affiliated with MasterWork / E-Global. All claims link to their source
(see `sources.md`); summaries are paraphrased, short quotes only.
