"""ALL tunable thresholds for the SAO audit engine live here.

Nothing in the check modules may hard-code a threshold — import from here.
Tune behavior by editing this file; no code changes needed elsewhere.
"""

# ---- crawl ----
CRAWL_MAX_PAGES = 100
CRAWL_MAX_DEPTH = 3
CRAWL_DELAY_SECONDS = 0.5
HTTP_TIMEOUT_SECONDS = 10
CRAWLER_USER_AGENT = "BROBOTS-SAO-Audit/1.0 (+https://brobots.space)"

# ---- fuzzy matching (Jaro-Winkler, 0.0 - 1.0) ----
NAME_MATCH_THRESHOLD = 0.90        # business-name match (C1, K2)
SOCIAL_NAME_MATCH_THRESHOLD = 0.85  # social profile names (K3)
GBP_NAME_MATCH_THRESHOLD = 0.90     # GBP vs site name (K2)

# ---- clarity ----
C3_FIRST_WORDS = 100               # "first N words" window (C3)
C4_PLACES_FOR_PASS = 3             # distinct places named -> score 2 (C4)
C4_PLACES_FOR_PARTIAL = 1          # 1-2 places -> score 1

# ---- authority ----
A1_CREDENTIAL_WINDOW_CHARS = 200    # credential must appear within N chars of a name (A1)
A3_TESTIMONIALS_FOR_PASS = 5       # detailed testimonials -> 2 (A3)
A4_RATING_PASS = 4.5                # GBP rating thresholds (A4)
A4_RATING_PARTIAL = 4.0
A4_REVIEWS_PASS = 25
A4_REVIEWS_PARTIAL = 10
A5_PROJECT_WORDS_MIN = 150         # words for a project/case-study page (A5)
A5_PROJECTS_FOR_PASS = 3

# ---- relevance ----
R1_SERVICE_WORDS_MIN = 300         # words for a real service page (R1, R8 floor)
R1_SERVICES_FOR_PASS = 4           # core services covered -> 2 ...
R1_COVERAGE_PCT_FOR_PASS = 0.75    # ... or 75% of the niche list
R2_LOCATION_WORDS_MIN = 250        # words for a real location page (R2)
R2_PAGES_FOR_PASS = 3
R2_MAX_SHINGLE_SIMILARITY = 0.6    # 5-word shingle Jaccard; above = copy-paste (R2)
R3_ANSWER_WORDS_MIN = 25           # words for a real FAQ answer (R3)
R3_FAQS_FOR_PASS = 8
R3_FAQS_FOR_PARTIAL = 3
R4_PRICE_WINDOW_CHARS = 200        # currency must be within N chars of a service term (R4)
R8_WORDS_FOR_PASS = 500            # avg service-page words -> 2 (R8)

# ---- consistency ----
# (thresholds are the fuzzy-match constants above)

# ---- AI readability ----
T1_RAW_WORDS_FOR_PASS = 300        # raw-HTML main-content words (T1)
T1_RAW_WORDS_FOR_PARTIAL = 100
T2_AI_BOTS = [                     # bots that must not be blocked (T2)
    "Googlebot", "OAI-SearchBot", "ChatGPT-User", "GPTBot",
    "PerplexityBot", "ClaudeBot", "Google-Extended",
]
T7_SITEMAP_COVERAGE_FOR_PASS = 0.90  # fraction of crawled pages listed (T7)
T8_LCP_PASS_SECONDS = 2.5          # mobile LCP (T8)
T8_LCP_PARTIAL_SECONDS = 4.0
T9_LINK_SAMPLE_SIZE = 25           # internal links sampled for breakage (T9)
T9_ERROR_PCT_FOR_PARTIAL = 0.10
T10_FRESHNESS_MONTHS = 18          # "recent" date window (T10)

# ---- 30 questions ----
Q_CHUNK_MIN_WORDS = 50             # chunk size bounds when splitting by heading
Q_CHUNK_MAX_WORDS = 200
Q_RETRIEVAL_SIMILARITY_FLOOR = 0.55   # below = MISSING outright
Q_SNIPPET_HEADING_SIMILARITY = 0.70   # heading ~ question for snippet-ready (Q3)
Q_SNIPPET_WORD_WINDOW = 60            # quote within N words after heading
Q1_COVERAGE_FOR_PASS = 0.60
Q1_COVERAGE_FOR_PARTIAL = 0.30
Q2_CORE_FOR_PASS = 8
Q2_CORE_FOR_PARTIAL = 4
Q3_SNIPPET_PCT_FOR_PASS = 0.50
Q3_SNIPPET_PCT_FOR_PARTIAL = 0.20
Q_BUCKET_QUOTAS = {                # fixed counts per bucket, total 30
    "find": 6, "cost": 5, "trust": 5, "process": 4, "problems": 5, "local": 5,
}
Q_BUCKET_LABELS = {
    "find": "Find and Choose", "cost": "Cost", "trust": "Trust",
    "process": "Process and Time", "problems": "Problems",
    "local": "Local and Availability",
}

# ---- niche detection ----
NICHE_KEYWORD_BEAT_MARGIN = 1.25   # top score must beat 2nd place by 25%
NICHE_CONFIDENCE_FLOOR = 0.6

# ---- location ----
LOC_WEIGHT_SCHEMA = 3
LOC_WEIGHT_FOOTER = 2
LOC_WEIGHT_TITLE_H1 = 2
LOC_WEIGHT_BODY = 1
LOC_WEIGHT_GBP = 3
LOC_NEARBY_COUNT = 5

# ---- LLM ----
LLM_EMBEDDING_MODEL = "text-embedding-3-small"
LLM_VERDICT_MODEL = "gpt-4o-mini"
LLM_TEMPERATURE = 0

# ---- scoring ----
SCORE_PASS = 2
SCORE_PARTIAL = 1
SCORE_FAIL = 0
BANDS = [
    (0, 34, "Invisible", "AI doesn't know you exist. When customers ask, someone else gets the call."),
    (35, 59, "Overlooked", "AI can find you. It just never picks you."),
    (60, 79, "In the Running", "You show up sometimes. Close the gaps and you become the default answer."),
    (80, 100, "AI's Pick", "AI already trusts you. Keep it that way."),
]
CAP_T1_MESSAGE = "AI can't see your homepage."
CAP_T2_MESSAGE = "You're telling AI to stay out."
CAP_SCORE = 49

# ---- external API caches ----
CACHE_TTL_SECONDS = 24 * 3600      # Places + PageSpeed cached by domain for 24h
