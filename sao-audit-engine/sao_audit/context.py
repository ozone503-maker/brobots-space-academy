"""Shared audit context passed to every check (rubric section 10).

One object carries the crawl, taxonomy, detected business profile, external
lookups, and LLM client so check functions stay small and import-clean.
"""
from dataclasses import dataclass, field


@dataclass
class AuditContext:
    base_url: str
    domain: str
    crawl: object                 # CrawlResult (crawl.py)
    taxonomy: object              # Taxonomy (taxonomy.py)
    niche: str
    business_name: str = ""
    phone: str = ""               # normalized digits
    primary_city: str = ""
    nearby_cities: list = field(default_factory=list)
    core_services: list = field(default_factory=list)
    gbp: dict | None = None       # Google Business Profile match (gbp.py)
    lcp_seconds: float | None = None   # mobile LCP (pagespeed.py)
    llm: object = None            # LLM client (llm.py); .available is False when skipped
    out_dir: str = ""
    notes: list = field(default_factory=list)
