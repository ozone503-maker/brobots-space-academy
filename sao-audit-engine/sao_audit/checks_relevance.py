"""Relevance checks R1-R8 (rubric section 3).

Each check: fn(ctx) -> (score 0|1|2, evidence str, fix str).
"""
import re

from . import config
from .geo import extract_cities
from .normalize import normalize_name

CURRENCY_RE = re.compile(r"\$[\d,]+(?:\.\d{1,2})?")
COST_HEADING_RE = re.compile(r"\bcost\b|\bprice\b|\bpricing\b", re.I)
STEP_RE = re.compile(r"\bstep\s*\d+\b", re.I)
TIME_RE = re.compile(r"\b\d+(?:\s*-\s*\d+)?\s*(hours?|hrs?|minutes?|mins?|days?|weeks?|months?)\b", re.I)
HOURS_TEXT_RE = re.compile(
    r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday|"
    r"\bmon\b|\btue\b|\bwed\b|\bthu\b|\bfri\b|\bsat\b|\bsun\b|"
    r"24\s*/\s*7|open\s*24|\d{1,2}(:\d{2})?\s*(am|pm))", re.I)
CHOOSE_RE = re.compile(
    r"\bvs\.?\b|\bversus\b|how to choose|what to look for|"
    r"repair or replace|should i|worth it", re.I)


def _service_pages(ctx):
    """Pages matching a core service (slug or H1) with >=300 words.

    Cached on ctx. Returns {service_id: [Page, ...]}.
    """
    if hasattr(ctx, "_service_pages_cache"):
        return ctx._service_pages_cache
    found = {}
    for service in ctx.core_services:
        slug_bits = normalize_name(service).replace(" ", "-")
        norm = normalize_name(service)
        pages = []
        for page in ctx.crawl.ok_pages():
            slug_hit = slug_bits and slug_bits in page.url.lower()
            h1_hit = any(norm and norm in h.lower() for h in page.h1s)
            if (slug_hit or h1_hit) and page.word_count_main >= config.R1_SERVICE_WORDS_MIN:
                pages.append(page)
        if pages:
            found[service] = pages
    ctx._service_pages_cache = found
    return found


def r1(ctx):
    """One page per core service (weight 3)."""
    found = _service_pages(ctx)
    n = len(found)
    total = len(ctx.core_service_ids) or len(ctx.core_services) or 1
    if n >= config.R1_SERVICES_FOR_PASS or n / total >= config.R1_COVERAGE_PCT_FOR_PASS:
        score = 2
    elif n >= 1:
        score = 1
    else:
        score = 0
    evidence = (f"{n} of {total} core services have a dedicated 300+ word page "
                f"({', '.join(sorted(found)[:6]) or 'none'}).")
    fix = ("Give every service its own page. One 'Services' page can't win "
           "8 different questions.")
    return score, evidence, fix


def _shingles(words, n=5):
    return {" ".join(words[i:i + n]) for i in range(len(words) - n + 1)}


def r2(ctx):
    """Unique pages for the towns you serve (weight 2)."""
    loc_pages = []
    for page in ctx.crawl.ok_pages():
        blob = (page.url + " " + " ".join(page.h1s)).lower()
        cities = extract_cities(page.url.replace("-", " ") + " " + " ".join(page.h1s))
        if cities and page.word_count_main >= config.R2_LOCATION_WORDS_MIN:
            loc_pages.append(page)
    n = len(loc_pages)
    too_similar = False
    if n >= 2:
        for i in range(n):
            wi = loc_pages[i].text_main.lower().split()
            for j in range(i + 1, n):
                wj = loc_pages[j].text_main.lower().split()
                si, sj = _shingles(wi), _shingles(wj)
                if si and sj and len(si & sj) / len(si | sj) >= config.R2_MAX_SHINGLE_SIMILARITY:
                    too_similar = True
    if n >= config.R2_PAGES_FOR_PASS and not too_similar:
        score = 2
    elif n >= 1:
        score = 1
    else:
        score = 0
    evidence = (f"{n} location page(s) (250+ words, city in H1/URL)"
                f"{'; some look copy-pasted' if too_similar else ''}.")
    fix = ("Build a real page for each town you serve, with something true about "
           "that town. Swapping the city name doesn't count.")
    return score, evidence, fix


def _faq_items(page):
    """[(question, answer_text)] for question-form headings on a page."""
    items = []
    if not page.soup:
        return items
    for tag in ("h2", "h3", "h4", "dt", "summary"):
        for h in page.soup.find_all(tag):
            q = h.get_text(" ", strip=True)
            if not q.endswith("?"):
                continue
            parts = []
            for sib in h.next_siblings:
                if getattr(sib, "name", "") in ("h1", "h2", "h3", "h4", "h5", "h6"):
                    break
                txt = sib.get_text(" ", strip=True) if hasattr(sib, "get_text") else str(sib).strip()
                if txt:
                    parts.append(txt)
                if sum(len(p.split()) for p in parts) >= 60:
                    break
            items.append((q, " ".join(parts)))
    return items


def r3(ctx):
    """A real FAQ (weight 3)."""
    count = 0
    for page in ctx.crawl.ok_pages():
        for _q, ans in _faq_items(page):
            if len(ans.split()) >= config.R3_ANSWER_WORDS_MIN:
                count += 1
    if count >= config.R3_FAQS_FOR_PASS:
        score = 2
    elif count >= config.R3_FAQS_FOR_PARTIAL:
        score = 1
    else:
        score = 0
    evidence = f"{count} Q&A(s) with {config.R3_ANSWER_WORDS_MIN}+ word answers site-wide."
    fix = ("Add an FAQ using the exact questions customers ask you on the phone. "
           "That's what AI is looking for.")
    return score, evidence, fix


def r4(ctx):
    """Prices or price ranges (weight 3)."""
    terms = ctx.taxonomy.service_term_set
    w = config.R4_PRICE_WINDOW_CHARS
    priced = 0
    for page in ctx.crawl.ok_pages():
        text = page.text_main
        for m in CURRENCY_RE.finditer(text):
            seg = text[max(0, m.start() - w): m.end() + w].lower()
            if any(t in seg for t in terms):
                priced += 1
                break
    cost_section = any(
        COST_HEADING_RE.search(h[1] or "") for p in ctx.crawl.ok_pages() for h in p.headings
    )
    if priced:
        score, ev = 2, f"Specific price/range tied to a service on {priced} page(s)."
    elif cost_section:
        score, ev = 1, "Cost/pricing section exists but has no numbers."
    else:
        score, ev = 0, "No prices or price ranges found."
    fix = ("Give real price ranges, even wide ones. 'Call for a quote' means AI "
           "recommends the competitor who gave a number.")
    return score, ev, fix


def r5(ctx):
    """What happens and how long it takes (weight 2)."""
    terms = ctx.taxonomy.service_term_set
    has_steps = has_time = False
    for page in ctx.crawl.ok_pages():
        low = page.text_main.lower()
        if not any(t in low for t in terms):
            continue
        if page.soup and page.soup.find("ol"):
            lis = page.soup.find("ol").find_all("li")
            if len(lis) >= 2:
                has_steps = True
        if STEP_RE.search(page.text_main):
            has_steps = True
        if TIME_RE.search(page.text_main):
            has_time = True
    score = 2 if (has_steps and has_time) else (1 if (has_steps or has_time) else 0)
    evidence = (f"Process steps {'yes' if has_steps else 'no'}, "
                f"time estimates {'yes' if has_time else 'no'}.")
    fix = ("Explain how a job works, step by step, and how long it takes. "
           "'How long does X take' is a top question.")
    return score, evidence, fix


def r6(ctx):
    """Hours stated in text and data (weight 1)."""
    home = ctx.crawl.homepage
    contact = [p for p in ctx.crawl.ok_pages() if "contact" in p.url.lower()]
    blob = " ".join([home.text_main] + [p.text_main for p in contact[:1]])
    text_ok = bool(HOURS_TEXT_RE.search(blob))
    schema_ok = any(
        s.get("openingHours") or s.get("openingHoursSpecification")
        for p in ctx.crawl.ok_pages() for s in p.schemas
    )
    score = 2 if (text_ok and schema_ok) else (1 if text_ok else 0)
    evidence = (f"Hours in visible text {'yes' if text_ok else 'no'}, "
                f"in schema {'yes' if schema_ok else 'no'}.")
    fix = ("Post your hours as text and in your site data. If you do emergency "
           "work, say so plainly.")
    return score, evidence, fix


def r7(ctx):
    """Help-me-choose content (weight 2)."""
    hits = 0
    for page in ctx.crawl.ok_pages():
        for _tag, h in page.headings:
            if h and CHOOSE_RE.search(h):
                hits += 1
                break
    score = 2 if hits >= 2 else (1 if hits == 1 else 0)
    evidence = f"{hits} help-me-choose page(s)/section(s) found."
    fix = ("Write a page that helps people decide, like 'Repair or Replace?'. "
           "AI loves quoting these.")
    return score, evidence, fix


def r8(ctx):
    """Service pages have real depth (weight 2)."""
    found = _service_pages(ctx)
    words = [p.word_count_main for pages in found.values() for p in pages]
    if not words:
        return 0, "No service pages to measure.", (
            "Your service pages are thin. Aim for 500+ words that answer the "
            "real questions, not filler.")
    avg = sum(words) / len(words)
    score = 2 if avg >= config.R8_WORDS_FOR_PASS else (
        1 if avg >= config.R1_SERVICE_WORDS_MIN else 0)
    evidence = f"Service pages average {avg:.0f} words across {len(words)} page(s)."
    fix = ("Your service pages are thin. Aim for 500+ words that answer the "
           "real questions, not filler.")
    return score, evidence, fix


CHECKS = {
    "R1": {"weight": 3, "fn": r1},
    "R2": {"weight": 2, "fn": r2},
    "R3": {"weight": 3, "fn": r3},
    "R4": {"weight": 3, "fn": r4},
    "R5": {"weight": 2, "fn": r5},
    "R6": {"weight": 1, "fn": r6},
    "R7": {"weight": 2, "fn": r7},
    "R8": {"weight": 2, "fn": r8},
}
