"""Consistency checks K1-K5 (rubric section 4).

Each check: fn(ctx) -> (score 0|1|2, evidence str, fix str).
"""
import re
from urllib.parse import urljoin

import requests

from . import config
from .crawl import schema_address_text
from .normalize import (normalize_address, normalize_name, normalize_phone,
                        extract_addresses, jaro_winkler, name_in_text)


def _nap_sources(ctx):
    """[(source_label, phone, name, address)] from header/footer/contact/schema."""
    out = []
    home = ctx.crawl.homepage
    if home and home.soup:
        for label, scope in (("header", home.soup.find("header")),
                             ("footer", home.soup.find("footer"))):
            if not scope:
                continue
            tel = scope.find("a", href=lambda h: h and h.lower().startswith("tel:"))
            phone = normalize_phone(tel["href"][4:]) if tel else ""
            addr = extract_addresses(scope.get_text(" ", strip=True))
            out.append((label, phone, "", addr[0] if addr else ""))
    for page in ctx.crawl.ok_pages():
        if "contact" in page.url.lower():
            tel = page.soup.find("a", href=lambda h: h and h.lower().startswith("tel:")) \
                if page.soup else None
            phone = normalize_phone(tel["href"][4:]) if tel else ""
            addr = extract_addresses(page.text_main)
            out.append(("contact-page", phone, "", addr[0] if addr else ""))
            break
    for page in ctx.crawl.ok_pages():
        for s in page.schemas:
            tel = s.get("telephone", "")
            if tel or schema_address_text(s):
                out.append(("schema", normalize_phone(str(tel)),
                            str(s.get("name", "")),
                            schema_address_text(s)))
                break
        else:
            continue
        break
    return out


def k1(ctx):
    """Name, address, phone match across your site (weight 3)."""
    sources = [(label, ph, nm, ad) for label, ph, nm, ad in _nap_sources(ctx) if ph]
    phones = {ph for _, ph, _, _ in sources}
    names = {normalize_name(nm) for _, _, nm, _ in sources if nm}
    addrs = {normalize_address(ad) for _, _, _, ad in sources if ad}
    if not phones:
        return 0, "No phone number found in header/footer/contact/schema.", (
            "Your name, address, or phone shows up differently in different places. "
            "Pick one version and use it everywhere.")
    if len(phones) == 1 and len(names) <= 1 and len(addrs) <= 1:
        score, ev = 2, f"One phone ({next(iter(phones))}), name and address identical everywhere checked."
    elif len(phones) == 1:
        score, ev = 1, (f"Phone consistent ({next(iter(phones))}), but name "
                         f"({len(names)} variants) or address ({len(addrs)} variants) varies.")
    else:
        score, ev = 0, f"Multiple phone numbers found: {', '.join(sorted(phones)[:4])}."
    fix = ("Your name, address, or phone shows up differently in different places. "
           "Pick one version and use it everywhere.")
    return score, ev, fix


def k2(ctx):
    """Your site matches your Google profile (weight 3)."""
    gbp = ctx.gbp
    if not gbp:
        return 0, "No Google Business Profile match — cannot compare.", (
            "Your website and Google listing don't agree on your details. AI trusts "
            "businesses that match. Fix the one that's wrong.")
    name_ok = jaro_winkler(normalize_name(gbp.get("displayName", "")),
                           normalize_name(ctx.business_name)) >= config.GBP_NAME_MATCH_THRESHOLD
    phone_ok = normalize_phone(gbp.get("nationalPhoneNumber", "")) == ctx.phone and bool(ctx.phone)
    addr_ok = normalize_address(gbp.get("formattedAddress", "")) == \
        normalize_address(_site_address(ctx)) and bool(_site_address(ctx))
    hits = sum([name_ok, phone_ok, addr_ok])
    score = 2 if hits == 3 else (1 if hits == 2 else 0)
    evidence = (f"Site vs Google: name {'match' if name_ok else 'DIFFER'}, "
                f"phone {'match' if phone_ok else 'DIFFER'}, "
                f"address {'match' if addr_ok else 'DIFFER'}.")
    fix = ("Your website and Google listing don't agree on your details. AI trusts "
           "businesses that match. Fix the one that's wrong.")
    return score, evidence, fix


def _site_address(ctx):
    for page in ctx.crawl.ok_pages():
        for s in page.schemas:
            a = schema_address_text(s)
            if a:
                return a
    addrs = extract_addresses(ctx.crawl.homepage.text_main)
    return addrs[0] if addrs else ""


def _social_name_match(url, business_name):
    """Fetch the social page title (best effort); fall back to handle slug."""
    slug = url.rstrip("/").split("/")[-1].split("?")[0]
    try:
        r = requests.get(url, timeout=config.HTTP_TIMEOUT_SECONDS,
                         headers={"User-Agent": config.CRAWLER_USER_AGENT})
        if r.status_code == 200:
            m = re.search(r"<title[^>]*>(.*?)</title>", r.text,
                            re.I | re.S)
            if m:
                title = m.group(1).strip()
                if name_in_text(business_name, title,
                                config.SOCIAL_NAME_MATCH_THRESHOLD):
                    return True, f"page title '{title[:50]}'"
    except Exception:
        pass
    # fallback: the handle itself names the business
    bn = normalize_name(business_name).replace(" ", "")
    if bn and bn in normalize_name(slug).replace(" ", ""):
        return True, f"handle '{slug}'"
    return False, "no match"


def k3(ctx):
    """Social profiles say the same thing (weight 2)."""
    socials = []
    for page in ctx.crawl.ok_pages():
        for u in page.social_links:
            if u not in socials:
                socials.append(u)
        for s in page.schemas:
            same = s.get("sameAs", [])
            same = same if isinstance(same, list) else [same]
            for u in same:
                if isinstance(u, str) and any(d in u for d in
                                              ("facebook.", "instagram.", "twitter.",
                                               "x.com", "linkedin.", "youtube.",
                                               "tiktok.", "yelp.")) and u not in socials:
                    socials.append(u)
    matched = []
    for u in socials[:8]:  # bound external fetches
        ok, how = _social_name_match(u, ctx.business_name) if ctx.business_name else (False, "no business name")
        if ok:
            matched.append(f"{u} ({how})")
    n = len(matched)
    score = 2 if n >= 3 else (1 if n >= 1 else 0)
    evidence = (f"{len(socials)} social profile(s) linked, {n} name-match "
                f"({'; '.join(matched[:3]) or 'none'}).")
    fix = ("Link your real social profiles from your site and use the exact same "
           "business name on all of them.")
    return score, evidence, fix


def k4(ctx):
    """Site points to your Google listing (weight 1)."""
    gbp_link = any(p.gbp_link for p in ctx.crawl.ok_pages())
    maps_embed = any(p.maps_embed for p in ctx.crawl.ok_pages())
    if gbp_link:
        score, ev = 2, "Google Business Profile / Maps place link found on site."
    elif maps_embed:
        score, ev = 1, "Embedded Google Map found, but no direct GBP link."
    else:
        score, ev = 0, "No Google Maps embed or GBP link found."
    fix = ("Link your website to your Google Business Profile so AI knows they're "
           "the same business.")
    return score, ev, fix


def k5(ctx):
    """Your site data matches your visible page (weight 1)."""
    schema = None
    for page in ctx.crawl.ok_pages():
        for s in page.schemas:
            if s.get("@type") and ("LocalBusiness" in str(s.get("@type")) or s.get("telephone")):
                schema = s
                break
        if schema:
            break
    if not schema:
        return 0, "No business schema found to compare.", (
            "The hidden data on your site says something different from what visitors "
            "see. Get them lined up.")
    visible = {
        "name": ctx.business_name,
        "telephone": ctx.phone,
        "url": ctx.base_url.rstrip("/"),
        "address": _site_address(ctx),
    }
    present, mismatched = 0, []
    for field, vis in visible.items():
        raw = schema.get(field)
        if field == "address":
            raw = schema_address_text(schema)
        if not raw:
            continue
        present += 1
        if field == "telephone":
            ok = normalize_phone(str(raw)) == normalize_phone(vis)
        elif field == "address":
            ok = normalize_address(str(raw)) == normalize_address(vis) and bool(vis)
        elif field == "url":
            ok = str(raw).rstrip("/") == vis
        else:
            ok = jaro_winkler(normalize_name(str(raw)), normalize_name(vis)) >= 0.9
        if not ok:
            mismatched.append(field)
    if present >= 3 and not mismatched:
        score, ev = 2, f"{present} schema fields present, all match visible page."
    elif len(mismatched) <= 1:
        score, ev = 1, (f"{present} schema field(s) present; "
                        f"{'mismatch: ' + mismatched[0] if mismatched else 'fewer than 3 fields'}.")
    else:
        score, ev = 0, f"Schema mismatches visible page on: {', '.join(mismatched)}."
    fix = ("The hidden data on your site says something different from what visitors "
           "see. Get them lined up.")
    return score, ev, fix


CHECKS = {
    "K1": {"weight": 3, "fn": k1},
    "K2": {"weight": 3, "fn": k2},
    "K3": {"weight": 2, "fn": k3},
    "K4": {"weight": 1, "fn": k4},
    "K5": {"weight": 1, "fn": k5},
}
