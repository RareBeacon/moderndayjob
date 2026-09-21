#!/usr/bin/env python3
"""Technical SEO crawler (Workstream A, Stage 3).

Fetches every URL in the live sitemap and records the A9.1 checklist facts:
HTTP status, title + length, meta description + length, canonical, robots
meta, H1 count, and JSON-LD structured data types. Purely observational;
results go to stdout as JSON.
"""
import json
import re
import sys
import urllib.request

SITEMAP = "https://jobiest.com/sitemap.xml"
UA = {"User-Agent": "Mozilla/5.0 (compatible; JobiestSEOAudit/1.0)"}


def fetch(url, timeout=20):
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, res.read().decode("utf-8", "replace"), dict(res.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace"), dict(e.headers)
    except Exception as e:
        return 0, f"ERROR: {e}", {}


def audit(url):
    status, html, headers = fetch(url)
    if status == 0:
        return {"url": url, "status": 0, "error": html[:200]}

    title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
    title = re.sub(r"\s+", " ", title_m.group(1)).strip() if title_m else ""
    md_m = re.search(r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']', html, re.S | re.I) or re.search(
        r'<meta[^>]+content=["\'](.*?)["\'][^>]+name=["\']description["\']', html, re.S | re.I)
    meta_desc = re.sub(r"\s+", " ", md_m.group(1)).strip() if md_m else ""
    canon_m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\'](.*?)["\']', html, re.S | re.I) or re.search(
        r'<link[^>]+href=["\'](.*?)["\'][^>]+rel=["\']canonical["\']', html, re.S | re.I)
    canonical = canon_m.group(1) if canon_m else ""
    robots_m = re.search(r'<meta[^>]+name=["\']robots["\'][^>]+content=["\'](.*?)["\']', html, re.S | re.I)
    robots = robots_m.group(1) if robots_m else ""
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", html, re.S | re.I)
    h1s = [re.sub(r"<[^>]+>", "", h).strip() for h in h1s]
    ld_types = []
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html, re.S | re.I):
        try:
            data = json.loads(block.strip())
            items = data if isinstance(data, list) else [data]
            for item in items:
                if isinstance(item, dict):
                    t = item.get("@type")
                    if isinstance(t, list):
                        ld_types.extend(t)
                    elif t:
                        ld_types.append(t)
        except (json.JSONDecodeError, AttributeError):
            ld_types.append("INVALID_JSON_LD")
    words = len(re.sub(r"<[^>]+>", " ", re.sub(r"<script.*?</script>|<style.*?</style>", " ", html, flags=re.S)).split())
    return {
        "url": url,
        "status": status,
        "title": title,
        "title_len": len(title),
        "meta_desc": meta_desc,
        "meta_len": len(meta_desc),
        "canonical": canonical,
        "canonical_ok": canonical == url,
        "robots": robots,
        "h1_count": len(h1s),
        "h1": h1s[0] if h1s else "",
        "ld_types": sorted(set(ld_types)),
        "word_count": words,
    }


def main():
    status, xml, _ = fetch(SITEMAP)
    if status != 200:
        print(json.dumps({"error": f"sitemap fetch failed: {status}"}))
        sys.exit(1)
    urls = re.findall(r"<loc>(.*?)</loc>", xml)
    results = [audit(u) for u in urls]
    print(json.dumps(results, indent=1))


if __name__ == "__main__":
    main()
