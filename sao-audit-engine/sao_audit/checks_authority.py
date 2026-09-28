"""Authority checks A1-A7 (rubric section 2).

Each check: fn(ctx) -> (score 0|1|2 | None for N/A, evidence str, fix str).
"""
import re

from . import config
from .geo import extract_cities
from .normalize import normalize_phone

# Generic credential vocabulary. The rubric says "credential terms from niche
# taxonomy" but the taxonomy schema (section 0) carries no such field, so we
# use this built-in list. A niche file MAY add "credential_terms" — honored
# when present.
CREDENTIAL_TERMS = [
    "licensed", "certified", "nate", "cpa", "md", "broker", "master",
    "journeyman", "factory trained", "factory-trained", "epa certified",
    "insured", "accredited", "board certified", "board-certified",
]
YEARS_RE = re.compile(r"(\d+)\s*\+?\s*years?", re.I)
LICENSE_NUM_RE = re.compile(
    r"(?:license|lic\.?)\s*(?:#|no\.?|number)?\s*:?\s*"
    r"([A-Z0-9][A-Z0-9\-\.]*\d[A-Z0-9\-\.]*)",
    re.I,
)
_LICENSE_WORD_BASE = ["licensed", "bonded", "insured"]


def _license_word_re(taxonomy):
    words = list(_LICENSE_WORD_BASE)
    words.extend(t for t in (taxonomy.license_terms or []) if t not in words)
    return re.compile(r"\b(" + "|".join(re.escape(w) for w in words) + r")\b",
                      re.I)
NAME_TITLE_RE = re.compile(
    r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,1})\s*,\s*"
    r"(owner|founder|president|technician|specialist|expert|manager|lead|"
    r"dentist|doctor|dr|plumber|electrician|contractor|consultant)\b"
)
PERSON_HINT_RE = re.compile(
    r"\b(owner|founder|president|ceo|technician|specialist|team member|"
    r"meet the team|about the owner)\b", re.I
)
TITLE_WORD_RE = re.compile(r"[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}")
# words that disqualify a "First Last" candidate (headings, not people)
_NAME_STOPWORDS = {
    "about", "us", "our", "the", "a", "an", "meet", "team", "owner",
    "founder", "welcome", "home", "contact", "services",
}


def _looks_like_person(cand):
    words = cand.split()
    if not (2 <= len(words) <= 3):
        return False
    if any(w.lower() in _NAME_STOPWORDS for w in words):
        return False
    # a US city is not a person
    if cand in extract_cities(cand):
        return False
    return True


def _credential_terms(ctx):
    extra = getattr(ctx.taxonomy, "credential_terms", None) or []
    return CREDENTIAL_TERMS + [str(t).lower() for t in extra]


def _about_pages(ctx):
    out = []
    for page in ctx.crawl.ok_pages():
        blob = (page.url + " " + " ".join(page.h1s)).lower()
        if any(k in blob for k in ("about", "team", "owner", "staff", "our-story")):
            out.append(page)
    return out or ([ctx.crawl.homepage] if ctx.crawl.homepage else [])


def a1(ctx):
    """Named people with credentials (weight 3)."""
    window = config.A1_CREDENTIAL_WINDOW_CHARS
    creds = _credential_terms(ctx)
    named_with_cred, named_plain, cred_only = 0, 0, 0
    evidence_names = []
    for page in _about_pages(ctx):
        text = page.text_main
        names = set(m.group(1) for m in NAME_TITLE_RE.finditer(text)
                  if _looks_like_person(m.group(1)))
        # also: "First Last" near a person-hint word (tight window)
        for m in PERSON_HINT_RE.finditer(text):
            seg = text[max(0, m.start() - 60): m.end() + 60]
            for nm in TITLE_WORD_RE.finditer(seg):
                cands = [nm.group(0)]
                # greedy 3-word match may have glued a heading word on the
                # front ("About Us Mike") — retry the trailing two words
                if len(cands[0].split()) == 3:
                    cands.append(" ".join(cands[0].split()[-2:]))
                for cand in cands:
                    if cand not in names and _looks_like_person(cand):
                        names.add(cand)
        for name in names:
            idx = text.find(name)
            seg = text[max(0, idx - window): idx + len(name) + window].lower()
            has_cred = any(c in seg for c in creds) or YEARS_RE.search(seg)
            if has_cred:
                named_with_cred += 1
                evidence_names.append(name)
            else:
                named_plain += 1
        if not names and any(c in text.lower() for c in creds):
            cred_only += 1
    if named_with_cred:
        score = 2
    elif named_plain or cred_only:
        score = 1
    else:
        score = 0
    evidence = (f"Named person with credential: "
                f"{', '.join(evidence_names[:3]) or 'none'} "
                f"({named_with_cred} with credential, {named_plain} named w/o).")
    fix = ("Put a real name and real credentials on your site. "
           "'Our team of experts' tells AI nothing.")
    return score, evidence, fix


def a2(ctx):
    """License and insurance details (weight 3). N/A when not required."""
    texts = " ".join(p.text_main for p in ctx.crawl.ok_pages())
    has_terms = bool(_license_word_re(ctx.taxonomy).search(texts))
    if not ctx.taxonomy.license_required and not has_terms:
        return None, "N/A — no license terms found and niche does not require one.", ""
    m = LICENSE_NUM_RE.search(texts)
    if m:
        score, ev = 2, f'License number found: "{m.group(0).strip()}".'
    elif has_terms:
        score, ev = 1, '"Licensed/insured" language found, but no license number.'
    else:
        score, ev = 0, "No license or insurance language found anywhere."
    fix = ("Show your license number. Anyone can say 'licensed and insured'. "
           "A number is proof.")
    return score, ev, fix


def _testimonial_blocks(page):
    blocks = []
    if not page.soup:
        return blocks
    soup = page.soup
    for sel in ("blockquote", "[class*=testimonial]", "[class*=review]",
                "[id*=testimonial]", "[id*=review]"):
        for el in soup.select(sel):
            txt = el.get_text(" ", strip=True)
            if len(txt.split()) >= 10:
                blocks.append(txt)
    for s in page.schemas:
        t = s.get("@type", "")
        types = t if isinstance(t, list) else [t]
        if "Review" in types and s.get("reviewBody"):
            blocks.append(str(s["reviewBody"]))
    # de-dupe
    seen, out = set(), []
    for b in blocks:
        k = b[:60]
        if k not in seen:
            seen.add(k)
            out.append(b)
    return out


def a3(ctx):
    """Reviews on your own site, with specifics (weight 2)."""
    terms = ctx.taxonomy.service_term_set
    detailed, anonymous = 0, 0
    for page in ctx.crawl.ok_pages():
        for b in _testimonial_blocks(page):
            has_name = bool(re.search(
                r"(^|\s)([A-Z][a-z]{2,})(\s+[A-Z][a-z]{2,})?", b))
            has_detail = bool(extract_cities(b)) or any(t in b.lower() for t in terms)
            if has_name and has_detail:
                detailed += 1
            else:
                anonymous += 1
    if detailed >= config.A3_TESTIMONIALS_FOR_PASS:
        score = 2
    elif detailed >= 1 or anonymous >= 1:
        score = 1
    else:
        score = 0
    evidence = (f"{detailed} detailed testimonial(s) (name + city/service), "
                f"{anonymous} anonymous/thin.")
    fix = ("Add customer reviews with a first name, town, and what you did for them. "
           "Specific beats generic.")
    return score, evidence, fix


def a4(ctx):
    """Google review strength (weight 3)."""
    gbp = ctx.gbp
    if not gbp:
        return 0, "GBP lookup unavailable — no public Google reputation data.", (
            "Your Google reviews are thin. Ask every happy customer for one, "
            "this week. AI leans hard on them.")
    rating = gbp.get("rating") or 0
    count = gbp.get("userRatingCount") or 0
    if rating >= config.A4_RATING_PASS and count >= config.A4_REVIEWS_PASS:
        score = 2
    elif rating >= config.A4_RATING_PARTIAL and count >= config.A4_REVIEWS_PARTIAL:
        score = 1
    else:
        score = 0
    evidence = f"Google: {rating} stars across {count} reviews."
    fix = ("Your Google reviews are thin. Ask every happy customer for one, "
           "this week. AI leans hard on them.")
    return score, evidence, fix


_PROJECT_HINTS = ("project", "case study", "case-study", "portfolio",
                  "before and after", "before-and-after", "gallery", "we replaced")


def a5(ctx):
    """Real project or case-study pages (weight 2)."""
    terms = ctx.taxonomy.service_term_set
    found = []
    for page in ctx.crawl.ok_pages():
        blob = (page.url + " " + " ".join(page.h1s)).lower()
        if not any(h in blob for h in _PROJECT_HINTS):
            continue
        words = page.text_main.split()
        if len(words) < config.A5_PROJECT_WORDS_MIN:
            continue
        low = page.text_main.lower()
        if extract_cities(page.text_main) and any(t in low for t in terms):
            found.append(page.url)
    n = len(found)
    score = 2 if n >= config.A5_PROJECTS_FOR_PASS else (1 if n >= 1 else 0)
    evidence = f"{n} project/case-study page(s) with place + service detail."
    fix = ("Write up three real jobs: what the problem was, what you did, where. "
           "AI cites proof, not promises.")
    return score, evidence, fix


_TRUST_ALLOW = ("bbb.org", "chamber", "angieslist", "homeadvisor", "yelp.com",
                "trustpilot", "guildquality", "trustindex", "google.com/maps")


def a6(ctx):
    """Outside trust signals (weight 1)."""
    allow = list(_TRUST_ALLOW)
    allow.extend(t for t in (ctx.taxonomy.trust_allowlist or []) if t not in allow)
    hits = set()
    for page in ctx.crawl.ok_pages():
        low = page.text_all.lower()
        if "as seen in" in low:
            hits.add("as-seen-in")
        if not page.soup:
            continue
        for a in page.soup.find_all("a", href=True):
            href = a["href"].lower()
            for domain in allow:
                if domain in href:
                    hits.add(domain)
        for img in page.soup.find_all("img", src=True):
            src = (img.get("src", "") + " " + img.get("alt", "")).lower()
            if "bbb" in src or "chamber" in src:
                hits.add("badge:" + src[:40])
    n = len(hits)
    score = 2 if n >= 2 else (1 if n == 1 else 0)
    evidence = f"{n} outside trust signal(s): {', '.join(sorted(hits)[:4]) or 'none'}."
    fix = ("Show your memberships, badges, and press mentions, and link to them.")
    return score, evidence, fix


def a7(ctx):
    """How long you've been around (weight 1)."""
    texts = []
    for page in ctx.crawl.ok_pages():
        if "about" in page.url.lower() or page is ctx.crawl.homepage:
            texts.append(page.text_main)
    blob = " ".join(texts)
    specific = re.search(r"\bsince\s+(19|20)\d{2}\b", blob, re.I) or \
        re.search(r"\b(\d+)\s*\+?\s*years?\s+(in business|of experience|serving)\b",
                  blob, re.I)
    if not specific:
        for page in ctx.crawl.ok_pages():
            for s in page.schemas:
                if s.get("foundingDate"):
                    specific = True
                    break
    vague = re.search(r"\b(decades|years of experience|experienced|established)\b",
                      blob, re.I)
    if specific:
        score, ev = 2, "Specific founding date / years-in-business found."
    elif vague:
        score, ev = 1, "Vague experience language only."
    else:
        score, ev = 0, "No founding date or experience statement found."
    fix = ("Say exactly how long you've been in business. 'Since 2003' beats "
           "'experienced'.")
    return score, ev, fix


CHECKS = {
    "A1": {"weight": 3, "fn": a1},
    "A2": {"weight": 3, "fn": a2},
    "A3": {"weight": 2, "fn": a3},
    "A4": {"weight": 3, "fn": a4},
    "A5": {"weight": 2, "fn": a5},
    "A6": {"weight": 1, "fn": a6},
    "A7": {"weight": 1, "fn": a7},
}
