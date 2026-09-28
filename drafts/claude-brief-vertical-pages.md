# Brief for Claude — 20 vertical SAO-audit landing pages

## Context
BROBOTS (brobots.space) sells websites ($495 / $2,495 / $4,995) plus AI services. Our lead magnet is a **free SAO audit** (SAO = Search Answer Optimization): we crawl a business's website, run **38 checks** across 6 categories (Clarity, Authority, Relevance, Consistency, AI Readability, Question Coverage), ask the **30 questions** customers ask AI about that business type, and score whether the site answers them. The main audit page lives at brobots.space/sao-audit.html.

## Deliverable
Copy for **20 niche-specific landing pages**, one per niche below. Each page sells the same free audit, tuned to that niche. Output as **one markdown file**, with one section per niche, in this exact order:

1. hvac — HVAC
2. plumbing — Plumbing
3. roofing — Roofing
4. electrician — Electrician
5. landscaping — Landscaping
6. pest-control — Pest Control
7. cleaning — Cleaning Service
8. painting — Painter (use label "Painters")
9. general-contractor — General Contractor
10. real-estate-agent — Real Estate Agent
11. mortgage-broker — Mortgage Broker
12. law-firm — Law Firm
13. accountant — Accountant
14. consultant — Consultant
15. dentist — Dentist
16. chiropractor — Chiropractor
17. med-spa — Med Spa
18. auto-repair — Auto Repair
19. salon — Salon
20. personal-trainer — Personal Trainer

## Structure per page (follow exactly)
- `## {niche id}` header, then:
- **Slug:** `/sao-audit-{id}.html`
- **Title tag:** `Free SAO Audit for {Plural label} — Is AI Recommending Your Business? | BROBOTS`
- **Meta description:** one sentence, ≤ 155 characters, includes "free audit" and the niche
- **H1:** `Is AI recommending your {singular} business?` (e.g. "Is AI recommending your roofing business?")
- **Subhead:** 2 sentences. Sentence 1: when a customer asks AI "who's the best {niche} near me," does it say your name or your competitor's? Sentence 2: our free audit asks the 30 questions your customers ask AI, then checks whether your website answers them.
- **3 bullets:** what they get — (1) 38 checks across 6 categories, (2) see which of the 30 questions you answer / partially answer / miss, (3) your 5 highest-impact fixes, ranked.
- **How it works:** 3 numbered steps — enter your URL; we crawl and check (2–4 minutes); get your score and fix list.
- **3 example questions:** realistic questions customers ask AI about this niche (cost question, trust/hire question, emergency/local question).
- **CTA button text:** `Run my free audit`
- **Closing line:** one sentence — every missing answer is a page your competitors get to write first.

## Voice
Plainspoken, blunt, confident. Short sentences. Second person ("your"). No hype words — never use revolutionary, cutting-edge, unlock, supercharge, game-changer, or exclamation marks. No invented statistics, testimonials, reviews, or guarantees. 200–300 words per page max.

## Worked example (match this quality and shape)

## roofing
**Slug:** `/sao-audit-roofing.html`
**Title tag:** `Free SAO Audit for Roofers — Is AI Recommending Your Business? | BROBOTS`
**Meta description:** Free audit: we ask the 30 questions homeowners ask AI about roofers, then check whether your website answers them.
**H1:** Is AI recommending your roofing business?
**Subhead:** When a homeowner asks AI "who's the best roofer near me," does it say your name — or your competitor's? Our free audit asks the 30 questions your customers ask AI, then checks whether your website actually answers them.
**Bullets:**
- 38 checks across 6 categories: clarity, authority, relevance, consistency, AI readability, question coverage
- See exactly which questions you answer, partially answer, or miss entirely
- Your 5 highest-impact fixes, ranked by points recovered
**How it works:**
1. Enter your website URL.
2. We crawl your site and run all 38 checks — takes 2–4 minutes.
3. Get your score out of 100 and your fix list.
**Example questions we test:**
- How much does a roof replacement cost in my city?
- Should I repair or replace a 15-year-old roof?
- Is there emergency roof repair near me?
**CTA button text:** Run my free audit
**Closing line:** Every missing answer is a page your competitors get to write first.

## Rules
- Do not mention prices, tiers, or packages.
- Do not invent business names, reviews, or results.
- Keep every page structurally identical — only the niche details change.
- If a niche label needs pluralizing (painter → painters), do it naturally.
