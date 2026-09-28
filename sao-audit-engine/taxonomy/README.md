# taxonomy/

One JSON file per niche: `<niche>.json` (e.g. `plumbing.json`, `dentist.json`).
The engine treats a missing file as "unknown niche" and requires `--niche`
instead of guessing.

## Schema (as shipped)

```json
{
  "niche": "plumbing",
  "label": "Plumbing",
  "service_terms": ["plumber", "plumbing", "emergency plumber", "drain cleaning"],
  "core_services": [
    {"id": "drain-cleaning", "label": "Drain Cleaning",
     "terms": ["drain cleaning", "clogged drain", "drain unclogging"]}
  ],
  "license_required": true,
  "license_terms": ["license #", "lic.", "licensed", "insured", "bonded"],
  "symptom_terms": ["slow drains", "a clogged toilet"],
  "credential_terms": ["licensed", "master plumber", "journeyman"],
  "trust_allowlist": ["bbb.org", "phccweb.org"],
  "brands": ["Rheem", "Moen", "Kohler"],
  "question_templates": [
    {"text": "Who is the best {service} company in {city}?",
     "bucket": "find", "core": true}
  ]
}
```

## Field notes

- `service_terms`: flat strings (or `{"term", "synonyms"}` objects); all are
  lowercased and flattened on load. Drives niche keyword detection and most
  service-term checks.
- `core_services`: 6–10 services people search for. `id` is the stable key;
  `label` + `terms` feed R1 page matching and `{service}` cycling.
  (The loader also accepts the minimal `core_service_ids: [...]` shape.)
- `license_required`: drives A2's N/A rule. `license_terms` extends A2's
  license-language detection beyond the built-in list.
- `symptom_terms`: used by the Problems-bucket evidence gate.
- `credential_terms` (optional): extends the built-in A1 credential vocabulary.
- `trust_allowlist`: extra domains A6 counts as outside trust signals.
- `brands`: brand names the business might install/sell/carry. The engine
  scans the site for mentions; found brands feed `{brand}` question
  templates. `{brand}` templates are skipped when no brands are detected.
- `question_templates`: 40–50 per niche. Buckets and quotas are fixed:
  `find` 6, `cost` 5, `trust` 5, `process` 4, `problems` 5, `local` 5 (= 30).
  The loader accepts `"text"` or `"template"` for the question string.
  Variables: `{service}`, `{city}`, `{nearby_city}`, `{problem}`,
  `{business}`, `{brand}`.
  Flag exactly 10 templates `"core": true` — the engine normalizes to 10
  if the file disagrees. At least 2 templates should contain `{business}`.
