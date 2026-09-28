"""PageSpeed Insights API: mobile Largest Contentful Paint (T8).

Env: GOOGLE_API_KEY (shared with gbp.py). Graceful when missing or on
error: returns None and T8 scores 0 with explanatory evidence.
"""
import os

import requests

from . import config


def fetch_mobile_lcp(url, api_key=None):
    """Mobile LCP in seconds, or None."""
    api_key = api_key or os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        r = requests.get(
            "https://www.googleapis.com/pagespeedonline/v5/runPagespeed",
            params={"url": url, "strategy": "mobile", "key": api_key,
                    "category": "performance"},
            timeout=30,
        )
        if r.status_code != 200:
            return None
        data = r.json()
        audits = data.get("lighthouseResult", {}).get("audits", {})
        lcp = audits.get("largest-contentful-paint", {})
        ms = lcp.get("numericValue")
        return (ms / 1000.0) if ms else None
    except Exception:
        return None
