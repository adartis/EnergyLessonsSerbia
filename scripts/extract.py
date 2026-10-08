"""Turn every file in data/raw/ into data/extracted/<doc_id>.txt with [[page N]] markers.

PDF pages are numbered by their position in the file (1 = first page of the PDF),
so a learning's `page` opens correctly with <url>#page=N. HTML has one page.

Also writes/refreshes the matching entry in data/documents.json. Metadata comes
from data/sources.csv; fields filled in by the analysis step (source_quality,
programmes_analysed, countries_covered) are preserved.
"""
import csv
import json
import sys
from pathlib import Path

import pdfplumber
import trafilatura
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "extracted"
SOURCES = ROOT / "data" / "sources.csv"
DOCUMENTS = ROOT / "data" / "documents.json"

# Per-document character repairs for PDFs whose fonts lack a Unicode mapping.
# The raw file is never touched; only the extracted text is corrected.
REPAIRS = {
    "enc-2025-cbam-readiness-tracker": {"\ufffd": "."},  # full stop glyph has no ToUnicode entry
}


def pdf_text(path: Path) -> str:
    parts = []
    with pdfplumber.open(path) as pdf:
        for n, page in enumerate(pdf.pages, start=1):
            # use_text_flow follows the PDF's reading order, so two-column pages don't interleave.
            parts.append(f"[[page {n}]]\n{page.extract_text(use_text_flow=True) or ''}")
    return "\n\n".join(parts)


def html_text(path: Path) -> str:
    html = path.read_text(encoding="utf-8", errors="replace")
    text = trafilatura.extract(html, include_tables=True, favor_recall=True)
    if not text or len(text) < 2000:
        text = BeautifulSoup(html, "html.parser").get_text("\n", strip=True)
    return f"[[page 1]]\n{text}"


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    sources = {}
    if SOURCES.exists():
        with SOURCES.open(newline="", encoding="utf-8") as f:
            sources = {r["doc_id"].strip(): r for r in csv.DictReader(f)}
    docs = {d["doc_id"]: d for d in json.loads(DOCUMENTS.read_text())} if DOCUMENTS.exists() else {}

    for path in sorted(RAW.iterdir()):
        if path.name.startswith("."):
            continue
        doc_id, ext = path.stem, path.suffix.lower()
        if ext == ".pdf":
            text = pdf_text(path)
        elif ext in (".html", ".htm"):
            text = html_text(path)
        else:
            print(f"skip   {path.name} (unsupported type)")
            continue
        for bad, good in REPAIRS.get(doc_id, {}).items():
            text = text.replace(bad, good)
        (OUT / f"{doc_id}.txt").write_text(text, encoding="utf-8")
        pages = text.count("[[page ")
        print(f"wrote  data/extracted/{doc_id}.txt ({pages} pages, {len(text) // 1000}k chars)")

        src = sources.get(doc_id, {})
        old = docs.get(doc_id, {})
        docs[doc_id] = {
            "doc_id": doc_id,
            "source": src.get("source") or old.get("source"),
            "title": src.get("title") or old.get("title") or doc_id,
            "year": int(src["year"]) if src.get("year") else old.get("year"),
            "url": src.get("url") or old.get("url"),
            "file": str(path.relative_to(ROOT)),
            "source_quality": old.get("source_quality"),
            "programmes_analysed": old.get("programmes_analysed", []),
            "countries_covered": old.get("countries_covered", []),
        }
        if not src:
            print(f"  note: {doc_id} not in sources.csv; fill source/title/year/url in documents.json")

    DOCUMENTS.write_text(json.dumps(sorted(docs.values(), key=lambda d: d["doc_id"]), indent=2, ensure_ascii=False) + "\n")
    print(f"\ndocuments.json: {len(docs)} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
