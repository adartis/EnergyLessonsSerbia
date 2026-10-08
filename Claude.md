# Serbia Energy Learnings – alpha

## Goal
Build a static dashboard of what European think tanks report about government
successes and failures in the energy sector, filtered ("guillotined") to the
learnings Serbian government leaders could apply.

- Target: a working alpha in about 1 hour, from 10–15 source documents.
- Output: one static HTML page hosted on GitHub Pages, with image export.
- This alpha is the first slice of a wider EU Government Innovation &
  Replicability Platform. Build it so later inputs drop into the same pipeline.

## Scope
**In (build now)**
- Energy sector only.
- Sources from the approved list below.
- Serbia as the only target country.
- Dashboard: key messages, learnings by theme, case cards, programmes analysed,
  spend by country, filters, PNG and CSV export.

**Later (do NOT build now)**
- Other sectors (water, agriculture, health, digital government, AI).
- Other target countries.
- Public procurement data (TED, national portals) and EU project databases
  (CORDIS, Interreg, LIFE, CEF).
- Clickable Europe map, side-by-side country comparison, "Could this work here?" panel.
- Automated scraping and paywalled sources.
- Live AI calls from the browser.

## Approved sources
Use only reports, briefs and evaluations published by:

| Source | Type |
| --- | --- |
| Bruegel | Think tank |
| E3G | Think tank |
| Agora Energiewende | Think tank |
| Ember | Think tank |
| CEE Bankwatch Network | NGO / watchdog |
| Energy Community Secretariat | Treaty body (Serbia is a Contracting Party) |

Prefer documents from the last 10 years. Skip anything behind a paywall.

## Folder layout
```
CLAUDE.md
data/
  raw/                 PDFs dropped in by the user (do not rename or edit)
  sources.csv          URLs to download (see schema)
  extracted/           <doc_id>.txt  plain text, one file per document
  documents.json       one record per source document
  learnings/           <doc_id>.json  learnings extracted from one document
  fx_rates.json        currency -> EUR rates by year, with the rate source
  learnings.json       merged, validated, guillotined learnings (build output)
  key_messages.json    synthesised key messages (build output)
scripts/
  download.py          fetch URLs in sources.csv into data/raw/
  extract.py           PDF/HTML -> data/extracted/*.txt with page markers
  merge.py             merge data/learnings/*.json, convert spend, apply guillotine
  validate.py          schema + evidence checks; non-zero exit on failure
  build_site.py        write docs/data.js from the build outputs
docs/                  GitHub Pages serves this folder (Settings > Pages > /docs)
  index.html
  app.js
  styles.css
  data.js              generated: window.DATA = {...}
requirements.txt
README.md
```
`docs/` (not `site/`) because GitHub Pages can serve `/docs` on a branch with no
build workflow. Data is shipped as `data.js` so the page also opens by
double-click from disk (a `fetch` of JSON fails on `file://`).

## Pipeline
Run in this order. Each step reads only the previous step's output.

1. **Download** – `python scripts/download.py` reads `data/sources.csv`, saves
   files to `data/raw/<doc_id>.<ext>`. Skip and log any URL that fails; never retry
   through a mirror or cache.
2. **Extract** – `python scripts/extract.py` turns every file in `data/raw/` into
   `data/extracted/<doc_id>.txt`. Insert `[[page N]]` markers so page numbers can
   be cited. PDFs: `pdfplumber`. HTML: `trafilatura` (fallback BeautifulSoup).
   Write/refresh the matching entry in `data/documents.json`.
3. **Analyse** – Claude Code reads each `data/extracted/<doc_id>.txt` (start with
   the executive summary and conclusions) and writes `data/learnings/<doc_id>.json`
   following the learning schema. Aim for 3–8 learnings per document. This is the
   AI step; it happens here, at build time, never in the browser.
4. **Merge + guillotine** – `python scripts/merge.py` merges all learnings,
   computes `spend_eur` from `fx_rates.json`, scores the Serbia factors, drops
   learnings that fail the guillotine, writes `data/learnings.json`.
5. **Synthesise** – Claude Code reads `data/learnings.json` and writes 5–7 key
   messages to `data/key_messages.json` (schema below).
6. **Validate** – `python scripts/validate.py` must pass (see Checks).
7. **Build** – `python scripts/build_site.py` writes `docs/data.js`.

Design rule for later: a new source type (scraper, procurement feed) only has to
produce `data/raw/` files or `data/extracted/*.txt` + a `documents.json` entry.
Nothing downstream changes.

## Schemas

### data/sources.csv
`doc_id,source,title,year,url,notes`
- `doc_id`: lowercase slug, e.g. `ember-2024-coal-phaseout-balkans`.

### data/documents.json (array)
```json
{
  "doc_id": "string",
  "source": "Bruegel | E3G | Agora Energiewende | Ember | CEE Bankwatch Network | Energy Community Secretariat",
  "title": "string",
  "year": 2024,
  "url": "https://...",
  "file": "data/raw/<doc_id>.pdf",
  "source_quality": "A | B | C",
  "programmes_analysed": ["string"],
  "countries_covered": ["ISO 3166-1 alpha-2, e.g. DE"]
}
```

### Learning record (data/learnings/<doc_id>.json is an array of these)
```json
{
  "id": "<doc_id>-01",
  "doc_id": "string",
  "title": "short headline, max 12 words",
  "country": "ISO alpha-2",
  "programme": "named programme or policy, or null",
  "theme": "one value from Fixed categories",
  "maturity": "emerging | piloted | scaled",
  "outcome": "success | mixed | failure",
  "problem": "1 sentence",
  "solution": "1–2 sentences: the intervention used",
  "implementer": "who ran it (ministry, agency, utility)",
  "delivery_partners": ["who delivered it"],
  "funding": "how it was funded, 1 sentence, or null",
  "spend_reported": 120000000,
  "currency": "EUR",
  "spend_year": 2021,
  "spend_scope": "public | total | unclear",
  "spend_eur": null,
  "results": "reported results with numbers, 1–2 sentences",
  "serbia_factors": ["coal_power", "state_utility"],
  "serbia_reason": "why it applies to Serbia, max 2 sentences",
  "adapt_needed": "what would need adapting in Serbia, 1 sentence",
  "blockers": "what may block replication in Serbia, 1 sentence",
  "source_url": "https://...",
  "page": 14,
  "quote": "verbatim supporting text, max 2 sentences",
  "source_quality": "A | B | C"
}
```
- `spend_reported`, `currency`, `spend_year` = null when the source gives no figure.
  Never estimate. The dashboard shows "not reported".
- `spend_eur` is filled by `merge.py` only, never by hand.

### data/key_messages.json (array)
```json
{ "id": "km-1", "message": "max 2 sentences", "learning_ids": ["..."] }
```
Every message must cite at least 2 learning ids.

### data/fx_rates.json
```json
{ "source": "ECB annual average reference rates", "rates": { "USD": { "2021": 0.845 } } }
```
EUR = 1.0. If a currency/year pair is missing, leave `spend_eur` null and log it.

## Serbia guillotine
Score each learning against five factors. **Keep a learning only if 2 or more
match.** Record the matched factor codes in `serbia_factors` and the reasoning
in `serbia_reason`.

| Code | Factor | Matches when the case involves… |
| --- | --- | --- |
| `coal_power` | Coal-heavy power system | lignite/coal phase-down, just transition, replacing coal capacity |
| `state_utility` | State-owned utility | reform, unbundling or investment through a state-owned power or gas company |
| `eu_accession` | EU candidate / Energy Community rules | transposing EU energy law, market coupling, Energy Community obligations, CBAM exposure |
| `district_heating` | District heating | municipal heat networks, fuel switching, heat tariffs |
| `ifi_funding` | EU pre-accession or development-bank funding | IPA, WBIF, EBRD, EIB, World Bank or KfW financing |

Failures and mixed outcomes are kept if they pass; they are often the most useful.

## Fixed categories
Use these values exactly. Do not invent new ones.

- **theme**: `renewables`, `efficiency`, `grids`, `coal_transition`,
  `district_heating`, `gas_security`, `market_reform`
- **maturity**: `emerging` (idea or early design), `piloted` (tested at limited
  scale), `scaled` (rolled out beyond pilot, national or multi-region)
- **outcome**: `success`, `mixed`, `failure` – as judged by the source, not by you
- **source_quality**:
  - `A` – official evaluation or study with published data and method
  - `B` – think-tank analysis that cites data
  - `C` – commentary, opinion or advocacy without data

## Dashboard (docs/index.html)
Plain HTML, CSS and JavaScript. No framework, no build step.

Libraries (pinned, from cdnjs):
- Chart.js 4.4.1 – `https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js`
- html2canvas 1.4.1 – `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js`

Page sections, top to bottom:
1. **Header** – title, "Learnings for Serbia's energy sector", as-of date,
   counts (documents, learnings kept, learnings dropped by the guillotine).
2. **Key messages** – 5–7 cards from `key_messages.json`; clicking one filters
   the cards below to its learnings.
3. **Filters** – theme, maturity, outcome, country, source, Serbia factor;
   free-text search. All filters combine.
4. **Charts**
   - Spend by country (horizontal bar, EUR, sorted high to low; footnote: number of
     learnings with no spend reported).
   - Learnings by theme, split by outcome (stacked bar).
   - Maturity mix (bar).
5. **Case cards** – grid; each card reads problem → solution → cost/delivery →
   implementers/partners → results → Serbia relevance (factors as chips, reason,
   adapt needed, blockers). Footer: source, year, page, link, quality badge.
6. **Programmes analysed** – table: programme, country, source document (link),
   number of learnings.
7. **Sources** – list of every document with link.

Export:
- "PNG" button on every chart (`chart.toBase64Image()`) and every card (html2canvas).
- "Export page as PNG" button (html2canvas on the main element).
- "Download CSV" of the currently filtered learnings.

Design: clean, readable, works at 360 px width, light and dark mode, colour never
the only carrier of meaning (outcome shown as text label too).

## Rules
- **Evidence**: every learning has `source_url`, `page` and a verbatim `quote`
  (max 2 sentences). No evidence = no learning.
- **No invented numbers**: figures in `results`, `spend_reported` and key messages
  must appear in the source text. If unsure, leave it out.
- **Copyright**: show short summaries and quotes with links. Never copy full
  report text or whole sections into the site.
- **No secrets**: no API keys or tokens anywhere in the repo or the site.
- **Raw data is read-only**: never edit files in `data/raw/`.
- Keep scripts small and readable; Python 3.11, dependencies in `requirements.txt`
  (`pdfplumber`, `trafilatura`, `beautifulsoup4`, `requests`).

## Checks (validate.py must enforce)
- Every learning matches the schema and uses only Fixed categories values.
- Every learning has `source_url`, `page`, `quote`, and ≥ 2 `serbia_factors`.
- Every `quote` string is found in `data/extracted/<doc_id>.txt` (whitespace-normalised).
- Every `doc_id` in learnings exists in `documents.json`.
- Every key message cites ≥ 2 existing learning ids.
- `spend_eur` is null wherever `spend_reported` is null.
- Print a summary: documents, learnings found, kept, dropped, spend not reported.

After building, open `docs/index.html` in headless Chromium (Playwright), take a
screenshot at 1280 px and 390 px, check there are no console errors and the
export buttons produce files.

## Time budget (alpha)
| Step | Minutes |
| --- | --- |
| Scaffold folders, scripts, requirements | 10 |
| Download + extract 10–15 documents | 10 |
| Analyse into learnings | 20 |
| Merge, guillotine, key messages, validate | 5 |
| Dashboard | 15 |

## Definition of done
- `validate.py` passes.
- `docs/index.html` opens on GitHub Pages and from disk with all sections filled.
- PNG export works for a chart, a card and the full page; CSV export works.
- README explains how to add documents and rebuild in 3 commands.
