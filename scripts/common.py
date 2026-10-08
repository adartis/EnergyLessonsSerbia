"""Paths, fixed categories and helpers shared by merge.py, validate.py and build_site.py."""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
EXTRACTED = DATA / "extracted"
LEARNINGS_DIR = DATA / "learnings"
DOCUMENTS = DATA / "documents.json"
FX_RATES = DATA / "fx_rates.json"
MERGED = DATA / "learnings.json"
KEY_MESSAGES = DATA / "key_messages.json"

SOURCES = ["Bruegel", "E3G", "Agora Energiewende", "Ember", "CEE Bankwatch Network", "Energy Community Secretariat"]
THEMES = ["renewables", "efficiency", "grids", "coal_transition", "district_heating", "gas_security", "market_reform"]
MATURITY = ["emerging", "piloted", "scaled"]
OUTCOMES = ["success", "mixed", "failure"]
QUALITY = ["A", "B", "C"]
SPEND_SCOPE = ["public", "total", "unclear"]
FACTORS = {
    "coal_power": "Coal-heavy power system",
    "state_utility": "State-owned utility",
    "eu_accession": "EU candidate / Energy Community rules",
    "district_heating": "District heating",
    "ifi_funding": "EU pre-accession or development-bank funding",
}
GUILLOTINE_MIN = 2  # keep a learning only if at least this many Serbia factors match

PAGE_MARKER = re.compile(r"\[\[page (\d+)\]\]")
_CHAR_MAP = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                           "–": "-", "—": "-", "­": None})


def normalise(text: str) -> str:
    """Whitespace-normalise for quote matching.

    Also unifies ligatures, curly quotes and dashes, and drops hyphens between letters so
    a word hyphenated across a line break ("estab-\nlished") matches "established".
    """
    text = unicodedata.normalize("NFKC", text).translate(_CHAR_MAP)
    text = re.sub(r"\s+", " ", text)
    return re.sub(r"(?<=[^\W\d_])- ?(?=[^\W\d_])", "", text).strip()


def pages(doc_id: str) -> dict[int, str]:
    """Extracted text of one document, split into {page number: text}."""
    parts = PAGE_MARKER.split((EXTRACTED / f"{doc_id}.txt").read_text(encoding="utf-8"))
    return {int(parts[i]): parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def raw_learnings() -> list[dict]:
    """Every learning found by the analysis step, before the guillotine."""
    out = []
    for f in sorted(LEARNINGS_DIR.glob("*.json")):
        out.extend(load(f))
    return out
