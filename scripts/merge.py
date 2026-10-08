"""Merge data/learnings/*.json, convert spend to EUR, apply the Serbia guillotine.

Writes data/learnings.json:
  {"as_of", "counts", "learnings": [kept...], "dropped": [{id, doc_id, title, serbia_factors}]}
"""
import sys
from datetime import date

from common import (FACTORS, FX_RATES, GUILLOTINE_MIN, MERGED, DOCUMENTS,
                    load, raw_learnings, save)


def to_eur(learning: dict, rates: dict) -> float | None:
    amount, cur, year = learning.get("spend_reported"), learning.get("currency"), learning.get("spend_year")
    if amount is None:
        return None
    if cur == "EUR":
        return round(amount)
    rate = rates.get(cur, {}).get(str(year))
    if rate is None:
        print(f"  no FX rate for {cur} {year} ({learning['id']}); spend_eur left null")
        return None
    return round(amount * rate)


def main() -> int:
    docs = {d["doc_id"]: d for d in load(DOCUMENTS)}
    rates = load(FX_RATES)["rates"]
    found = raw_learnings()
    kept, dropped = [], []

    for item in found:
        doc = docs.get(item["doc_id"], {})
        item.setdefault("source_url", doc.get("url"))
        item.setdefault("source_quality", doc.get("source_quality"))
        unknown = [f for f in item.get("serbia_factors", []) if f not in FACTORS]
        if unknown:
            print(f"  {item['id']}: ignoring unknown factor codes {unknown}")
        # Score = number of distinct valid factors, kept in the canonical order.
        item["serbia_factors"] = [f for f in FACTORS if f in item.get("serbia_factors", [])]
        item["spend_eur"] = to_eur(item, rates)
        if len(item["serbia_factors"]) >= GUILLOTINE_MIN:
            kept.append(item)
        else:
            dropped.append({k: item[k] for k in ("id", "doc_id", "title", "serbia_factors")})

    counts = {
        "documents": len(docs),
        "found": len(found),
        "kept": len(kept),
        "dropped": len(dropped),
        "spend_not_reported": sum(1 for l in kept if l["spend_eur"] is None),
    }
    save(MERGED, {"as_of": date.today().isoformat(), "counts": counts, "learnings": kept, "dropped": dropped})
    print(f"learnings.json: found {counts['found']}, kept {counts['kept']}, dropped {counts['dropped']} "
          f"(guillotine: >= {GUILLOTINE_MIN} Serbia factors)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
