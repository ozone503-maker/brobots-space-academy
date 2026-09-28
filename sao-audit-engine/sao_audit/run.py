"""CLI entry: python -m sao_audit.run --url URL --out DIR [--niche N]
[--brand brand.json] [--no-llm]

Pipeline: crawl -> profile (name/phone/niche/location/services) ->
GBP + PageSpeed (24h domain cache) -> 30 questions -> 38 checks ->
score -> report.json.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.parse

from . import (checks_authority, checks_clarity, checks_consistency,
               checks_readability, checks_relevance)
from . import questions as qmod
from .context import AuditContext
from .crawl import crawl, iter_local_business_schemas, render_homepage_text
from .gbp import fetch_gbp
from .llm import get_llm_client
from .normalize import extract_phones, normalize_phone
from .pagespeed import fetch_mobile_lcp
from .report import assemble, load_brand, write_report
from .scoring import aggregate
from .taxonomy import TaxonomyMissing, load_taxonomy

CHECK_MODULES = (checks_clarity, checks_authority, checks_relevance,
                 checks_consistency, checks_readability)


# ------------------------------------------------------------ profiling
def detect_business_name(crawl_result):
    home = crawl_result.homepage
    for page in crawl_result.ok_pages():
        for s in iter_local_business_schemas(page):
            if s.get("name"):
                return str(s["name"]).strip()
    if home.soup:
        og = home.soup.find("meta", attrs={"property": "og:site_name"})
        if og and og.get("content"):
            return og["content"].strip()
    title = home.title or ""
    for sep in ("|", "–", "-", "—"):
        if sep in title:
            title = title.split(sep)[0]
    return title.strip()


def detect_phone(crawl_result):
    for page in crawl_result.ok_pages():
        for s in page.schemas:
            if s.get("telephone"):
                n = normalize_phone(str(s["telephone"]))
                if n:
                    return n
    home = crawl_result.homepage
    if home and home.soup:
        tel = home.soup.find("a", href=lambda h: h and h.lower().startswith("tel:"))
        if tel:
            n = normalize_phone(tel["href"][4:])
            if n:
                return n
    phones = extract_phones(home.text_all) if home else []
    return phones[0] if phones else ""


# ---------------------------------------------------------------- cache
def _cache_path(out_dir, domain):
    safe = re.sub(r"[^a-z0-9]+", "_", domain.lower()).strip("_")
    return os.path.join(out_dir, f".cache_{safe}.json")


def _load_cache(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}


def _save_cache(path, data):
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f)
    except Exception:
        pass


def _fresh(entry, ttl=24 * 3600):
    return entry and (time.time() - entry.get("ts", 0)) < ttl


# ------------------------------------------------------------------ cli
def parse_args(argv=None):
    p = argparse.ArgumentParser(description="BROBOTS free SAO audit")
    p.add_argument("--url", required=True, help="Business website URL")
    p.add_argument("--out", required=True, help="Output directory for report.json")
    p.add_argument("--niche", default=None, help="Niche slug (skips auto-detection)")
    p.add_argument("--brand", default=None, help="brand.json for white-label output")
    p.add_argument("--no-llm", action="store_true",
                   help="Skip all LLM steps (scores 0, evidence 'skipped (no API key)')")
    return p.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)
    os.makedirs(args.out, exist_ok=True)
    domain = urllib.parse.urlparse(
        args.url if "://" in args.url else "https://" + args.url).netloc

    print(f"[1/7] crawling {args.url} ...", flush=True)
    crawl_result = crawl(args.url)
    print(f"      {len(crawl_result.pages)} pages crawled", flush=True)

    print("[2/7] rendering homepage (T1 comparison) ...", flush=True)
    crawl_result.rendered_homepage_text = render_homepage_text(args.url)

    business_name = detect_business_name(crawl_result)
    phone = detect_phone(crawl_result)
    print(f"      business: {business_name or '(unknown)'}  phone: {phone or '(unknown)'}",
          flush=True)

    llm = get_llm_client(no_llm=args.no_llm)

    print("[3/7] detecting niche ...", flush=True)
    niche = args.niche or qmod.detect_niche(crawl_result, llm)
    if not niche:
        print("ERROR: could not detect business niche — re-run with --niche <slug>",
              file=sys.stderr)
        return 2
    try:
        taxonomy = load_taxonomy(niche)
    except TaxonomyMissing as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    print(f"      niche: {niche}", flush=True)

    cache_path = _cache_path(args.out, domain)
    cache = _load_cache(cache_path)

    print("[4/7] GBP + PageSpeed (24h cache) ...", flush=True)
    gbp = None
    if _fresh(cache.get("gbp")):
        gbp = cache["gbp"]["data"]
    else:
        # placeholder location until detect_location runs; retry after
        gbp = fetch_gbp(phone=phone, business_name=business_name, city="")
        cache["gbp"] = {"ts": time.time(), "data": gbp}
    lcp = None
    if _fresh(cache.get("pagespeed")):
        lcp = cache["pagespeed"]["lcp"]
    else:
        lcp = fetch_mobile_lcp(args.url if "://" in args.url else "https://" + args.url)
        cache["pagespeed"] = {"ts": time.time(), "lcp": lcp}
    _save_cache(cache_path, cache)

    print("[5/7] detecting location + services ...", flush=True)
    primary_city, nearby_cities = qmod.detect_location(crawl_result, gbp)
    # second GBP attempt now that we know the city (only if the first found nothing)
    if not gbp and primary_city:
        gbp = fetch_gbp(phone=phone, business_name=business_name, city=primary_city)
        cache["gbp"] = {"ts": time.time(), "data": gbp}
        _save_cache(cache_path, cache)
        primary_city, nearby_cities = qmod.detect_location(crawl_result, gbp)
    core_services = qmod.detect_core_services(crawl_result, taxonomy)
    print(f"      city: {primary_city or '(unknown)'}  "
          f"services: {', '.join(core_services[:4]) or '(unknown)'}", flush=True)

    ctx = AuditContext(
        base_url=args.url if "://" in args.url else "https://" + args.url,
        domain=domain,
        crawl=crawl_result,
        taxonomy=taxonomy,
        niche=niche,
        business_name=business_name,
        phone=phone,
        primary_city=primary_city,
        nearby_cities=nearby_cities,
        core_services=core_services,
        gbp=gbp,
        lcp_seconds=lcp,
        llm=llm,
        out_dir=args.out,
    )

    print("[6/7] generating + judging 30 questions ...", flush=True)
    brands = qmod.detect_brands(crawl_result, taxonomy)
    questions = qmod.generate_questions(taxonomy, business_name, primary_city,
                                        nearby_cities, core_services,
                                        brands=brands)
    ctx.questions = qmod.judge_questions(questions, crawl_result, taxonomy, llm,
                                         args.out)

    print("[7/7] running 38 checks + scoring ...", flush=True)
    results = []
    for mod in CHECK_MODULES:
        for cid, spec in mod.CHECKS.items():
            try:
                score, evidence, fix = spec["fn"](ctx)
            except Exception as e:  # never crash on a weird site
                score, evidence, fix = 0, f"check failed: {e}", ""
            results.append({"id": cid, "score": score, "weight": spec["weight"],
                            "evidence": evidence, "fix": fix})
    for cid, spec in qmod.Q_CHECKS.items():
        try:
            score, evidence, fix = spec["fn"](ctx)
        except Exception as e:
            score, evidence, fix = 0, f"check failed: {e}", ""
        results.append({"id": cid, "score": score, "weight": spec["weight"],
                        "evidence": evidence, "fix": fix})

    brand = load_brand(args.brand)
    report = assemble(ctx, results, ctx.questions, brand)
    path = write_report(report, args.out)
    s = aggregate(results)
    print(f"\nFINAL {s['final_score']}/100 — {s['band']}")
    if s["cap_reason"]:
        print(f"cap: {s['cap_reason']}")
    print(f"report: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
