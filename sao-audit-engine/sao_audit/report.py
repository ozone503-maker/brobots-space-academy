"""Assembles the final report.json (rubric section 7 output shape)."""
import copy
import json
import os

from .scoring import aggregate, rank_top_fixes

DEFAULT_BRAND = {
    "name": "BROBOTS",
    "tagline": "people helping robots helping people",
    "logo_url": "",
    "url": "https://brobots.space",
    "colors": {"bg": "#0a0a0a", "accent": "#4f8ff7"},
}


def load_brand(brand_path=None):
    brand = copy.deepcopy(DEFAULT_BRAND)
    if brand_path:
        with open(brand_path, encoding="utf-8") as f:
            override = json.load(f)
        for k, v in override.items():
            if isinstance(v, dict) and isinstance(brand.get(k), dict):
                brand[k].update(v)
            else:
                brand[k] = v
    return brand


def assemble(ctx, results, questions, brand):
    scored = aggregate(results)
    top_fixes = rank_top_fixes(results)
    q_out = []
    for q in questions:
        q_out.append({
            "n": q["n"],
            "text": q["text"],
            "bucket": q["bucket"],
            "core": bool(q.get("core")),
            "status": q.get("status", "MISSING"),
            "evidence_url": q.get("evidence_url"),
            "quote": q.get("quote"),
        })
    checks_out = []
    for r in results:
        checks_out.append({
            "id": r["id"],
            "score": r["score"],
            "weight": r["weight"],
            "evidence": r["evidence"],
            "fix": r["fix"],
        })
    return {
        "business": ctx.business_name,
        "niche": ctx.niche,
        "primary_city": ctx.primary_city,
        "final_score": scored["final_score"],
        "band": scored["band"],
        "band_line": scored["band_line"],
        "cap_reason": scored["cap_reason"],
        "categories": scored["categories"],
        "checks": checks_out,
        "questions": q_out,
        "top_fixes": top_fixes,
        "brand": brand,
    }


def write_report(report, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "report.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    return path
