"""The 30 Questions Test (rubric section 8) + Q1/Q2/Q3 checks.

- detect_niche: schema @type -> keyword scoring (must beat 2nd by 25%) ->
  [LLM-ASSIST] classifier -> None (unknown; caller must require --niche)
- detect_location: weighted city candidates -> (primary, nearby[5])
- detect_core_services: top services from nav / H1s / schema offers
- generate_questions: deterministic 30-question set from the niche template bank
- judge_questions: embedding retrieval + per-bucket evidence gate +
  [LLM-ASSIST] verdict (exact-sentence quote, substring-validated) + snippet-ready
"""
import hashlib
import json
import os
import re
from collections import Counter

from . import config
from .geo import extract_cities, nearest_cities
from .llm import cosine_similarity
from .normalize import normalize_name
from .taxonomy import SCHEMA_TYPE_TO_NICHE, available_niches

SKIPPED = "skipped (no API key)"

# ---------------------------------------------------------------- niche
def detect_niche(crawl, llm=None, taxonomy_dir=None):
    """Return a niche slug, or None when unknown (do NOT guess)."""
    niches = available_niches(taxonomy_dir) if taxonomy_dir else available_niches()
    home = crawl.homepage
    # 1. schema @type
    for page in crawl.ok_pages():
        for s in page.schemas:
            t = s.get("@type", "")
            types = t if isinstance(t, list) else [t]
            for x in types:
                mapped = SCHEMA_TYPE_TO_NICHE.get(str(x))
                if mapped and (not niches or mapped in niches):
                    return mapped
    # 2. keyword scoring — needs at least one taxonomy to score against
    from .taxonomy import load_taxonomy, TaxonomyMissing
    scored = []
    title = (home.title or "").lower()
    h1s = " ".join(home.h1s).lower()
    nav = " ".join(home.nav_links).lower()
    body = home.text_main.lower()[:20000]
    for niche in niches:
        try:
            tax = load_taxonomy(niche, taxonomy_dir) if taxonomy_dir else load_taxonomy(niche)
        except TaxonomyMissing:
            continue
        score = 0
        for term in tax.service_term_set:
            if term in title:
                score += 3
            if term in h1s:
                score += 3
            if term in nav:
                score += 2
            if term in body:
                score += 1
        scored.append((score, niche))
    scored.sort(reverse=True)
    if scored and scored[0][0] > 0:
        top, second = scored[0][0], scored[1][0] if len(scored) > 1 else 0
        if second == 0 or top >= config.NICHE_KEYWORD_BEAT_MARGIN * second:
            return scored[0][1]
    # 3. [LLM-ASSIST] classifier
    if llm is not None and llm.available:
        nav_labels = []
        if home.soup:
            for a in home.soup.select("nav a"):
                nav_labels.append(a.get_text(" ", strip=True))
        guess = llm.classify_niche(home.title, home.h1s, nav_labels,
                                   home.text_main[:1200], niches)
        if guess:
            return guess
    return None


# ------------------------------------------------------------- location
def detect_location(crawl, gbp=None):
    """Weighted city candidates -> (primary_city, nearby_cities[5])."""
    weights = Counter()
    home = crawl.homepage

    def add(cities, w):
        for c in cities:
            weights[c] += w

    for page in crawl.ok_pages():
        for s in page.schemas:
            addr = s.get("address")
            blob = ""
            if isinstance(addr, dict):
                blob = " ".join(str(addr.get(k, "")) for k in
                                ("streetAddress", "addressLocality", "addressRegion"))
                loc = addr.get("addressLocality", "")
                if loc:
                    add([loc], config.LOC_WEIGHT_SCHEMA)
            area = s.get("areaServed", [])
            area = area if isinstance(area, list) else [area]
            for a in area:
                name = a.get("name") if isinstance(a, dict) else str(a)
                if name:
                    add(extract_cities(name, limit=5), config.LOC_WEIGHT_SCHEMA)
            _ = blob
    add(extract_cities(home.title + " " + " ".join(home.h1s), limit=10),
        config.LOC_WEIGHT_TITLE_H1)
    for page in crawl.ok_pages():
        if page.soup:
            for scope in (page.soup.find("header"), page.soup.find("footer")):
                if scope:
                    add(extract_cities(scope.get_text(" ", strip=True), limit=10),
                        config.LOC_WEIGHT_FOOTER)
        if "contact" in page.url.lower():
            add(extract_cities(page.text_main[:3000], limit=10), config.LOC_WEIGHT_FOOTER)
    add(extract_cities(home.text_main, limit=15), config.LOC_WEIGHT_BODY)
    if gbp and gbp.get("formattedAddress"):
        add(extract_cities(gbp["formattedAddress"], limit=5), config.LOC_WEIGHT_GBP)

    if not weights:
        return "", []
    ranked = [c for c, _ in weights.most_common()]
    primary = ranked[0]
    nearby = [c for c in ranked[1:] if c != primary][:config.LOC_NEARBY_COUNT]
    # top-up from geographic adjacency when the site names no neighbors
    if len(nearby) < config.LOC_NEARBY_COUNT:
        for c in nearest_cities(primary, n=config.LOC_NEARBY_COUNT * 2):
            if c not in nearby and c != primary:
                nearby.append(c)
            if len(nearby) >= config.LOC_NEARBY_COUNT:
                break
    return primary, nearby[:config.LOC_NEARBY_COUNT]


# -------------------------------------------------------- core services
def detect_core_services(crawl, taxonomy):
    """Top 3-5 taxonomy services by mentions in nav labels, service H1s, schema."""
    counts = Counter()
    home = crawl.homepage
    nav_text = ""
    if home.soup:
        nav_text = " ".join(a.get_text(" ", strip=True)
                            for a in home.soup.select("nav a")).lower()
    h1_text = " ".join(h for p in crawl.ok_pages() for h in p.h1s).lower()
    schema_text = " ".join(
        str(s.get("name", "")) for p in crawl.ok_pages() for s in p.schemas).lower()
    for service in taxonomy.core_service_ids:
        c = 0
        for term in taxonomy.terms_for(service):
            norm = normalize_name(term)
            if norm:
                c += (nav_text.count(norm) * 3 + h1_text.count(norm) * 2
                      + schema_text.count(norm))
        if c:
            counts[service] = c
    top = [s for s, _ in counts.most_common(5)]
    return top[:5] if top else list(taxonomy.core_service_ids[:3])


# -------------------------------------------------------------- generate
BUCKET_ORDER = ["find", "cost", "trust", "process", "problems", "local"]


def _template_vars(t):
    return set(re.findall(r"\{(\w+)\}", t.get("template", "")))


def detect_brands(crawl, taxonomy, limit=3):
    """Brand names (from taxonomy) actually mentioned on the site.

    Feeds {brand} question templates; templates with {brand} are skipped
    when this returns empty.
    """
    found = []
    if not taxonomy.brands:
        return found
    blob = "\n".join(p.text_all for p in crawl.ok_pages()[:12]).lower()
    for brand in taxonomy.brands:
        b = brand.strip().lower()
        if len(b) >= 3 and b in blob and brand not in found:
            found.append(brand)
            if len(found) >= limit:
                break
    return found


def generate_questions(taxonomy, business_name, primary_city, nearby_cities,
                       core_services, brands=None):
    """Deterministic 30 questions. Returns list of dicts (n, text, bucket, core, city).

    `brands`: detected brand names (detect_brands). Templates with {brand}
    are skipped when empty.
    """
    templates = taxonomy.question_templates
    by_bucket = {b: [] for b in BUCKET_ORDER}
    for t in templates:
        b = t.get("bucket")
        if b in by_bucket:
            by_bucket[b].append(t)

    detected_brands = list(brands or [])
    services = core_services or list(taxonomy.core_service_ids[:3])
    symptoms = taxonomy.symptom_terms or ["a problem"]
    cities = [primary_city] + list(nearby_cities or [])

    # pre-select up to 2 templates that name {business} (at least 2 must)
    business_templates = [t for t in templates if "{business}" in t.get("template", "")]
    reserved = business_templates[:2]

    # when brands were detected, {brand} templates jump the queue in their bucket
    def _pool_key(t):
        return 0 if ("{brand}" in t.get("template", "") and detected_brands) else 1
    by_bucket = {b: sorted(ts, key=_pool_key) for b, ts in by_bucket.items()}

    picked = {b: [] for b in BUCKET_ORDER}
    for t in reserved:
        picked[t["bucket"]].append(t)

    for b in BUCKET_ORDER:
        quota = config.Q_BUCKET_QUOTAS[b]
        for t in by_bucket[b]:
            if len(picked[b]) >= quota:
                break
            if t in picked[b]:
                continue
            vars_ = _template_vars(t)
            if "brand" in vars_ and not detected_brands:
                continue  # brand templates need a detected brand
            picked[b].append(t)
        # top-up from generic (variable-light) templates of the same bucket
        if len(picked[b]) < quota:
            for t in by_bucket[b]:
                if t not in picked[b] and len(_template_vars(t)) <= 1:
                    picked[b].append(t)
                if len(picked[b]) >= quota:
                    break

    ordered = []
    for b in BUCKET_ORDER:
        ordered.extend([(b, t) for t in picked[b][:config.Q_BUCKET_QUOTAS[b]]])

    # substitute variables (deterministic cycling)
    questions = []
    svc_i, city_i, sym_i, brand_i = 0, 0, 0, 0
    for b, t in ordered:
        text = t["template"]
        qcity = primary_city
        if "{service}" in text:
            text = text.replace("{service}", services[svc_i % len(services)])
            svc_i += 1
        if "{nearby_city}" in text and len(cities) > 1:
            qcity = cities[1 + (city_i % (len(cities) - 1))]
            text = text.replace("{nearby_city}", qcity)
            city_i += 1
        if "{city}" in text:
            qcity = cities[city_i % len(cities)]
            text = text.replace("{city}", qcity)
            city_i += 1
        if "{problem}" in text:
            text = text.replace("{problem}", symptoms[sym_i % len(symptoms)])
            sym_i += 1
        if "{brand}" in text and detected_brands:
            text = text.replace("{brand}", detected_brands[brand_i % len(detected_brands)])
            brand_i += 1
        text = text.replace("{business}", business_name or "your business")
        questions.append({"bucket": b, "text": text, "core": bool(t.get("core")),
                          "city": qcity})

    # exactly 10 core flags
    core_idx = [i for i, q in enumerate(questions) if q["core"]]
    if len(core_idx) > 10:
        for i in core_idx[10:]:
            questions[i]["core"] = False
    elif len(core_idx) < 10:
        for i, q in enumerate(questions):
            if not q["core"]:
                q["core"] = True
                if sum(1 for x in questions if x["core"]) >= 10:
                    break

    for i, q in enumerate(questions, 1):
        q["n"] = i
    return questions


# ----------------------------------------------------------------- judge
def _chunk_pages(pages):
    """Split pages into 50-200 word chunks by heading."""
    chunks = []
    for page in pages:
        if not page.soup:
            continue
        current_heading, words = "", []
        def flush():
            if len(words) >= config.Q_CHUNK_MIN_WORDS:
                chunks.append({"url": page.url, "heading": current_heading,
                               "text": " ".join(words)})
        for el in page.soup.find_all(["h1", "h2", "h3", "h4", "p", "li"]):
            txt = el.get_text(" ", strip=True)
            if not txt:
                continue
            if el.name in ("h1", "h2", "h3", "h4"):
                flush()
                current_heading, words = txt, []
            else:
                words.extend(txt.split())
                while len(words) >= config.Q_CHUNK_MAX_WORDS:
                    chunks.append({"url": page.url, "heading": current_heading,
                                   "text": " ".join(words[:config.Q_CHUNK_MAX_WORDS])})
                    words = words[config.Q_CHUNK_MAX_WORDS:]
        flush()
    return chunks


CURRENCY_RE = re.compile(r"\$[\d,]+")
COST_NUM_RE = re.compile(r"\b(cost|price)s?\b.{0,40}\d|\d.{0,40}\b(cost|price)s?\b", re.I)
TIME_RE = re.compile(r"\b\d+(?:\s*-\s*\d+)?\s*(hours?|hrs?|minutes?|mins?|days?|weeks?)\b", re.I)
STEP_RE = re.compile(r"\bstep\s*\d+\b", re.I)
TRUST_RE = re.compile(
    r"\b(licensed|insured|bonded|certified|certification|warranty|guarantee)\b"
    r"|license\s*#?\s*[A-Z0-9]{2,}|\b\d+\s*years?\b", re.I)
LOCAL_RE = re.compile(r"\b(24\s*/\s*7|same-?day|emergency|hours?)\b", re.I)
SERVE_RE = re.compile(r"\bserv(e|ing|es)\b", re.I)
CAUSE_RE = re.compile(r"\b(because|caused by|check|replace|fix)\b", re.I)


def _evidence_gate(bucket, chunk_text, question, taxonomy):
    low = chunk_text.lower()
    if bucket == "cost":
        return bool(CURRENCY_RE.search(chunk_text) or COST_NUM_RE.search(chunk_text))
    if bucket == "process":
        return bool(TIME_RE.search(chunk_text) or STEP_RE.search(chunk_text))
    if bucket == "trust":
        return bool(TRUST_RE.search(chunk_text))
    if bucket == "find":
        city = (question.get("city") or "").lower()
        return (city and city in low and
                any(t in low for t in taxonomy.service_term_set))
    if bucket == "problems":
        return (any(s in low for s in taxonomy.symptom_terms) and
                bool(CAUSE_RE.search(low)))
    if bucket == "local":
        city = (question.get("city") or "").lower()
        return bool(LOCAL_RE.search(low) or
                    (city and city in low and SERVE_RE.search(low)))
    return False


def _page_hash(page):
    return hashlib.sha256(page.html.encode("utf-8", "replace")).hexdigest()[:16]


def judge_questions(questions, crawl, taxonomy, llm, out_dir=""):
    """Judge every question. Returns the questions with status/evidence_url/quote.

    Without an LLM (no key / --no-llm) every question is MISSING and the Q
    checks score 0 with evidence "skipped (no API key)".
    """
    pages = crawl.ok_pages()
    if llm is None or not llm.available:
        for q in questions:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False, _skip_note=SKIPPED)
        return questions

    chunks = _chunk_pages(pages)
    if not chunks:
        for q in questions:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False)
        return questions

    # embedding cache by page-hash
    cache_path = os.path.join(out_dir, "embeddings_cache.json") if out_dir else None
    cache = {}
    if cache_path and os.path.isfile(cache_path):
        try:
            with open(cache_path, encoding="utf-8") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    chunk_texts = [c["text"] for c in chunks]
    hashes = [_page_hash(p) for p in pages]
    # cache key: hash of concatenated page hashes
    key = hashlib.sha256("|".join(sorted(hashes)).encode()).hexdigest()[:16]
    if key in cache and len(cache[key]) == len(chunk_texts):
        chunk_vecs = cache[key]
    else:
        chunk_vecs = llm.embed(chunk_texts) or []
        if chunk_vecs and cache_path:
            cache[key] = chunk_vecs
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(cache, f)
            except Exception:
                pass
    if not chunk_vecs:
        for q in questions:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False)
        return questions

    q_vecs = llm.embed([q["text"] for q in questions]) or []
    if not q_vecs:
        for q in questions:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False)
        return questions

    for q, qv in zip(questions, q_vecs):
        sims = sorted(((cosine_similarity(qv, cv), i)
                       for i, cv in enumerate(chunk_vecs)), reverse=True)
        best_sim, best_i = sims[0]
        if best_sim < config.Q_RETRIEVAL_SIMILARITY_FLOOR:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False)
            continue
        chunk = chunks[best_i]
        gate = _evidence_gate(q["bucket"], chunk["text"], q, taxonomy)
        answered, quote = llm.verdict(q["text"], chunk["text"]) if gate else (False, None)
        if gate and answered and quote:
            snippet = _snippet_ready(q, quote, chunk, pages, llm)
            q.update(status="ANSWERED", evidence_url=chunk["url"], quote=quote,
                     snippet_ready=snippet)
        elif best_sim >= config.Q_RETRIEVAL_SIMILARITY_FLOOR:
            # PARTIAL: similar chunk but gate failed, or gate passed but LLM said NO
            q.update(status="PARTIAL", evidence_url=chunk["url"], quote=None,
                     snippet_ready=False)
        else:
            q.update(status="MISSING", evidence_url=None, quote=None,
                     snippet_ready=False)
    return questions


def _snippet_ready(question, quote, chunk, pages, llm):
    """Quote within 60 words after a heading ~ question (sim >= 0.70),
    with the first sentence after the heading containing the quote."""
    page = next((p for p in pages if p.url == chunk["url"]), None)
    if not page or not page.soup:
        return False
    headings = [h.get_text(" ", strip=True) for h in
                page.soup.find_all(["h1", "h2", "h3"]) if h.get_text(strip=True)]
    if not headings:
        return False
    qv = llm.embed([question["text"]])[0]
    hvs = llm.embed(headings)
    best = max((cosine_similarity(qv, hv), h) for hv, h in zip(hvs, headings))
    if best[0] < config.Q_SNIPPET_HEADING_SIMILARITY:
        return False
    heading = best[1]
    text = page.text_all
    idx = text.find(heading)
    if idx < 0:
        return False
    after = text[idx + len(heading):]
    words = after.split()
    window = " ".join(words[:config.Q_SNIPPET_WORD_WINDOW])
    if quote not in window:
        return False
    first_sentence = after.split(".")[0]
    return quote in first_sentence


# ------------------------------------------------------------- Q checks
def check_q1(ctx):
    """Overall answer rate (weight 3)."""
    qs = getattr(ctx, "questions", []) or []
    if any(q.get("_skip_note") for q in qs) or not qs:
        return 0, SKIPPED, ("Your site answers 0 of the 30 questions customers ask AI "
                            "about your business. Here are the ones you're missing.")
    answered = sum(1 for q in qs if q["status"] == "ANSWERED")
    partial = sum(1 for q in qs if q["status"] == "PARTIAL")
    coverage = (answered + 0.5 * partial) / 30
    score = 2 if coverage >= config.Q1_COVERAGE_FOR_PASS else (
        1 if coverage >= config.Q1_COVERAGE_FOR_PARTIAL else 0)
    missing = 30 - answered - partial
    evidence = (f"{answered} answered, {partial} partial, {missing} missing "
                f"= {coverage:.0%} coverage.")
    fix = (f"Your site answers {answered} of the 30 questions customers ask AI "
           f"about your business. Here are the ones you're missing.")
    return score, evidence, fix


def check_q2(ctx):
    """The 10 money questions (weight 3)."""
    qs = getattr(ctx, "questions", []) or []
    if any(q.get("_skip_note") for q in qs) or not qs:
        return 0, SKIPPED, ("The questions closest to a phone call, like cost and "
                            "'who do I hire', are mostly unanswered. Answer those first.")
    core_answered = sum(1 for q in qs if q.get("core") and q["status"] == "ANSWERED")
    score = 2 if core_answered >= config.Q2_CORE_FOR_PASS else (
        1 if core_answered >= config.Q2_CORE_FOR_PARTIAL else 0)
    evidence = f"{core_answered} of 10 core (money) questions answered."
    fix = ("The questions closest to a phone call, like cost and 'who do I hire', "
           "are mostly unanswered. Answer those first.")
    return score, evidence, fix


def check_q3(ctx):
    """Answers are quotable (weight 2)."""
    qs = getattr(ctx, "questions", []) or []
    if any(q.get("_skip_note") for q in qs) or not qs:
        return 0, SKIPPED, ("Your answers are buried. Put the question as a heading "
                            "and the direct answer in the first sentence under it.")
    answered = [q for q in qs if q["status"] == "ANSWERED"]
    if not answered:
        return 0, "No answered questions to judge for quotability.", (
            "Your answers are buried. Put the question as a heading and the direct "
            "answer in the first sentence under it.")
    pct = sum(1 for q in answered if q.get("snippet_ready")) / len(answered)
    score = 2 if pct >= config.Q3_SNIPPET_PCT_FOR_PASS else (
        1 if pct >= config.Q3_SNIPPET_PCT_FOR_PARTIAL else 0)
    evidence = (f"{sum(1 for q in answered if q.get('snippet_ready'))} of "
                f"{len(answered)} answers are snippet-ready ({pct:.0%}).")
    fix = ("Your answers are buried. Put the question as a heading and the direct "
           "answer in the first sentence under it.")
    return score, evidence, fix


Q_CHECKS = {
    "Q1": {"weight": 3, "fn": check_q1},
    "Q2": {"weight": 3, "fn": check_q2},
    "Q3": {"weight": 2, "fn": check_q3},
}
