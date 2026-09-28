"""Clarity checks C1-C5 (rubric section 1).

Each check: fn(ctx) -> (score 0|1|2, evidence str, fix str).
"""
import re

from . import config
from .geo import extract_cities
from .normalize import name_in_text, normalize_name


def _service_terms(ctx):
    return ctx.taxonomy.service_term_set


def _title(ctx):
    return (ctx.crawl.homepage.title or "").strip()


def c1(ctx):
    """Title tag says who and what (weight 3)."""
    title = _title(ctx)
    name_ok = bool(ctx.business_name) and name_in_text(ctx.business_name, title)
    service_ok = any(t in title.lower() for t in _service_terms(ctx))
    generic = title.lower().strip() in ("home", "") or not title
    if generic:
        score = 0
    elif name_ok and service_ok:
        score = 2
    elif name_ok or service_ok:
        score = 1
    else:
        score = 0
    evidence = (f'Title = "{title}". Business name {"found" if name_ok else "not found"}, '
                f"service term {'found' if service_ok else 'not found'}.")
    fix = ("Your page title should say who you are and what you do, like "
           "'Smith Plumbing | Emergency Plumber in Tulsa'. Right now it doesn't.")
    return score, evidence, fix


def c2(ctx):
    """Main headline says what and where (weight 3)."""
    h1s = [h for h in ctx.crawl.homepage.h1s if h.strip()]
    terms = _service_terms(ctx)
    places = [p.lower() for p in [ctx.primary_city] + ctx.nearby_cities if p]

    def feats(h):
        hl = h.lower()
        return (any(t in hl for t in terms),
                any(p and p in hl for p in places))

    both_any = any(feats(h) == (True, True) for h in h1s)
    one_any = any((s != p) and (s or p) for s, p in (feats(h) for h in h1s))
    slogan_only = h1s and not both_any and not one_any
    if not h1s:
        score = 0
    elif len(h1s) == 1 and both_any:
        score = 2
    elif both_any or one_any:
        score = 1
    else:
        score = 0
    shown = h1s[0] if h1s else "(no H1)"
    evidence = (f"H1 = \"{shown}\" ({len(h1s)} H1(s) on page). "
                f"Service {'yes' if any(feats(h)[0] for h in h1s) else 'no'}, "
                f"place {'yes' if any(feats(h)[1] for h in h1s) else 'no'}.")
    fix = ("Your main headline is a slogan. Say what you do and where, like "
           "'Roof Repair in Boise, Idaho'.")
    return score, evidence, fix


def c3(ctx):
    """First 100 words answer the basics (weight 3)."""
    words = ctx.crawl.homepage.text_main.split()[:config.C3_FIRST_WORDS]
    chunk = " ".join(words)
    chunk_n = normalize_name(chunk)
    name_hit = False
    if ctx.business_name:
        bn = normalize_name(ctx.business_name)
        name_hit = bool(bn) and (bn in chunk_n or all(
            w in chunk_n for w in bn.split() if len(w) > 2))
    service_hit = any(t in chunk.lower() for t in _service_terms(ctx))
    city_hit = bool(ctx.primary_city) and ctx.primary_city.lower() in chunk.lower()
    hits = sum([name_hit, service_hit, city_hit])
    score = 2 if hits == 3 else (1 if hits == 2 else 0)
    evidence = (f"First {config.C3_FIRST_WORDS} words: name "
                f"{'yes' if name_hit else 'no'}, service {'yes' if service_hit else 'no'}, "
                f"city ({ctx.primary_city or 'unknown'}) {'yes' if city_hit else 'no'}.")
    fix = ("Open your homepage with one plain sentence: who you are, what you do, "
           "what city. AI reads the top first.")
    return score, evidence, fix


def _service_area_pages(ctx):
    """Pages linked as service-area / locations pages."""
    out = []
    for page in ctx.crawl.ok_pages():
        if not page.soup:
            continue
        for a in page.soup.find_all("a", href=True):
            label = (a.get_text(" ", strip=True) + " " + a["href"]).lower()
            if any(k in label for k in ("service area", "areas we serve", "locations",
                                       "service-area", "areas-we-serve")):
                u = a["href"]
                from urllib.parse import urljoin, urlparse
                full = urljoin(page.url, u)
                if urlparse(full).netloc == ctx.domain and full in ctx.crawl.pages:
                    out.append(ctx.crawl.pages[full])
    return out


def c4(ctx):
    """Service area is spelled out in text (weight 2)."""
    texts = [ctx.crawl.homepage.text_main]
    texts.extend(p.text_main for p in _service_area_pages(ctx))
    cities = set()
    for t in texts:
        cities.update(extract_cities(t))
    n = len(cities)
    score = 2 if n >= config.C4_PLACES_FOR_PASS else (
        1 if n >= config.C4_PLACES_FOR_PARTIAL else 0)
    evidence = (f"{n} distinct place name(s) found "
                f"({', '.join(sorted(cities)[:8]) or 'none'}).")
    fix = ("List the towns you serve by name. If you don't say it, AI assumes "
           "you don't do it.")
    return score, evidence, fix


def c5(ctx):
    """Phone and address are real text (weight 2)."""
    home = ctx.crawl.homepage
    phone_ok = bool(home.has_tel_link)
    addr_ok = False
    from .normalize import STREET_RE
    if STREET_RE.search(home.text_all):
        addr_ok = True
    else:
        for s in home.schemas:
            for key in ("address",):
                if s.get(key):
                    addr_ok = True
    score = 2 if (phone_ok and addr_ok) else (1 if (phone_ok or addr_ok) else 0)
    evidence = (f"Homepage: tel: link {'yes' if phone_ok else 'no'}, "
                f"address in text/schema {'yes' if addr_ok else 'no'}.")
    fix = ("Put your phone number and address on the page as plain text. "
           "AI can't read a picture of them.")
    return score, evidence, fix


CHECKS = {
    "C1": {"weight": 3, "fn": c1},
    "C2": {"weight": 3, "fn": c2},
    "C3": {"weight": 3, "fn": c3},
    "C4": {"weight": 2, "fn": c4},
    "C5": {"weight": 2, "fn": c5},
}
