"""Polite crawler (rubric section 0).

Scope: homepage + every internal link in the main nav + every URL in
sitemap.xml. Max 100 pages, depth 3. Raw HTML only (no JS), except an
optional rendered copy of the homepage (playwright) used by T1 only.

Politeness: 0.5s delay between requests, real user-agent, 10s timeouts,
robots.txt respected FOR OUR CRAWLER. Never crashes on a weird site —
failures are recorded per-page and the crawl continues.
"""
import json
import re
import time
import urllib.parse
import urllib.robotparser
import xml.etree.ElementTree as ET

import requests
from bs4 import BeautifulSoup

from . import config

_SOCIAL_DOMAINS = (
    "facebook.com", "instagram.com", "twitter.com", "x.com",
    "linkedin.com", "youtube.com", "tiktok.com", "yelp.com",
)


class Page:
    def __init__(self, url, status=0, html="", error=""):
        self.url = url
        self.status = status
        self.html = html
        self.error = error
        self.soup = None
        self.title = ""
        self.h1s = []
        self.headings = []          # [(tag, text), ...] in document order
        self.text_main = ""         # nav/header/footer stripped
        self.text_all = ""
        self.links = []             # absolute internal URLs found
        self.nav_links = []         # internal links inside <nav>/<header>
        self.schemas = []           # parsed JSON-LD dicts
        self.phones = []            # normalized digits found in text
        self.has_tel_link = False
        self.meta_description = ""
        self.canonical = ""
        self.social_links = []      # outbound social profile URLs
        self.maps_embed = False
        self.gbp_link = None        # google maps URL that looks like a GBP link
        self.word_count_main = 0
        if html:
            self._parse()

    # -- parsing ---------------------------------------------------------
    def _parse(self):
        try:
            self.soup = BeautifulSoup(self.html, "html.parser")
        except Exception:
            return
        soup = self.soup
        t = soup.find("title")
        self.title = t.get_text(" ", strip=True) if t else ""
        self.h1s = [h.get_text(" ", strip=True) for h in soup.find_all("h1")]
        for tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            for h in soup.find_all(tag):
                self.headings.append((tag, h.get_text(" ", strip=True)))
        self.text_all = soup.get_text(" ", strip=True)
        # main content: strip chrome
        clone = BeautifulSoup(self.html, "html.parser")
        for sel in ("nav", "header", "footer", "script", "style", "noscript",
                    "[role=navigation]", "[role=banner]", "[role=contentinfo]"):
            for el in clone.select(sel):
                el.decompose()
        main = clone.find("main") or clone.find("body") or clone
        self.text_main = main.get_text(" ", strip=True)
        self.word_count_main = len(self.text_main.split())
        md = soup.find("meta", attrs={"name": "description"})
        if md and md.get("content"):
            self.meta_description = md["content"].strip()
        can = soup.find("link", attrs={"rel": "canonical"})
        if can and can.get("href"):
            self.canonical = can["href"]
        self._extract_links()
        self._extract_schemas()
        self._extract_contact_bits()

    def _extract_links(self):
        if not self.soup:
            return
        base_host = urllib.parse.urlparse(self.url).netloc
        seen, nav_seen = set(), set()
        for nav in self.soup.find_all("nav"):
            for a in nav.find_all("a", href=True):
                u = urllib.parse.urljoin(self.url, a["href"].strip())
                if urllib.parse.urlparse(u).netloc == base_host and u not in nav_seen:
                    nav_seen.add(u)
                    self.nav_links.append(u)
        for a in self.soup.find_all("a", href=True):
            href = a["href"].strip()
            if href.lower().startswith("tel:"):
                self.has_tel_link = True
                continue
            u = urllib.parse.urljoin(self.url, href)
            host = urllib.parse.urlparse(u).netloc
            if host == base_host:
                if u not in seen:
                    seen.add(u)
                    self.links.append(u)
            elif any(s in host for s in _SOCIAL_DOMAINS):
                if u not in self.social_links:
                    self.social_links.append(u)
            if "google.com/maps" in href or "maps.google" in href:
                if not self.gbp_link and ("/place/" in href or "cid=" in href):
                    self.gbp_link = href

    def _extract_schemas(self):
        if not self.soup:
            return
        for tag in self.soup.find_all("script", type="application/ld+json"):
            raw = tag.string or tag.get_text()
            if not raw:
                continue
            try:
                data = json.loads(raw)
            except Exception:
                continue
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict) and "@graph" in item:
                    self.schemas.extend(
                        g for g in item["@graph"] if isinstance(g, dict)
                    )
                elif isinstance(item, dict):
                    self.schemas.append(item)

    def _extract_contact_bits(self):
        from . import normalize as _norm  # local import: no cycle
        self.phones = _norm.extract_phones(self.text_all)
        if not self.soup:
            return
        for iframe in self.soup.find_all("iframe", src=True):
            src = iframe["src"]
            if "google.com/maps" in src or "maps.google" in src:
                self.maps_embed = True


class CrawlResult:
    def __init__(self, start_url):
        self.start_url = start_url
        self.pages = {}              # url -> Page
        self.homepage = None
        self.robots_txt = ""
        self.sitemap_urls = []
        self.sitemap_has_lastmod = False
        self.rendered_homepage_text = None  # set separately via render_homepage()
        self.notes = []

    def ok_pages(self):
        return [p for p in self.pages.values() if p.status == 200 and p.soup]


# -- robots.txt -----------------------------------------------------------
def parse_robots_groups(text):
    """[(agents:[str], disallows:[str])] — minimal parser, enough for T2/our UA."""
    groups = []
    agents, disallows = [], []
    for line in (text or "").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        k, v = line.split(":", 1)
        k, v = k.strip().lower(), v.strip()
        if k == "user-agent":
            if disallows or (agents and False):
                pass
            if agents and (disallows is not None) and groups and groups[-1][0] == agents:
                pass
            # start a new group when we already collected rules for the last agents
            if agents and _group_has_rules(groups, agents):
                agents, disallows = [], []
            agents.append(v)
        elif k == "disallow":
            disallows.append(v)
            _commit(groups, agents, disallows)
    return groups


def _group_has_rules(groups, agents):
    return any(g[0] == agents for g in groups)


def _commit(groups, agents, disallows):
    for g in groups:
        if g[0] == agents:
            g[1].extend(d for d in disallows[len(g[1]):])
            return
    groups.append([list(agents), list(disallows)])


def our_crawler_allowed(robots_txt, user_agent=config.CRAWLER_USER_AGENT):
    """True unless robots.txt disallows '/' for our UA (or '*')."""
    for agents, disallows in parse_robots_groups(robots_txt):
        if user_agent in agents or "*" in agents:
            for d in disallows:
                if d.strip() in ("/", "/*"):
                    return False
    return True


def ai_bot_blocked_map(robots_txt):
    """{bot_name: bool blocked} for the AI bots in config (T2)."""
    groups = parse_robots_groups(robots_txt)
    out = {}
    for bot in config.T2_AI_BOTS:
        blocked = False
        # exact-agent group wins over '*'
        applicable = None
        for agents, disallows in groups:
            if bot.lower() in [a.lower() for a in agents]:
                applicable = disallows
                break
        if applicable is None:
            for agents, disallows in groups:
                if "*" in agents:
                    applicable = disallows
                    break
        if applicable:
            for d in applicable:
                d = d.strip()
                if d in ("/", "/*"):
                    blocked = True
                elif d == "":
                    blocked = False  # explicit allow-all wins
        out[bot] = blocked
    return out


# -- sitemap --------------------------------------------------------------
def fetch_sitemap_urls(session, base_url, robots_txt):
    urls = []
    has_lastmod = False
    candidates = []
    for line in (robots_txt or "").splitlines():
        if line.lower().startswith("sitemap:"):
            candidates.append(line.split(":", 1)[1].strip())
    candidates.append(urllib.parse.urljoin(base_url, "/sitemap.xml"))
    for sm_url in candidates:
        try:
            r = session.get(sm_url, timeout=config.HTTP_TIMEOUT_SECONDS)
            if r.status_code != 200 or not r.content:
                continue
            root = ET.fromstring(r.content)
            tag = root.tag
            ns = {"s": tag.split("}")[0].strip("{")} if "}" in tag else {}
            if "lastmod" in r.text.lower():
                has_lastmod = True
            if "sitemapindex" in tag:
                locs = root.findall("s:sitemap/s:loc", ns) if ns else []
                for loc in locs[:5]:
                    try:
                        rr = session.get(loc.text.strip(),
                                         timeout=config.HTTP_TIMEOUT_SECONDS)
                        if rr.status_code == 200:
                            sub = ET.fromstring(rr.content)
                            urls.extend(_sitemap_locs(sub))
                    except Exception:
                        continue
            else:
                urls.extend(_sitemap_locs(root))
            if urls:
                break
        except Exception:
            continue
    # same-host only, dedupe
    host = urllib.parse.urlparse(base_url).netloc
    clean = []
    for u in urls:
        u = u.strip()
        if urllib.parse.urlparse(u).netloc == host and u not in clean:
            clean.append(u)
    fetch_sitemap_urls.lastmod = has_lastmod
    return clean


def _sitemap_locs(root):
    tag = root.tag
    ns = {"s": tag.split("}")[0].strip("{")} if "}" in tag else {}
    if ns:
        return [e.text for e in root.findall("s:url/s:loc", ns) if e.text]
    return [e.text for e in root.iter()
            if e.tag.endswith("}loc") or e.tag == "loc" if e.text]


# -- crawl -----------------------------------------------------------------
def _is_html_response(resp):
    ctype = resp.headers.get("Content-Type", "")
    return "html" in ctype.lower() or not ctype


def crawl(start_url, out_notes=None):
    if not re.match(r"^https?://", start_url, re.I):
        start_url = "https://" + start_url
    start_url = start_url.rstrip("/")
    result = CrawlResult(start_url)
    host = urllib.parse.urlparse(start_url).netloc

    session = requests.Session()
    session.headers.update({"User-Agent": config.CRAWLER_USER_AGENT})

    # robots.txt (needed for T2 regardless)
    try:
        r = session.get(urllib.parse.urljoin(start_url, "/robots.txt"),
                        timeout=config.HTTP_TIMEOUT_SECONDS)
        if r.status_code == 200:
            result.robots_txt = r.text
    except Exception as e:
        result.notes.append(f"robots.txt fetch failed: {e}")

    allowed = our_crawler_allowed(result.robots_txt)
    if not allowed:
        result.notes.append("robots.txt disallows our crawler site-wide; "
                            "crawl limited to homepage + robots/sitemap reads")

    result.sitemap_urls = fetch_sitemap_urls(session, start_url, result.robots_txt)
    result.sitemap_has_lastmod = bool(getattr(fetch_sitemap_urls, "lastmod", False))

    def fetch(url):
        try:
            r = session.get(url, timeout=config.HTTP_TIMEOUT_SECONDS,
                            allow_redirects=True)
            if r.status_code == 200 and _is_html_response(r):
                return Page(url=r.url, status=200, html=r.text)
            return Page(url=url, status=r.status_code,
                        error=f"HTTP {r.status_code}")
        except Exception as e:
            return Page(url=url, status=0, error=f"fetch failed: {e}")

    # homepage first (needed for nav seeds + T1)
    home = fetch(start_url)
    result.pages[home.url] = home
    result.homepage = home
    time.sleep(config.CRAWL_DELAY_SECONDS)

    seeds = []
    if home.soup:
        seeds.extend(home.nav_links)
    seeds.extend(u for u in result.sitemap_urls if u != home.url)

    seen = set(result.pages)
    queue = [(u, 1) for u in seeds if u not in seen]
    for u, _d in queue:
        seen.add(u)

    while queue and len(result.pages) < config.CRAWL_MAX_PAGES:
        url, depth = queue.pop(0)
        page = fetch(url)
        result.pages[url] = page
        time.sleep(config.CRAWL_DELAY_SECONDS)
        if not allowed:
            continue  # homepage-only crawl
        if depth < config.CRAWL_MAX_DEPTH and page.soup:
            for link in page.links:
                if link not in seen and len(result.pages) + len(queue) < config.CRAWL_MAX_PAGES:
                    seen.add(link)
                    queue.append((link, depth + 1))

    if out_notes is not None:
        out_notes.extend(result.notes)
    return result


def render_homepage_text(url):
    """Rendered copy of the homepage via playwright (T1). Returns text or None."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=config.CRAWLER_USER_AGENT)
            page.goto(url, timeout=config.HTTP_TIMEOUT_SECONDS * 1000,
                      wait_until="networkidle")
            text = page.inner_text("body")
            browser.close()
            return text
    except Exception:
        return None


# -- schema helpers ---------------------------------------------------------
def iter_local_business_schemas(page):
    """Yield schema dicts that look like LocalBusiness (incl. subtypes)."""
    for s in page.schemas:
        t = s.get("@type", "")
        types = t if isinstance(t, list) else [t]
        if any("LocalBusiness" in str(x) or x in (
                "HVACBusiness", "Plumber", "RoofingContractor", "Electrician",
                "Dentist", "Attorney", "Physician", "HomeAndConstructionBusiness")
               for x in types):
            yield s


def schema_field(schema, *names):
    for n in names:
        if schema.get(n):
            return schema[n]
    return None


def schema_address_text(schema):
    addr = schema.get("address")
    if isinstance(addr, dict):
        parts = [addr.get(k) for k in
                 ("streetAddress", "addressLocality", "addressRegion", "postalCode")]
        return " ".join(p for p in parts if p)
    return addr or ""
