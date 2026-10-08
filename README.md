# Serbia Energy Learnings (alpha)

A static dashboard of what European think tanks and the Energy Community
Secretariat report about government successes and failures in energy, filtered
("guillotined") to the learnings Serbian government leaders could apply.

Open `docs/index.html` by double-click, or publish it with GitHub Pages
(Settings → Pages → Deploy from a branch → `/docs`).

## Rebuild in 3 commands

After adding documents (see below) and their learnings:

```bash
python scripts/download.py && python scripts/extract.py   # 1. fetch + extract text
python scripts/merge.py && python scripts/validate.py      # 2. guillotine + checks (must pass)
python scripts/build_site.py                               # 3. write docs/data.js
```

First-time setup (Python 3.11):

```bash
python3.11 -m venv .venv && source .venv/bin/activate   # or: uv venv --python 3.11 .venv
pip install -r requirements.txt
```

`data/raw/` and `data/extracted/` are git-ignored (the reports are not ours to
redistribute); a fresh clone recreates them with `download.py` and `extract.py`.

## Add a document

1. Add a row to `data/sources.csv`:
   `doc_id,source,title,year,url,notes` (`source` must be one of the six
   approved publishers in `CLAUDE.md`). Or drop a PDF into `data/raw/` named
   `<doc_id>.pdf` and add the same row so the metadata is known.
2. Run `download.py` and `extract.py`. You get `data/extracted/<doc_id>.txt`
   with `[[page N]]` markers and a new entry in `data/documents.json`.
3. Ask Claude Code to analyse the document: it reads the extracted text, fills
   `source_quality`, `programmes_analysed` and `countries_covered` in
   `documents.json`, and writes `data/learnings/<doc_id>.json` (schema in
   `CLAUDE.md`). Every learning needs a verbatim quote and the PDF page it is on.
   Check one file while working on it: `python scripts/validate.py --doc <doc_id>`.
4. Run `merge.py`, ask Claude Code to refresh `data/key_messages.json` from
   `data/learnings.json`, then `validate.py` and `build_site.py`.

## What each step does

| Step | Script | Output |
| --- | --- | --- |
| Download | `scripts/download.py` | `data/raw/<doc_id>.pdf` (failed URLs are logged and skipped) |
| Extract | `scripts/extract.py` | `data/extracted/<doc_id>.txt`, `data/documents.json` |
| Analyse | Claude Code (build time, not in the browser) | `data/learnings/<doc_id>.json` |
| Merge + guillotine | `scripts/merge.py` | `data/learnings.json` (kept + dropped) |
| Key messages | Claude Code | `data/key_messages.json` |
| Validate | `scripts/validate.py` | non-zero exit on any failure |
| Build | `scripts/build_site.py` | `docs/data.js` |

**Guillotine.** Each learning is tagged with the Serbia factors it matches:
`coal_power`, `state_utility`, `eu_accession`, `district_heating`,
`ifi_funding`. `merge.py` keeps it only if 2 or more match.

**Spend.** `spend_reported`, `currency` and `spend_year` come straight from the
source (null when not given, never estimated). `merge.py` converts to EUR with
`data/fx_rates.json` (ECB annual averages); if a rate is missing, `spend_eur`
stays null and the dashboard shows the reported figure only.

**Analysis conventions** used for this alpha (beyond `CLAUDE.md`):
- `eu_accession` is tagged when a case turns on a rule Serbia must also adopt or
  is bound by (EU/Energy Community energy and climate law, state aid, NECPs,
  ETS/MRV, CBAM, market coupling) or on an EU programme aimed at candidates. It
  is *not* tagged just because money came from an EU member-state fund Serbia
  cannot access (Just Transition Fund, Recovery Facility, cohesion funds).
- `ifi_funding` includes the EU Reform and Growth Facility for the Western
  Balkans (EU pre-accession money) as well as IPA, WBIF, EBRD, EIB, World Bank, KfW.
- `state_utility` needs a state-owned *power or gas* company; state coal-mining
  companies alone do not count.
- Regional programmes take the country where most of the activity is (e.g.
  ReDEWeB → RS, 11 of 17 cities); EU-wide policies use `EU`.
- Where a source gives a figure but no year, `spend_year` is the publication year.
- Figures given only as ranges (e.g. "EUR 5–10 billion") are left out of
  `spend_reported` and kept in the text.

**Validation** also checks that every number in a learning's `title`/`results`
and in each key message appears in the cited source text, and that each quote
is on the cited page (or runs onto the next).

**Text extraction.** PDFs are read in content-stream order so two-column pages
don't interleave. One file needs a character repair (`REPAIRS` in
`extract.py`): the CBAM tracker's font has no Unicode mapping for the full stop.

**Page numbers** are the page position in the PDF file (so links open with
`#page=N`), which can differ from the number printed on the page.

## Checking the site

```bash
pip install -r requirements-dev.txt && python -m playwright install chromium
python scripts/check_site.py
```

Takes screenshots at 1280 px and 390 px into `screenshots/`, fails on console
errors or horizontal scroll, and checks the chart, card, page PNG and CSV
exports each produce a file. The page loads Chart.js and html2canvas from
cdnjs, so it needs an internet connection.
# EnergyLessonsSerbia
