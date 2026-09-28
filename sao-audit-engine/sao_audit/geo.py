"""US places gazetteer via geonamescache (rubric sections 4 / 8a).

- city mention extraction from text (US cities only)
- nearest-city adjacency (by haversine distance) as the fallback when a site
  names no nearby cities
"""
import math
import re

import geonamescache

from . import config

_gc = None
_US_CITIES = None          # list of (name, lat, lon, population)
_US_CITY_RE = None         # compiled alternation regex, longest names first


def _load():
    global _gc, _US_CITIES, _US_CITY_RE
    if _gc is not None:
        return
    _gc = geonamescache.GeonamesCache()
    _US_CITIES = []
    names = set()
    for _gid, c in _gc.get_cities().items():
        if c.get("countrycode") != "US":
            continue
        name = c["name"]
        _US_CITIES.append(
            (name, float(c["latitude"]), float(c["longitude"]),
             int(c.get("population") or 0))
        )
        names.add(name)
    # longest-first so "Round Rock" wins over "Round"
    ordered = sorted(names, key=len, reverse=True)
    _US_CITY_RE = re.compile(
        r"\b(" + "|".join(re.escape(n) for n in ordered) + r")\b"
    )


def us_cities():
    _load()
    return _US_CITIES


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def find_city_coords(name):
    """(lat, lon) for a US city name, or None. Exact match on geonamescache name."""
    _load()
    lname = name.strip().lower()
    best = None
    for cname, lat, lon, _pop in _US_CITIES:
        if cname.lower() == lname:
            return (lat, lon)
        if best is None and lname in cname.lower():
            best = (lat, lon)
    return best


def nearest_cities(name, n=5):
    """N nearest US cities to `name` by distance (city-adjacency fallback)."""
    _load()
    origin = find_city_coords(name)
    if not origin:
        return []
    lat0, lon0 = origin
    ranked = []
    for cname, lat, lon, _pop in _US_CITIES:
        if cname.lower() == name.strip().lower():
            continue
        ranked.append((_haversine_km(lat0, lon0, lat, lon), cname))
    ranked.sort(key=lambda t: t[0])
    return [c for _, c in ranked[:n]]


def extract_cities(text, limit=50):
    """Distinct US city names mentioned in text, most-frequent first."""
    if not text:
        return []
    _load()
    counts = {}
    for m in _US_CITY_RE.finditer(text):
        counts[m.group(1)] = counts.get(m.group(1), 0) + 1
    return sorted(counts, key=lambda c: (-counts[c], c))[:limit]
