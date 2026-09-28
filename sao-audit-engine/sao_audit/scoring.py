"""Scoring: formula, caps, grade bands, top-fixes ranking (rubric section 7).

Input: list of {"id", "score" (0|1|2|None), "weight", "evidence", "fix"}.
score None = N/A (only A2) — excluded from numerator AND denominator.
"""
from . import config

CATEGORY_ORDER = ["Clarity", "Authority", "Relevance", "Consistency",
                  "AI Readability", "Question Coverage"]
CAT_BY_PREFIX = {"C": "Clarity", "A": "Authority", "R": "Relevance",
                 "K": "Consistency", "T": "AI Readability", "Q": "Question Coverage"}


def _cat(check_id):
    return CAT_BY_PREFIX.get(check_id[0], "Clarity")


def aggregate(results):
    applicable = [r for r in results if r.get("score") is not None]
    by_id = {r["id"]: r for r in applicable}

    total_points = sum(r["score"] * r["weight"] for r in applicable)
    total_max = sum(2 * r["weight"] for r in applicable)
    final = round(100 * total_points / total_max) if total_max else 0

    # caps — the report leads with the reason
    cap_reason = None
    if by_id.get("T1", {}).get("score") == 0:
        cap_reason = config.CAP_T1_MESSAGE
    elif by_id.get("T2", {}).get("score") == 0:
        cap_reason = config.CAP_T2_MESSAGE
    if cap_reason:
        final = min(final, config.CAP_SCORE)

    band, band_line = "Unknown", ""
    for lo, hi, name, line in config.BANDS:
        if lo <= final <= hi:
            band, band_line = name, line
            break

    categories = []
    for cat in CATEGORY_ORDER:
        members = [r for r in applicable if _cat(r["id"]) == cat]
        pts = sum(r["score"] * r["weight"] for r in members)
        mx = sum(2 * r["weight"] for r in members)
        pct = round(100 * pts / mx) if mx else 0
        categories.append({"name": cat, "pct": pct})

    return {
        "final_score": final,
        "band": band,
        "band_line": band_line,
        "cap_reason": cap_reason,
        "categories": categories,
        "total_points": total_points,
        "total_max": total_max,
    }


def rank_top_fixes(results, n=5):
    """Top fixes by recoverable points = weight * (2 - score).

    Ties: higher weight first, then category order. Q1 always first when it
    loses points.
    """
    applicable = [r for r in results
                  if r.get("score") is not None and r["score"] < 2]

    def key(r):
        q1_first = 0 if (r["id"] == "Q1") else 1
        recoverable = r["weight"] * (2 - r["score"])
        cat_idx = CATEGORY_ORDER.index(_cat(r["id"]))
        return (q1_first, -recoverable, -r["weight"], cat_idx, r["id"])

    return [r["id"] for r in sorted(applicable, key=key)[:n]]
