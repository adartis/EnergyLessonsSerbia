"""Schema and evidence checks. Exits non-zero if any check fails."""
import re
import sys

from common import (EXTRACTED, FACTORS, GUILLOTINE_MIN, KEY_MESSAGES, LEARNINGS_DIR, MATURITY, MERGED,
                    OUTCOMES, QUALITY, SOURCES, SPEND_SCOPE, THEMES, DOCUMENTS, load, normalise, pages,
                    raw_learnings)

TEXT_FIELDS = ["title", "problem", "solution", "implementer", "results",
               "serbia_reason", "adapt_needed", "blockers", "quote", "source_url"]
errors, warnings = [], []


def sentences(text: str) -> int:
    """Rough sentence count: terminators followed by a space and a capital letter."""
    return len(re.findall(r"[.!?][\"')\]]?\s+(?=[A-Z])", text.strip())) + 1


NUMBER = re.compile(r"(?<![\w.])\d+(?:[.,]\d+)*")  # skips codes such as SO2, CO2, B3
digits = lambda token: re.sub(r"\D", "", token)
_doc_numbers: dict = {}


def doc_numbers(doc_id: str) -> set:
    """Every number in a document, reduced to its digits (so 41.36 matches 41,36 and 177 756)."""
    if doc_id not in _doc_numbers:
        text = " ".join(pages(doc_id).values())
        tokens = re.findall(r"\d+(?:[.,]\d+)*", text)
        nums = {digits(t) for t in tokens}
        nums |= {digits(re.split(r"[.,]", t)[0]) for t in tokens}  # "2040.13": year + footnote marker
        nums |= {digits(t) for t in re.findall(r"\d{1,3}(?: \d{3})+(?:[.,]\d+)?", text)}  # "1 022,8"
        _doc_numbers[doc_id] = nums
    return _doc_numbers[doc_id]


def unsourced(text: str, doc_ids: list) -> list:
    """Numbers in text that appear in none of the given documents ("No invented numbers")."""
    known = set().union(*(doc_numbers(d) for d in doc_ids)) if doc_ids else set()
    return [t for t in NUMBER.findall(text or "") if digits(t) not in known]


def check_learning(l: dict, docs: dict, page_cache: dict) -> None:
    lid = l.get("id", "<no id>")
    err = lambda msg: errors.append(f"{lid}: {msg}")
    for f in TEXT_FIELDS:
        if not isinstance(l.get(f), str) or not l[f].strip():
            err(f"missing or empty '{f}'")
    if l.get("doc_id") not in docs:
        err(f"doc_id '{l.get('doc_id')}' not in documents.json")
        return
    if not re.fullmatch(re.escape(l["doc_id"]) + r"-\d{2}", lid):
        err("id must be '<doc_id>-NN'")
    if len(l.get("title", "").split()) > 12:
        err("title longer than 12 words")
    if not re.fullmatch(r"[A-Z]{2}", str(l.get("country"))):
        err(f"country '{l.get('country')}' is not ISO alpha-2")
    for field, allowed in [("theme", THEMES), ("maturity", MATURITY), ("outcome", OUTCOMES),
                           ("source_quality", QUALITY)]:
        if l.get(field) not in allowed:
            err(f"{field} '{l.get(field)}' not in {allowed}")
    if l.get("programme") is not None and not isinstance(l["programme"], str):
        err("programme must be a string or null")
    if l.get("funding") is not None and not isinstance(l["funding"], str):
        err("funding must be a string or null")
    if not isinstance(l.get("delivery_partners"), list):
        err("delivery_partners must be a list")
    bad = [f for f in l.get("serbia_factors", []) if f not in FACTORS]
    if bad or not isinstance(l.get("serbia_factors"), list):
        err(f"unknown serbia_factors {bad}")

    # Spend: all-or-nothing, never estimated, spend_eur only where spend_reported exists.
    amount = l.get("spend_reported")
    if amount is None:
        if l.get("currency") is not None or l.get("spend_year") is not None:
            err("currency/spend_year must be null when spend_reported is null")
        if l.get("spend_eur") is not None:
            err("spend_eur must be null when spend_reported is null")
        if l.get("spend_scope") not in SPEND_SCOPE + [None]:
            err(f"spend_scope '{l.get('spend_scope')}' not in {SPEND_SCOPE}")
    else:
        if not isinstance(amount, (int, float)) or amount <= 0:
            err("spend_reported must be a positive number")
        if not re.fullmatch(r"[A-Z]{3}", str(l.get("currency"))):
            err("currency must be an ISO 4217 code when spend is reported")
        if not isinstance(l.get("spend_year"), int):
            err("spend_year must be an integer when spend is reported")
        if l.get("spend_scope") not in SPEND_SCOPE:
            err(f"spend_scope '{l.get('spend_scope')}' not in {SPEND_SCOPE}")

    # Evidence: the quote must appear in the extracted text, on the cited page (or running onto the next).
    if l.get("source_url") != docs[l["doc_id"]].get("url"):
        warnings.append(f"{lid}: source_url differs from documents.json url")
    if sentences(l.get("quote", "")) > 2:
        warnings.append(f"{lid}: quote may be longer than 2 sentences")
    doc_pages = page_cache.setdefault(l["doc_id"], pages(l["doc_id"]))
    page, quote = l.get("page"), normalise(l.get("quote", ""))
    if not isinstance(page, int) or page not in doc_pages:
        err(f"page {page} does not exist in the extracted text")
        return
    full = normalise(" ".join(doc_pages.values()))
    near = normalise(doc_pages[page] + " " + doc_pages.get(page + 1, ""))
    for field in ("title", "results"):
        missing = unsourced(l.get(field), [l["doc_id"]])
        if missing:
            err(f"numbers in {field} not found in source text: {missing}")
    if quote not in full:
        err("quote not found in extracted text")
    elif quote not in near:
        err(f"quote found in document but not on page {page}")


def check_one(doc_id: str, docs: dict) -> int:
    """`validate.py --doc <doc_id>`: check a single learnings file while analysing."""
    found = load(LEARNINGS_DIR / f"{doc_id}.json")
    for l in found:
        check_learning(l, docs, {})
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"ERROR:   {e}")
    passing = sum(1 for l in found if len(set(l.get("serbia_factors", [])) & set(FACTORS)) >= GUILLOTINE_MIN)
    print(f"{doc_id}: {len(found)} learnings, {passing} would pass the guillotine, {len(errors)} errors")
    return 1 if errors else 0


def main() -> int:
    docs = {d["doc_id"]: d for d in load(DOCUMENTS)}
    if len(sys.argv) == 3 and sys.argv[1] == "--doc":
        return check_one(sys.argv[2], docs)
    for d in docs.values():
        if d.get("source") not in SOURCES:
            errors.append(f"document {d['doc_id']}: source '{d.get('source')}' not approved")
        if d.get("source_quality") not in QUALITY:
            errors.append(f"document {d['doc_id']}: source_quality '{d.get('source_quality')}' not in {QUALITY}")
        if not (EXTRACTED / f"{d['doc_id']}.txt").exists():
            errors.append(f"document {d['doc_id']}: no extracted text")

    found = raw_learnings()
    page_cache: dict = {}
    for l in found:
        check_learning(l, docs, page_cache)
    ids = [l.get("id") for l in found]
    errors.extend(f"duplicate learning id {i}" for i in set(ids) if ids.count(i) > 1)

    merged = load(MERGED)
    kept = merged["learnings"]
    kept_ids = {l["id"] for l in kept}
    for l in kept:
        if len(l["serbia_factors"]) < GUILLOTINE_MIN:
            errors.append(f"{l['id']}: kept with fewer than {GUILLOTINE_MIN} serbia_factors")
        if l.get("spend_reported") is None and l.get("spend_eur") is not None:
            errors.append(f"{l['id']}: spend_eur set without spend_reported")
    if len(kept) + len(merged["dropped"]) != len(found):
        errors.append("learnings.json is stale: run merge.py")

    messages = load(KEY_MESSAGES)
    if not 5 <= len(messages) <= 7:
        errors.append(f"expected 5-7 key messages, found {len(messages)}")
    for m in messages:
        cited = m.get("learning_ids", [])
        missing = [i for i in cited if i not in kept_ids]
        if len(set(cited)) < 2:
            errors.append(f"{m.get('id')}: cites fewer than 2 learnings")
        if missing:
            errors.append(f"{m.get('id')}: cites unknown or dropped learnings {missing}")
        cited_docs = sorted({l["doc_id"] for l in kept if l["id"] in cited})
        missing_nums = unsourced(m.get("message"), cited_docs)
        if missing_nums:
            errors.append(f"{m.get('id')}: numbers not found in the cited sources: {missing_nums}")
        if sentences(m.get("message", "")) > 2:
            warnings.append(f"{m.get('id')}: message may be longer than 2 sentences")

    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"ERROR:   {e}")
    print(f"\nDocuments:            {len(docs)}")
    print(f"Learnings found:      {len(found)}")
    print(f"Kept (>= {GUILLOTINE_MIN} factors):   {len(kept)}")
    print(f"Dropped by guillotine: {len(merged['dropped'])}")
    print(f"Spend not reported:   {sum(1 for l in kept if l.get('spend_reported') is None)} of {len(kept)} kept")
    print(f"Key messages:         {len(messages)}")
    print(f"\n{'FAILED' if errors else 'PASSED'}: {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
