#!/usr/bin/env python3
"""Generate the 20 vertical SAO-audit landing pages from niches.json.

Each page reuses the brobots.space design tokens from sao-audit.html.
The audit form redirects to /sao-audit.html?url=...&niche=... which
auto-starts the audit with the niche preselected.
"""
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

CSS = """:root{
  --bg:#0a0a0c; --panel:#121216; --panel2:#17171d;
  --ink:#f5efe0; --muted:#a8a29a; --faint:#6b675f;
  --accent:#4f8ff7; --accent2:#a06ff7;
  --good:#4ade80; --warn:#f5a623; --bad:#f75555; --mid:#e3c84b;
  --radius:14px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
.wrap{max-width:960px;margin:0 auto;padding:0 20px}
nav.top{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.brandmark{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--ink);font-weight:800;letter-spacing:.06em}
.brandmark img{width:30px;height:30px;border-radius:8px}
nav.top .back{color:var(--muted);text-decoration:none;font-size:.9rem}
nav.top .back:hover{color:var(--ink)}
.hero{padding:56px 0 30px;text-align:center}
.hero h1{font-size:clamp(2rem,5.4vw,3.4rem);line-height:1.12;font-weight:800;background:linear-gradient(100deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:16px}
.hero p.sub{color:var(--muted);font-size:1.12rem;max-width:640px;margin:0 auto 34px}
.hero p.sub strong{color:var(--ink)}
.audit-form{background:var(--panel);border:1px solid #232329;border-radius:var(--radius);padding:28px;max-width:640px;margin:0 auto;text-align:left}
.audit-form label{display:block;font-size:.82rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}
.audit-form input[type=url]{width:100%;background:#0d0d10;border:1px solid #2a2a32;color:var(--ink);border-radius:10px;padding:14px 16px;font-size:1rem;margin-bottom:18px;outline:none}
.audit-form input[type=url]:focus{border-color:var(--accent)}
.btn{display:inline-block;background:linear-gradient(100deg,var(--accent),var(--accent2));color:#fff;border:none;border-radius:10px;padding:15px 34px;font-size:1.05rem;font-weight:700;cursor:pointer;width:100%;transition:transform .12s ease,filter .12s ease;text-decoration:none;text-align:center}
.btn:hover{filter:brightness(1.1)}
.btn:active{transform:scale(.98)}
.fineprint{margin-top:14px;color:var(--faint);font-size:.85rem;text-align:center}
.form-err{display:none;background:#2a1215;border:1px solid #5c232a;color:#ffb4b4;border-radius:10px;padding:12px 16px;margin-bottom:18px;font-size:.95rem}
.sec{margin-top:54px}
.sec h2{font-size:1.5rem;font-weight:800;margin-bottom:20px}
.get-list{list-style:none}
.get-list li{background:var(--panel);border:1px solid #232329;border-radius:var(--radius);padding:18px 22px;margin-bottom:12px;font-size:1.02rem}
.get-list li::before{content:"✓ ";color:var(--good);font-weight:800}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.step{background:var(--panel);border:1px solid #232329;border-radius:var(--radius);padding:22px}
.step .n{width:38px;height:38px;border-radius:10px;background:linear-gradient(100deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;margin-bottom:12px}
.step p{color:var(--muted);font-size:.98rem}
.step p strong{color:var(--ink)}
.q-card{background:var(--panel);border:1px solid #232329;border-radius:12px;padding:18px 22px;margin-bottom:10px;font-size:1.05rem;border-left:3px solid var(--accent)}
.closer{margin-top:54px;text-align:center;font-size:1.35rem;font-weight:700;max-width:640px;margin-left:auto;margin-right:auto}
.cta-band{margin-top:44px;background:linear-gradient(120deg,#141a2e,#1c1440);border:1px solid #2a3352;border-radius:18px;padding:44px 34px;text-align:center}
.cta-band h2{font-size:1.8rem;font-weight:800;margin-bottom:10px}
.cta-band p{color:var(--muted);max-width:520px;margin:0 auto 24px}
.cta-band .btn{width:auto;padding:15px 44px}
footer.site{border-top:1px solid #1d1d23;margin-top:60px;padding:26px 0 40px;color:var(--faint);font-size:.88rem;text-align:center}
footer.site .tag{color:var(--muted)}
@media(max-width:640px){.steps{grid-template-columns:1fr}}
"""

BULLETS = [
    "38 checks across 6 categories: clarity, authority, relevance, consistency, AI readability, question coverage",
    "See exactly which questions you answer, partially answer, or miss entirely",
    "Your 5 highest-impact fixes, ranked by points recovered",
]

STEPS = [
    ("Enter your website URL.", "One field. No account, no email required."),
    ("We crawl your site and run all 38 checks.", "Takes 2–4 minutes."),
    ("Get your score out of 100 and your fix list.", "The five changes that recover the most points, first."),
]

CLOSER = "Every missing answer is a page your competitors get to write first."

TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title_tag}</title>
<meta name="description" content="{meta}">
<link rel="canonical" href="https://brobots.space/{slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="{title_tag}">
<meta property="og:description" content="{meta}">
<meta property="og:url" content="https://brobots.space/{slug}">
<meta property="og:image" content="https://brobots.space/media/og-card-flyer.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title_tag}">
<meta name="twitter:description" content="{meta}">
<meta name="twitter:image" content="https://brobots.space/media/og-card-flyer.jpg">
<link rel="icon" href="/favicon.ico">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"WebPage","name":{title_json},"url":"https://brobots.space/{slug}","description":{meta_json},"isPartOf":{{"@type":"WebSite","name":"BROBOTS","url":"https://brobots.space"}}}}
</script>
<style>{css}</style>
</head>
<body>
<div class="wrap">
  <nav class="top">
    <a class="brandmark" href="/"><img src="/apple-touch-icon.png" alt="logo"><span>BROBOTS</span></a>
    <a class="back" href="/sao-audit.html">← all audits</a>
  </nav>

  <section class="hero">
    <h1>{h1}</h1>
    <p class="sub">{subhead}</p>
    <form class="audit-form" id="auditForm">
      <div class="form-err" id="formErr"></div>
      <label for="urlInput">Your website</label>
      <input type="url" id="urlInput" placeholder="https://yourbusiness.com" required autocomplete="url">
      <input type="hidden" id="nicheInput" value="{niche_id}">
      <button class="btn" type="submit">Run my free audit</button>
      <p class="fineprint">Takes about 2–4 minutes. We never share your results.</p>
    </form>
  </section>

  <section class="sec">
    <h2>What you get</h2>
    <ul class="get-list">
{bullets}
    </ul>
  </section>

  <section class="sec">
    <h2>How it works</h2>
    <div class="steps">
{steps}
    </div>
  </section>

  <section class="sec">
    <h2>Example questions we test</h2>
{questions}
  </section>

  <p class="closer">{closer}</p>

  <div class="cta-band">
    <h2>Want every fix handled?</h2>
    <p>BROBOTS builds the pages, the answers, and the AI-proof structure your audit says you're missing — starting at $495.</p>
    <a class="btn" href="/services.html">See what BROBOTS can do</a>
  </div>

  <footer class="site">
    <div class="tag">people helping robots helping people</div>
    <div style="margin-top:6px">BROBOTS · free SAO audit</div>
  </footer>
</div>
<script>
(function(){{
"use strict";
var form=document.getElementById("auditForm"),urlInput=document.getElementById("urlInput"),
    nicheInput=document.getElementById("nicheInput"),formErr=document.getElementById("formErr");
form.addEventListener("submit",function(e){{
  e.preventDefault();formErr.style.display="none";
  var url=urlInput.value.trim();
  if(!/^https?:\\/\\//i.test(url))url="https://"+url;
  try{{new URL(url);}}catch(err){{formErr.textContent="That's not a valid URL.";formErr.style.display="block";return;}}
  location.href="/sao-audit.html?url="+encodeURIComponent(url)+"&niche="+encodeURIComponent(nicheInput.value);
}});
}})();
</script>
</body>
</html>
"""


def main():
    with open(os.path.join(HERE, "niches.json"), encoding="utf-8") as f:
        data = json.load(f)
    pages = data["pages"]
    assert len(pages) == 20, f"expected 20 pages, got {len(pages)}"
    seen_slugs, seen_ids = set(), set()
    for p in pages:
        for key in ("id", "slug", "title_tag", "meta", "h1", "subhead", "questions"):
            assert p.get(key), f"page missing {key}: {p.get('id')}"
        assert len(p["questions"]) == 3, f"page {p['id']}: need 3 questions"
        assert p["slug"] not in seen_slugs, f"dup slug {p['slug']}"
        assert p["id"] not in seen_ids, f"dup id {p['id']}"
        seen_slugs.add(p["slug"])
        seen_ids.add(p["id"])

    e = html.escape
    for p in pages:
        bullets = "\n".join(
            f'      <li>{e(b)}</li>' for b in BULLETS
        )
        steps = "\n".join(
            f'      <div class="step"><div class="n">{i+1}</div><p><strong>{e(t)}</strong> {e(d)}</p></div>'
            for i, (t, d) in enumerate(STEPS)
        )
        questions = "\n".join(
            f'    <div class="q-card">“{e(q)}”</div>' for q in p["questions"]
        )
        out = TEMPLATE.format(
            css=CSS,
            title_tag=e(p["title_tag"]),
            meta=e(p["meta"]),
            slug=e(p["slug"]),
            title_json=json.dumps(p["title_tag"]),
            meta_json=json.dumps(p["meta"]),
            h1=e(p["h1"]),
            subhead=e(p["subhead"]),
            niche_id=e(p["id"]),
            bullets=bullets,
            steps=steps,
            questions=questions,
            closer=e(CLOSER),
        )
        dest = os.path.join(ROOT, p["slug"])
        with open(dest, "w", encoding="utf-8") as f:
            f.write(out)
        print("wrote", p["slug"])


if __name__ == "__main__":
    main()
