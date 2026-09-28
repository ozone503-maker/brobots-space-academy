"""AI Readability checks T1-T10 (rubric section 5).

Each check: fn(ctx) -> (score 0|1|2, evidence str, fix str).
"""
import re
from datetime import datetime, timezone

import requests

from . import config
from .crawl import ai_bot_blocked_map, iter_local_business_schemas

DATE_RES = [
    re.compile(r"\b(January|February|March|April|May|June|July|August|"
               r"September|October|November|December)\s+\d{1,2},?\s+(19|20)\d{2}\b"),
    re.compile(r"\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b"),
    re.compile(r"\b(0?[1-9]|1[0-2])/(0?[1-9]|[12]\d|3[01])/(20\d{2})\b"),
]
MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}


def t1(ctx):
    """Content is in the page, not hidden behind scripts (weight 3)."""
    raw_words = ctx.crawl.homepage.word_count_main
    rendered = ctx.crawl.rendered_homepage_text
    note = ""
    if rendered is None:
        note = " (rendered comparison unavailable — headless browser not installed)"
    else:
        rw = len(rendered.split())
        hidden = rw - raw_words
        note = (f" Rendered copy has {rw} words; "
                f"{hidden} word(s) only appear after JS runs." if hidden > 50
                else f" Rendered copy has {rw} words; page is mostly server-rendered.")
    if raw_words >= config.T1_RAW_WORDS_FOR_PASS:
        score = 2
    elif raw_words >= config.T1_RAW_WORDS_FOR_PARTIAL:
        score = 1
    else:
        score = 0
    evidence = f"Homepage has {raw_words} words in raw HTML (no JS).{note}"
    fix = ("AI crawlers can't see most of your homepage. It loads with scripts they "
           "skip. Your words need to be in the page itself.")
    return score, evidence, fix


def t2(ctx):
    """You're not blocking AI (weight 3)."""
    blocked = ai_bot_blocked_map(ctx.crawl.robots_txt or "")
    if not ctx.crawl.robots_txt:
        return 1, "No robots.txt found (nothing explicitly blocked, nothing explicitly allowed).", (
            "Your site tells AI crawlers to go away. Change your robots.txt so they "
            "can read you.")
    n_blocked = [b for b, v in blocked.items() if v]
    g_ok = not blocked.get("Googlebot", False)
    oai_ok = not blocked.get("OAI-SearchBot", False)
    if not n_blocked:
        score, ev = 2, "robots.txt blocks none of the AI crawlers."
    elif g_ok and oai_ok:
        score, ev = 1, f"Blocked: {', '.join(n_blocked)} — but Googlebot and OAI-SearchBot are allowed."
    else:
        score, ev = 0, f"Blocked: {', '.join(n_blocked)}."
    fix = ("Your site tells AI crawlers to go away. Change your robots.txt so they "
           "can read you.")
    return score, ev, fix


def t3(ctx):
    """Business data / LocalBusiness schema (weight 3)."""
    schemas = list(iter_local_business_schemas(ctx.crawl.homepage))
    if not schemas:
        return 0, "No LocalBusiness schema found on homepage.", (
            "Add business data behind the scenes: name, address, phone, service area. "
            "It's how AI double-checks who you are.")
    s = schemas[0]
    from .crawl import schema_address_text
    fields = {
        "name": bool(s.get("name")),
        "address": bool(schema_address_text(s)),
        "telephone": bool(s.get("telephone")),
        "url": bool(s.get("url")),
        "geo/areaServed": bool(s.get("geo") or s.get("areaServed")),
    }
    missing = [k for k, v in fields.items() if not v]
    if not missing:
        score, ev = 2, "LocalBusiness schema present with name, address, telephone, url, geo/areaServed."
    else:
        # rubric: 1 = present but missing 2+; treat any incompleteness as partial
        score, ev = 1, f"LocalBusiness schema present but missing: {', '.join(missing)}."
    fix = ("Add business data behind the scenes: name, address, phone, service area. "
           "It's how AI double-checks who you are.")
    return score, ev, fix


def t4(ctx):
    """FAQ data behind your FAQ (weight 2)."""
    count = 0
    for page in ctx.crawl.ok_pages():
        for s in page.schemas:
            t = s.get("@type", "")
            types = t if isinstance(t, list) else [t]
            if "FAQPage" not in types:
                continue
            entities = s.get("mainEntity", [])
            visible = page.text_all.lower()
            for e in entities:
                q = ""
                if isinstance(e, dict):
                    q = str(e.get("name", ""))
                if q and q[:40].lower() in visible:
                    count += 1
    score = 2 if count >= 5 else (1 if count >= 1 else 0)
    evidence = f"{count} FAQPage schema question(s) matching visible text."
    fix = "Mark up your FAQ so AI can lift answers straight from it."
    return score, evidence, fix


def t5(ctx):
    """Your services are listed in site data (weight 2)."""
    names = set()
    for page in ctx.crawl.ok_pages():
        for s in page.schemas:
            t = s.get("@type", "")
            types = t if isinstance(t, list) else [t]
            if any(x in types for x in ("Service", "Offer")):
                n = s.get("name")
                if n:
                    names.add(str(n).strip().lower())
            for key in ("hasOfferCatalog", "makesOffer"):
                cat = s.get(key)
                items = cat.get("itemListElement", []) if isinstance(cat, dict) else []
                for it in items:
                    it = it.get("item", it) if isinstance(it, dict) else it
                    if isinstance(it, dict) and it.get("name"):
                        names.add(str(it["name"]).strip().lower())
    n = len(names)
    score = 2 if n >= 3 else (1 if n >= 1 else 0)
    evidence = f"{n} distinct service(s) in site data ({', '.join(sorted(names)[:4]) or 'none'})."
    fix = ("List each service in your site data with a short description. "
           "AI matches questions to those.")
    return score, evidence, fix


def _page_structure_problems(page):
    """Count of structural problems on one page (0 = clean)."""
    if not page.soup:
        return 1
    probs = 0
    h1s = page.soup.find_all("h1")
    if len(h1s) != 1:
        probs += 1
    # skipped heading levels
    levels = [int(h.name[1]) for h in page.soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"])]
    prev = 0
    for lv in levels:
        if prev and lv > prev + 1:
            probs += 1
            break
        prev = lv
    if not page.soup.find("main"):
        probs += 1
    if not page.soup.find("nav"):
        probs += 1
    return probs


def t6(ctx):
    """Clean page structure (weight 2)."""
    pages = ctx.crawl.ok_pages()[:6]  # homepage + top 5
    total = sum(_page_structure_problems(p) for p in pages)
    if total == 0:
        score, ev = 2, f"Clean structure on all {len(pages)} page(s) checked."
    elif total == 1:
        score, ev = 1, "One structural problem across checked pages."
    else:
        score, ev = 0, f"{total} structural problem(s) across checked pages."
    fix = ("Your page structure is a mess to a machine. One main headline, "
           "subheads in order, real lists.")
    return score, ev, fix


def t7(ctx):
    """Sitemap (weight 2)."""
    urls = ctx.crawl.sitemap_urls
    if not urls:
        return 0, "No sitemap.xml found.", (
            "Add a sitemap so AI can find every page you have.")
    crawled = {p.url for p in ctx.crawl.ok_pages()}
    listed = set(urls)
    coverage = len(crawled & listed) / len(crawled) if crawled else 0
    lastmod = bool(getattr(ctx.crawl, "sitemap_has_lastmod", False))
    if coverage >= config.T7_SITEMAP_COVERAGE_FOR_PASS and lastmod:
        score, ev = 2, f"Sitemap lists {len(urls)} URL(s), covers {coverage:.0%} of crawled pages, has lastmod."
    else:
        score, ev = 1, (f"Sitemap lists {len(urls)} URL(s) but covers only "
                         f"{coverage:.0%} of crawled pages{' and lacks lastmod' if not lastmod else ''}.")
    fix = "Add a sitemap so AI can find every page you have."
    return score, ev, fix


def t8(ctx):
    """Speed (weight 1)."""
    lcp = ctx.lcp_seconds
    if lcp is None:
        return 0, "PageSpeed lookup unavailable — mobile LCP unknown.", (
            "Your site is slow on phones. Compress images and trim plugins.")
    if lcp <= config.T8_LCP_PASS_SECONDS:
        score, ev = 2, f"Mobile LCP {lcp:.1f}s."
    elif lcp <= config.T8_LCP_PARTIAL_SECONDS:
        score, ev = 1, f"Mobile LCP {lcp:.1f}s."
    else:
        score, ev = 0, f"Mobile LCP {lcp:.1f}s."
    fix = "Your site is slow on phones. Compress images and trim plugins."
    return score, ev, fix


def t9(ctx):
    """Secure and not broken (weight 1)."""
    errors = []
    home = ctx.crawl.homepage
    https_ok = home.url.startswith("https://") and home.status == 200
    links = []
    for page in ctx.crawl.ok_pages():
        for u in page.links:
            if u not in links:
                links.append(u)
            if len(links) >= config.T9_LINK_SAMPLE_SIZE:
                break
        if len(links) >= config.T9_LINK_SAMPLE_SIZE:
            break
    for u in links:
        try:
            r = requests.head(u, timeout=8, allow_redirects=True,
                              headers={"User-Agent": config.CRAWLER_USER_AGENT})
            if r.status_code >= 400:
                errors.append(u)
        except Exception:
            try:
                r = requests.get(u, timeout=8, stream=True,
                                 headers={"User-Agent": config.CRAWLER_USER_AGENT})
                if r.status_code >= 400:
                    errors.append(u)
                r.close()
            except Exception:
                errors.append(u + " (unreachable)")
    pct = len(errors) / len(links) if links else 0
    if not https_ok:
        score, ev = 0, "Site does not load over valid HTTPS."
    elif not errors:
        score, ev = 2, f"HTTPS ok; 0 broken of {len(links)} sampled links."
    elif pct <= config.T9_ERROR_PCT_FOR_PARTIAL:
        score, ev = 1, f"HTTPS ok; {len(errors)} of {len(links)} sampled links broken."
    else:
        score, ev = 0, f"HTTPS ok; {len(errors)} of {len(links)} sampled links broken (>{config.T9_ERROR_PCT_FOR_PARTIAL:.0%})."
    fix = "Fix your broken pages and make sure the site loads securely."
    return score, ev, fix


def _parse_date(text):
    for rx in DATE_RES:
        m = rx.search(text)
        if not m:
            continue
        try:
            g = m.group(0)
            if m.lastindex and MONTHS.get(m.group(1).lower()):
                return datetime(int(m.group(3)), MONTHS[m.group(1).lower()],
                                int(m.group(2)), tzinfo=timezone.utc)
            if "-" in g:
                y, mo, d = g.split("-")
                return datetime(int(y), int(mo), int(d), tzinfo=timezone.utc)
            if "/" in g:
                mo, d, y = g.split("/")
                return datetime(int(y), int(mo), int(d), tzinfo=timezone.utc)
        except (ValueError, IndexError):
            continue
    return None


def t10(ctx):
    """Freshness signals (weight 1)."""
    newest = None
    dated_pages = 0
    for page in ctx.crawl.ok_pages():
        found = None
        for s in page.schemas:
            for key in ("dateModified", "datePublished"):
                if s.get(key):
                    try:
                        found = datetime.fromisoformat(
                            str(s[key]).replace("Z", "+00:00"))
                        break
                    except ValueError:
                        pass
        if not found:
            found = _parse_date(page.text_all[:5000])
        if found:
            dated_pages += 1
            if not newest or found > newest:
                newest = found
    if not newest:
        return 0, "No dates found on any content page.", (
            "Nothing on your site shows a date. Update key pages and show when "
            "they were updated.")
    age_months = (datetime.now(timezone.utc) - newest).days / 30.44
    if age_months <= config.T10_FRESHNESS_MONTHS:
        score, ev = 2, f"Most recent date {newest.date()} ({age_months:.0f} months ago)."
    else:
        score, ev = 1, f"Most recent date {newest.date()} — older than {config.T10_FRESHNESS_MONTHS} months."
    fix = ("Nothing on your site shows a date. Update key pages and show when "
           "they were updated.")
    return score, ev, fix


CHECKS = {
    "T1": {"weight": 3, "fn": t1},
    "T2": {"weight": 3, "fn": t2},
    "T3": {"weight": 3, "fn": t3},
    "T4": {"weight": 2, "fn": t4},
    "T5": {"weight": 2, "fn": t5},
    "T6": {"weight": 2, "fn": t6},
    "T7": {"weight": 2, "fn": t7},
    "T8": {"weight": 1, "fn": t8},
    "T9": {"weight": 1, "fn": t9},
    "T10": {"weight": 1, "fn": t10},
}
