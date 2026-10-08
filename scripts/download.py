"""Fetch every URL in data/sources.csv into data/raw/<doc_id>.<ext>.

Files that already exist are skipped. A URL that fails is logged and skipped;
we never retry through a mirror or cache.
"""
import csv
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "data" / "sources.csv"
RAW = ROOT / "data" / "raw"
HEADERS = {"User-Agent": "Mozilla/5.0 (research; serbia-energy-learnings alpha)"}


def extension(response: requests.Response) -> str:
    ctype = response.headers.get("Content-Type", "").lower()
    if "pdf" in ctype or response.content[:5] == b"%PDF-":
        return "pdf"
    if "html" in ctype:
        return "html"
    return Path(response.url.split("?")[0]).suffix.lstrip(".") or "bin"


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    failed = []
    with SOURCES.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for row in rows:
        doc_id = row["doc_id"].strip()
        if list(RAW.glob(f"{doc_id}.*")):
            print(f"skip   {doc_id} (already downloaded)")
            continue
        try:
            r = requests.get(row["url"], headers=HEADERS, timeout=90)
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"FAILED {doc_id}: {e}")
            failed.append(doc_id)
            continue
        path = RAW / f"{doc_id}.{extension(r)}"
        path.write_bytes(r.content)
        print(f"saved  {path.relative_to(ROOT)} ({len(r.content) // 1024} KB)")
    print(f"\n{len(rows) - len(failed)}/{len(rows)} available, {len(failed)} failed: {failed}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
