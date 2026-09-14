# Claude Build Brief — Brobots Org Site + Services (Monetize)

**From:** BROBOSS (direction / Brobots voice / ship calls)  
**For:** Claude (heavy implementation)  
**Owner:** Jessie Sponberg  
**Date:** 2026-09-14  
**Goal:** One giant, beautiful, **futuristic industrial** Brobots organization site from the scattered pages — then go live. Add a real **Services** page so we can sell website builds + business assistants and keep paying for tokens.

---

## Roles (non-negotiable)

| Who | Does |
|-----|------|
| **BROBOSS** | Architecture, voice lock, accept/reject, “ship” |
| **Claude** | Most of the build (HTML/CSS/JS, assets pipeline, GitHub commits/PRs) |
| **Jessie** | Taste pass + final go-live |

Do **not** invent new brand thesis, prices, or fake customers. Do **not** restart Season One / TikTok / video production unless Jessie asks.

---

## Brand lock

- Brobots = **a people agency run by robots that helps people** — not a generic AI agency.
- Metaphor: one papaya, a thousand specialized Brobot eyes, then help it tell its own story.
- Design: handmade judgment — paste-up, clunker robots, FlashTown/volcano grit — **de-slop** is the job. No template SaaS sludge, no cyan/magenta AI glow soup.
- Visual bar: **futuristic industrial** — steel, rivets, bay doors, warning stripes, warm work lights, solid red accents (readable). Not dark caves that crush photos.
- Proof the school works: Fruity Puppy (Ipo / Erv) = Brobot success stories — sister brand voice stays FP; Brobots pages stay Brobots.

---

## Source of truth & live target

| Surface | URL / repo |
|---------|------------|
| **Primary ship target** | GitHub `ozone503-maker/brobots-space-academy` → **Vercel** `https://brobots-space-academy.vercel.app` |
| Old HQ (scrape, don’t fork mess) | `https://brobots.space` |
| Local reference (if present) | `/workspace/brobots/friday-deploy/site/` |
| Outlet Mall (separate) | `ozone503-maker/outlet-mall` — mall units **funnel** to Brobots; don’t merge mall into campus |

Hosting strategy: prefer **Vercel** so Brobots can host client sites later under one account.

---

## What exists today (scatter to unify)

Already on academy Vercel (keep / absorb, don’t orphan):

- `/` — campus home (`index.html`)
- `/retail.html` — Space Factory retail (Custom BroBot pricing live)
- `/multimedia.html` — Multimedia Center
- `/dossiers.html` — 27 Brobot GI Joe–style bio scroll + `/roster.json` + `/media/roster/`

Also in the world: old brobots.space roster pages, Build Your Brobot / lead paths, mall doors (brobots-retail, brobots-multimedia, Metal Dick’s, etc.).

**Job:** one coherent **organization** — university / space factory / agency — with clear doors, not a pile of disconnected HTML.

---

## Information architecture (build this)

```
/                     Org home — industrial campus hero, what Brobots is, proof, CTAs
/services             ★ NEW — monetize (see below)
/custom-brobots       or section on services — Wingman / Sidekick / Legend (locked prices)
/roster  or /dossiers Faculty / Brobots (reuse dossiers work)
/retail               Space Factory floor (existing, polish to match system)
/multimedia           Studios (existing, polish)
/about                Institution story — Robot University / Space Factory / people agency
/contact              hello@brobots.space (+ simple form if endpoint exists; else mailto)
```

Optional later (don’t block launch): client work / case studies (Fruity Puppy as proof), Outlet Mall entrance link, Kudoken mention as TBD.

Nav: persistent industrial header + footer on every page. “Go to Outlet Mall” small link OK.

---

## ★ Services page (monetize now)

**Path:** `/services.html` (or `/services/` if you introduce a tiny structure — prefer flat `.html` to match current site unless you cleanly migrate everything).

### Offer stack (sell what we already do)

1. **Custom Brobots (locked EXP01)**  
   - Wingman **$497** · Sidekick **$1,497** · Legend **$4,997**  
   - **50% deposit** to start  
   - CTA: `hello@brobots.space`  
   - Don’t invent new tiers without Jessie.

2. **Website builds**  
   - Small business / brand sites (Outlet Mall store rooms, brand sites, landing systems)  
   - Hosted under Brobots Vercel where it helps  
   - Package as clear tiers (e.g. Storefront / Brand Site / Full Org) — **propose copy + stub prices**, mark `PROPOSED — Jessie lock` until approved. Do not publish fake “sold out” or fake clients.

3. **Business assistants**  
   - Specialty agents / ops bots (cutters, auditors, brand builders)  
   - Productize as setup + monthly care if sensible  
   - Same: propose tiers, flag for Jessie lock.

4. **Site care / content care (from revenue lab)**  
   - Retainers to keep sites alive and on-voice  
   - Propose lightly; don’t overbuild checkout.

5. **Creator rooms — Brobots models of popular creator software**  
   - Paste-Up Desk, Audio Lab, Video Bench, Render Bay, Fun Locker  
   - Sell: access / client install / custom station  
   - Showroom: `/multimedia` — see full section below

### Services page must include

- Clear headline: what we sell / who it’s for  
- Offer cards with price or “from $X” / “ask”  
- What’s included / not included  
- Deposit / how to start  
- Strong CTA to email (and form only if real endpoint)  
- Proof strip: Fruity Puppy / campus / mall as evidence — no fabricated logos  
- Link back to roster + multimedia + retail  

**No Shopify cart required for v1.** Email + clear packages is enough to start cash.

---

## ★ Multimedia = product (Brobots models of creator software)

The Multimedia Center is not only a campus tour — it is a **sellable product line**: Brobots’ own models of popular creator software, built for humans who would rather create than configure.

### Stations (already named — keep / deepen)

| Station | Role | Status vibe |
|---------|------|-------------|
| **Paste-Up Desk** | Design / layout (Brobots answer to Canva-ish paste-up) | Live |
| **Audio Lab** | Sound beds / edit | Live |
| **Video Bench** | Cut / assemble | Beta |
| **Render Bay** | AI/image/render requests → `hello@brobots.space` | Beta |
| **Fun Locker** | Play / experiments | Live |

### On Services page + org IA

- Add offer lane: **Creator rooms / Brobots Studio tools**
- Position: “Our rooms, our models — not a scavenger hunt across a dozen apps.”
- Monetize paths (Claude propose, Jessie lock):
  1. **Access** — use the rooms (session / membership / campus pass)
  2. **Install** — deploy a Paste-Up / Audio / Video station for a client’s brand
  3. **Custom station** — build a new Brobots-model tool for their workflow
- `/multimedia` stays the showroom; `/services` sells access + installs + custom stations
- Do **not** claim we are Adobe/Canva/Premiere — we are **Brobots models** inspired by what creators need
- Keep tools lean in-browser; no 59MB embeds; Render Bay can stay email-backed until real pipeline exists

### Claude deliverable add-on

- Services cards for Creator Rooms
- Multimedia page polish to match industrial org system
- Proposed access/install pricing flagged `PROPOSED — Jessie lock`

## Design system (futuristic industrial)

- Shared `css/` tokens: ink, paper/steel, red accent, warning yellow, rivet borders, bay-door panels  
- Typography: strong display + readable body (no unreadable ghost 3D text)  
- Image-first where we have real art; compress JPG/WebP; **no base64 embeds**; no 59MB pages  
- Motion: subtle, purposeful (door slides, spark — not spam)  
- Mobile: works; wide = full-bleed industrial; portrait = stacked  

Study existing `retail.html` / `multimedia.html` / `dossiers.html` and de-slop toward one system — don’t leave three visual dialects.

---

## Anti-bloat rules (Claude previously burned us)

1. External assets only — never base64 video/images in HTML  
2. No shipping zip archives as the site  
3. No nested `/outletmall/` path nonsense on Brobots site  
4. Keep pages lean; compress media  
5. One CSS language across the org  
6. Git commits small and reviewable; PR to `main` or agreed branch  
7. If something needs Netlify and credits are paused — **ship Vercel**

---

## Go-live checklist

- [ ] IA pages above exist and link to each other  
- [ ] Services page live with locked BroBot prices + proposed web/assistant packages flagged  
- [ ] CTA `hello@brobots.space` works everywhere  
- [ ] Old scattered entry points redirect or clearly point to new org home  
- [ ] Mall funnels still hit `/retail.html` and `/multimedia.html`  
- [ ] Deployed on Vercel academy project  
- [ ] Jessie taste pass  
- [ ] BROBOSS ship call  

---

## Deliverables Claude should return

1. PR on `brobots-space-academy` with the unified shell + services  
2. Short changelog (what merged vs left behind)  
3. Proposed web-build + assistant package prices for Jessie lock (in PR description or `PROPOSED_PRICES.md`)  
4. Preview URL  

---

## Out of scope (unless Jessie expands)

- Season One / TikTok / Flow video factory  
- Fabricating revenue, clients, or testimonials  
- Rewriting Fruity Puppy / RéBella sites into Brobots voice  
- Publishing Tank’s secret 10‑min special anywhere public  

---

**BROBOSS note to Claude:** Build like a Space Factory that sells — beautiful industrial org first, cash door (`/services`) second, vanity pages never. When unsure on price, stub + flag. When unsure on voice, ask BROBOSS / Jessie — don’t invent corporate AI-agency copy.
