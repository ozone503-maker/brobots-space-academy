"""Google Business Profile lookup via Places API (New).

Env: GOOGLE_API_KEY. Match by phone first, then name + city (rubric 0).
Graceful when the key is missing: returns None and checks that depend on
GBP score 0 with evidence "GBP lookup unavailable".

Returns a dict:
  {displayName, rating, userRatingCount, formattedAddress,
   nationalPhoneNumber, regularOpeningHours}
or None when no match / no key / error.
"""
import os

import requests

from . import config
from .normalize import normalize_phone, normalize_name, jaro_winkler


def _headers(api_key):
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.displayName,places.rating,places.userRatingCount,"
            "places.formattedAddress,places.nationalPhoneNumber,"
            "places.regularOpeningHours"
        ),
    }


def _search_text(api_key, text_query):
    try:
        r = requests.post(
            "https://places.googleapis.com/v1/places:searchText",
            headers=_headers(api_key),
            json={"textQuery": text_query, "maxResultCount": 5},
            timeout=config.HTTP_TIMEOUT_SECONDS,
        )
        if r.status_code != 200:
            return []
        return r.json().get("places", [])
    except Exception:
        return []


def fetch_gbp(phone="", business_name="", city="", api_key=None):
    """Best-effort GBP match. Phone first, then name + city."""
    api_key = api_key or os.environ.get("GOOGLE_API_KEY", "").strip()
    if not api_key:
        return None
    digits = normalize_phone(phone)
    if digits:
        for place in _search_text(api_key, digits):
            if normalize_phone(place.get("nationalPhoneNumber", "")) == digits:
                return _slim(place)
    if business_name and city:
        target = normalize_name(business_name)
        for place in _search_text(api_key, f"{business_name} {city}"):
            disp = place.get("displayName", {})
            name = disp.get("text", "") if isinstance(disp, dict) else str(disp)
            if jaro_winkler(normalize_name(name), target) >= config.GBP_NAME_MATCH_THRESHOLD:
                return _slim(place)
    return None


def _slim(place):
    disp = place.get("displayName", {})
    return {
        "displayName": disp.get("text", "") if isinstance(disp, dict) else str(disp),
        "rating": place.get("rating"),
        "userRatingCount": place.get("userRatingCount", 0),
        "formattedAddress": place.get("formattedAddress", ""),
        "nationalPhoneNumber": place.get("nationalPhoneNumber", ""),
        "regularOpeningHours": place.get("regularOpeningHours") or {},
    }
