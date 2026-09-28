# BROBOTS SAO Audit Engine

38-check **Search Answer Optimization** audit. Feed it a business URL; it outputs
a 0–100 score, grade band, per-check evidence, the 30-questions test, and the
top 5 fixes — the lead-magnet report behind BROBOTS' free SAO audit.

Implements the "BROBOTS Free SAO Audit: Scoring Rubric Spec" (38 checks,
6 categories). Every check returns `(score, evidence)` — a score is never
returned without an evidence string describing what was found.

## Quick start

```bash
cd sao-audit-engine
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
# (plain `pip install -r requirements.txt` works on systems without PEP 668
#  externally-managed environments; the venv route works everywhere)
# optional, for the T1 rendered-homepage comparison:
.venv/bin/playwright install chromium

.venv/bin/python -m sao_audit.run --url https://example.com --out ./out/example
.venv/bin/python -m sao_audit.selftest   # verifies scorer against the rubric's sample audit
```

Options:

| Flag | Effect |
|---|---|
| `--url URL` | Business website to audit (required) |
| `--out DIR` | `report.json` + caches land here (required) |
| `--niche SLUG` | Skip niche auto-detection (`hvac`, `plumbing`, …) |
| `--brand brand.json` | White-label override for the `brand` block in `report.json` |
| `--no-llm` | Skip every LLM step — they score 0 with evidence `skipped (no API key)` |

## Environment variables

| Var | Used by |
|---|---|
| `OPENAI_API_KEY` | Embeddings (`text-embedding-3-small`) + verdict/classifier (`gpt-4o-mini`, temp 0). Missing → LLM steps skipped. |
| `GOOGLE_API_KEY` | Places API (New) for Google Business Profile + PageSpeed Insights mobile LCP. Missing → GBP checks score 0 (`GBP lookup unavailable`), T8 scores 0. |

No keys, no crash: the engine degrades gracefully and says so in the evidence.

## Architecture

```
sao_audit/
  run.py            CLI orchestration: crawl → profile → GBP/PageSpeed (24h
                    domain cache) → 30 questions → 38 checks → score → report.json
  crawl.py          Polite crawler: homepage + main-nav links + sitemap.xml URLs,
                    max 100 pages / depth 3, 0.5s delay, 10s timeouts, real UA,
                    robots.txt respected for our crawler. Page = parsed soup,
                    headings, JSON-LD, tel: links, social links, maps embeds.
  normalize.py      Phone/address/name normalization + Jaro-Winkler (rapidfuzz)
  taxonomy.py       Loads taxonomy/<niche>.json; TaxonomyMissing → caller must
                    require --niche (never guess)
  geo.py            US gazetteer via geonamescache; city-mention extraction;
                    nearest-city adjacency fallback
  checks_clarity.py / checks_authority.py / checks_relevance.py /
  checks_consistency.py / checks_readability.py
                    The 38 checks. Each fn(ctx) -> (score|None, evidence, fix).
                    None = N/A (only A2), excluded from numerator AND denominator.
  questions.py      30-questions test: deterministic template selection,
                    heading-based chunking, embedding retrieval, per-bucket
                    evidence gate, [LLM-ASSIST] verdict with exact-sentence
                    substring validation, snippet-ready detection. Also Q1-Q3.
  llm.py            OpenAI wrapper + NullLLM fallback + cosine similarity
  gbp.py            Places API (New): match by phone, then name+city
  pagespeed.py      PageSpeed Insights mobile LCP
  scoring.py        Formula, T1/T2 caps (49), grade bands, top-5 fix ranking
  report.py         Assembles report.json (+ white-label brand block)
  config.py         EVERY threshold lives here — tune without touching code
  context.py        AuditContext dataclass shared by all checks
  selftest.py       Asserts FINAL=44 / Overlooked / top-fix order on the
                    rubric's sample audit, plus cap + N/A behavior
```

## The white-label layer

`report.json` ends with a `brand` block:

```json
"brand": {"name": "BROBOTS", "tagline": "people helping robots helping people",
          "logo_url": "", "url": "https://brobots.space",
          "colors": {"bg": "#0a0a0a", "accent": "#4f8ff7"}}
```

Pass `--brand partner.json` and the partner's name/logo/colors flow through
with **zero code changes** — one branding layer, any logo. The audit engine
never hard-codes BROBOTS outside `report.DEFAULT_BRAND`.

## Output

`report.json`: `{business, niche, primary_city, final_score, band, band_line,
cap_reason, categories[], checks[{id, score, weight, evidence, fix}],
questions[{n, text, bucket, core, status, evidence_url, quote}],
top_fixes[5 ids], brand}`.

Grade bands: 0–34 Invisible · 35–59 Overlooked · 60–79 In the Running ·
80–100 AI's Pick. Caps: T1=0 ("AI can't see your homepage.") or T2=0
("You're telling AI to stay out.") cap the final at 49.

## Notes / known limitations

- County names are approximated via the city gazetteer (C4).
- A1 credential terms use a built-in list; a niche file may add
  `credential_terms` to extend it.
- T3: any incomplete LocalBusiness schema scores partial (rubric is silent on
  exactly-one-missing-field).
- T6 counts one structural problem per page across homepage + 5 pages; a page
  with no lists is not penalized for lacking `<ul>/<ol>`.
- K3 fetches social profile pages (10s timeout) and falls back to handle-slug
  matching when blocked.
- T9 samples 25 internal links with HEAD (GET fallback); unreachable links
  count as errors.
- Niche auto-detection needs `taxonomy/*.json` (written separately); with no
  files present, pass `--niche` explicitly.
