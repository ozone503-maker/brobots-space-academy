"""Niche taxonomy loading (rubric section 0).

Taxonomy files live in <engine-root>/taxonomy/<niche>.json and are written by
a separate process. A missing file is NOT an error here — it surfaces as
TaxonomyMissing so the caller can require --niche / treat the niche as unknown
instead of guessing (rubric 8a).

Expected JSON shape:
{
  "niche": "hvac",
  "service_terms": ["ac repair", {"term": "air conditioning", "synonyms": ["a/c"]}, ...],
  "core_service_ids": ["ac repair", "furnace installation", ...],   # 6-10
  "license_required": true,
  "symptom_terms": ["blowing warm air", ...],
  "question_templates": [
     {"template": "How much does {service} cost in {city}?",
      "bucket": "cost", "core": true},
     ...
  ]
}
Buckets: find, cost, trust, process, problems, local.
"""
import json
import os
from dataclasses import dataclass, field


class TaxonomyMissing(Exception):
    pass


TAXONOMY_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "taxonomy")

# schema.org @type -> niche slug (rubric 8a, step 1)
SCHEMA_TYPE_TO_NICHE = {
    "HVACBusiness": "hvac",
    "Plumber": "plumbing",
    "RoofingContractor": "roofing",
    "Electrician": "electrician",
    "LandscapingBusiness": None,  # not a real schema type; kept for clarity
    "Landscaper": "landscaping",
    "RealEstateAgent": "real-estate-agent",
    "Dentist": "dentist",
    "Physician": "med-spa",
    "Chiropractor": "chiropractor",
    "Attorney": "law-firm",
    "LawFirm": "law-firm",
    "AccountingService": "accountant",
    "ProfessionalService": None,  # too generic — fall through to keywords
    "HomeAndConstructionBusiness": "contractor-general",
    "GeneralContractor": "contractor-general",
    "CleaningService": "cleaning",
    "PestControlService": "pest-control",
    "AutoRepair": "auto-repair",
    "AutoBodyShop": "auto-repair",
    "Painter": "painter",
    "HairSalon": "salon",
    "BeautySalon": "salon",
    "DaySpa": "med-spa",
    "ExerciseGym": "personal-trainer",
    "MortgageBroker": "mortgage-broker",
    "Consultant": "consultant",
}


@dataclass
class Taxonomy:
    niche: str
    label: str = ""
    service_terms: list = field(default_factory=list)   # flat, lowercase
    core_service_ids: list = field(default_factory=list)
    # id -> [label, *terms], lowercase; richer matching for R1 / {service}
    core_service_terms: dict = field(default_factory=dict)
    license_required: bool = False
    license_terms: list = field(default_factory=list)   # lowercase
    trust_allowlist: list = field(default_factory=list)  # lowercase domains
    symptom_terms: list = field(default_factory=list)
    credential_terms: list = field(default_factory=list)  # lowercase
    brands: list = field(default_factory=list)          # brand names, original case
    question_templates: list = field(default_factory=list)  # dicts: template/bucket/core

    @property
    def service_term_set(self):
        return set(self.service_terms)

    def terms_for(self, sid):
        return self.core_service_terms.get(sid, [sid])


def _flatten_terms(raw_terms):
    out = []
    for t in raw_terms or []:
        if isinstance(t, dict):
            out.append(str(t.get("term", "")).lower())
            out.extend(str(s).lower() for s in t.get("synonyms", []))
        else:
            out.append(str(t).lower())
    return [t for t in out if t]


def _core_services(data):
    """Accept both shapes:
    - {"core_services": [{"id","label","terms":[...]}, ...]} (shipped files)
    - {"core_service_ids": ["ac repair", ...]} (minimal)
    Returns (ids, {id: [label/terms...]}).
    """
    ids, terms = [], {}
    raw = data.get("core_services")
    if isinstance(raw, list) and raw and isinstance(raw[0], dict):
        for entry in raw:
            sid = str(entry.get("id", "")).lower().replace("-", " ").strip()
            if not sid:
                continue
            ids.append(sid)
            words = [str(entry.get("label", "")).lower()]
            words.extend(str(x).lower() for x in entry.get("terms", []))
            terms[sid] = [w for w in words if w]
        return ids, terms
    for s in data.get("core_service_ids", []):
        sid = str(s).lower()
        ids.append(sid)
        terms[sid] = [sid]
    return ids, terms


def _normalize_templates(raw):
    """Accept {"text": ...} (shipped files) or {"template": ...}."""
    out = []
    for tpl in raw or []:
        if not isinstance(tpl, dict):
            continue
        text = tpl.get("text") or tpl.get("template") or ""
        if not text:
            continue
        out.append({
            "template": str(text),
            "bucket": str(tpl.get("bucket", "find")),
            "core": bool(tpl.get("core", False)),
        })
    return out


def load_taxonomy(niche, taxonomy_dir=TAXONOMY_DIR):
    path = os.path.join(taxonomy_dir, f"{niche}.json")
    if not os.path.isfile(path):
        raise TaxonomyMissing(
            f"taxonomy file not found: {path} (niche '{niche}')"
        )
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    ids, terms = _core_services(data)
    return Taxonomy(
        niche=data.get("niche", niche),
        label=str(data.get("label", "")),
        service_terms=_flatten_terms(data.get("service_terms")),
        core_service_ids=ids,
        core_service_terms=terms,
        license_required=bool(data.get("license_required", False)),
        license_terms=[str(s).lower() for s in data.get("license_terms", [])],
        trust_allowlist=[str(s).lower() for s in data.get("trust_allowlist", [])],
        symptom_terms=[str(s).lower() for s in data.get("symptom_terms", [])],
        credential_terms=[str(s).lower() for s in data.get("credential_terms", [])],
        brands=[str(s) for s in data.get("brands", []) if str(s).strip()],
        question_templates=_normalize_templates(data.get("question_templates")),
    )


def available_niches(taxonomy_dir=TAXONOMY_DIR):
    if not os.path.isdir(taxonomy_dir):
        return []
    return sorted(
        f[:-5] for f in os.listdir(taxonomy_dir) if f.endswith(".json")
    )
