"""Self-test: scores the rubric's SAMPLE audit (section 9) and asserts
FINAL == 44, band == "Overlooked", and the top-5 fix order matches.

Run: python -m sao_audit.selftest
"""
import sys

from . import (checks_authority, checks_clarity, checks_consistency,
               checks_readability, checks_relevance)
from . import questions as qmod
from .scoring import aggregate, rank_top_fixes

# (check id, sample score) straight from the rubric's section-9 table
SAMPLE_SCORES = {
    "C1": 1, "C2": 0, "C3": 2, "C4": 2, "C5": 1,
    "A1": 2, "A2": 1, "A3": 1, "A4": 1, "A5": 0, "A6": 1, "A7": 2,
    "R1": 1, "R2": 0, "R3": 1, "R4": 0, "R5": 1, "R6": 1, "R7": 0, "R8": 1,
    "K1": 1, "K2": 1, "K3": 1, "K4": 1, "K5": 1,
    "T1": 2, "T2": 1, "T3": 1, "T4": 0, "T5": 0, "T6": 1, "T7": 1,
    "T8": 1, "T9": 1, "T10": 0,
    "Q1": 0, "Q2": 1, "Q3": 0,
}
EXPECTED_CATEGORY_PCTS = [58, 57, 31, 50, 45, 19]  # from the sample table
EXPECTED_TOP_FIXES = ["Q1", "C2", "R4", "A5", "R2"]


def build_sample_results():
    results = []
    for mod in (checks_clarity, checks_authority, checks_relevance,
                checks_consistency, checks_readability):
        for cid, spec in mod.CHECKS.items():
            results.append({"id": cid, "score": SAMPLE_SCORES[cid],
                            "weight": spec["weight"],
                            "evidence": "sample", "fix": "sample"})
    for cid, spec in qmod.Q_CHECKS.items():
        results.append({"id": cid, "score": SAMPLE_SCORES[cid],
                        "weight": spec["weight"],
                        "evidence": "sample", "fix": "sample"})
    return results


def main():
    results = build_sample_results()
    assert len(results) == 38, f"expected 38 checks, got {len(results)}"
    total_weight = sum(r["weight"] for r in results)
    assert total_weight == 84, f"expected total weight 84, got {total_weight}"

    out = aggregate(results)
    assert out["total_points"] == 74, f"expected 74 points, got {out['total_points']}"
    assert out["final_score"] == 44, f"expected FINAL 44, got {out['final_score']}"
    assert out["band"] == "Overlooked", f"expected band Overlooked, got {out['band']}"
    assert out["cap_reason"] is None, f"unexpected cap: {out['cap_reason']}"
    pcts = [c["pct"] for c in out["categories"]]
    assert pcts == EXPECTED_CATEGORY_PCTS, \
        f"category pcts {pcts} != {EXPECTED_CATEGORY_PCTS}"

    top = rank_top_fixes(results)
    assert top == EXPECTED_TOP_FIXES, f"top fixes {top} != {EXPECTED_TOP_FIXES}"

    # cap behavior: T1 = 0 forces the 49 cap even on a perfect score
    capped = [dict(r, score=2) for r in results]
    for r in capped:
        if r["id"] == "T1":
            r["score"] = 0
    out2 = aggregate(capped)
    assert out2["final_score"] == 49, f"cap failed: {out2['final_score']}"
    assert out2["cap_reason"] == "AI can't see your homepage."

    # N/A handling: A2 = None is excluded from numerator AND denominator
    na = [dict(r) for r in results]
    for r in na:
        if r["id"] == "A2":
            r["score"] = None
    out3 = aggregate(na)
    assert out3["total_max"] == 168 - 2 * 3, out3["total_max"]
    assert out3["total_points"] == 74 - 3, out3["total_points"]

    print("selftest OK: FINAL=44, band=Overlooked, "
          "top_fixes=['Q1','C2','R4','A5','R2'], caps + N/A behave.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
