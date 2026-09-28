"""Normalization + fuzzy matching helpers (rubric section 0).

Phone: digits only, drop leading 1.
Address: lowercase, expand St/Street, Ave/Avenue, Ste/Suite, strip punctuation.
Business name: lowercase, strip LLC/Inc/Co, '&' -> 'and', strip punctuation.
Fuzzy name match: Jaro-Winkler via rapidfuzz.
"""
import re
import string

from rapidfuzz.distance import JaroWinkler

from . import config

_ABBR = {
    r"\bst\.?\b": "street",
    r"\bave\.?\b": "avenue",
    r"\bste\.?\b": "suite",
    r"\bblvd\.?\b": "boulevard",
    r"\brd\.?\b": "road",
    r"\bdr\.?\b": "drive",
    r"\bln\.?\b": "lane",
    r"\bct\.?\b": "court",
    r"\bpkwy\.?\b": "parkway",
}
_ENTITY_SUFFIX = re.compile(
    r"\b(llc|inc|incorporated|corp|corporation|co|company|ltd|pllc|pa|llp)\.?$", re.I
)
_PUNCT_TABLE = str.maketrans("", "", string.punctuation)


def normalize_phone(raw):
    """Digits only, drop a leading US country-code 1. Returns '' if nothing usable."""
    if not raw:
        return ""
    digits = re.sub(r"\D", "", str(raw))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) >= 7 else ""


def normalize_address(raw):
    if not raw:
        return ""
    s = str(raw).lower()
    for pat, repl in _ABBR.items():
        s = re.sub(pat, repl, s)
    s = s.translate(_PUNCT_TABLE)
    return re.sub(r"\s+", " ", s).strip()


def normalize_name(raw):
    if not raw:
        return ""
    s = str(raw).lower().replace("&", " and ")
    s = _ENTITY_SUFFIX.sub("", s).strip()
    s = s.translate(_PUNCT_TABLE)
    return re.sub(r"\s+", " ", s).strip()


def jaro_winkler(a, b):
    """Jaro-Winkler normalized similarity in [0.0, 1.0]."""
    if not a or not b:
        return 0.0
    return JaroWinkler.normalized_similarity(str(a), str(b))


def fuzzy_match(a, b, threshold=config.NAME_MATCH_THRESHOLD):
    """True when the Jaro-Winkler similarity of the NORMALIZED names clears threshold."""
    return jaro_winkler(normalize_name(a), normalize_name(b)) >= threshold


_TITLE_SEPS = re.compile(r"\s*[|–—:·•]\s*|\s+-\s+")


def name_in_text(name, text, threshold=config.NAME_MATCH_THRESHOLD):
    """True when `name` appears in a longer string (page title, social title).

    Substring match first; otherwise fuzzy-match each title segment
    ("Name | Service in City" -> ["Name", "Service in City"]) at threshold.
    A raw whole-string fuzzy match would fail the rubric's own example title
    format, so it is not used here.
    """
    n_name, n_text = normalize_name(name), normalize_name(text)
    if not n_name or not n_text:
        return False
    if n_name in n_text:
        return True
    return any(jaro_winkler(seg, n_name) >= threshold
               for seg in _TITLE_SEPS.split(n_text) if seg)


PHONE_RE = re.compile(
    r"(?:\+?1[\s.\-]?)?\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}"
)
STREET_RE = re.compile(
    r"\d{1,5}\s+[A-Za-z0-9.'\- ]+?\s+"
    r"(street|st|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|court|ct|"
    r"parkway|pkwy|way|place|pl|terrace|circle|cir|highway|hwy)\b",
    re.I,
)


def extract_phones(text):
    """All plausible phone numbers found in text, normalized."""
    if not text:
        return []
    out = []
    for m in PHONE_RE.finditer(text):
        n = normalize_phone(m.group(0))
        if n and n not in out:
            out.append(n)
    return out


def extract_addresses(text):
    """Street-address-looking substrings found in text (raw form)."""
    if not text:
        return []
    return [m.group(0).strip() for m in STREET_RE.finditer(text)]
