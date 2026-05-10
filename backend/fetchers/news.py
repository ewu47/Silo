"""
Ag news headlines via RSS — no API key required.
Used by the /market dashboard endpoint.
"""

import requests
import xml.etree.ElementTree as ET

# Free RSS feeds relevant to grain/commodity markets
_FEEDS = [
    ("DTN Ag News",   "https://www.dtnpf.com/agriculture/web/ag/news/rss"),
    ("USDA Newsroom", "https://www.usda.gov/rss/home.xml"),
    ("World Grain",   "https://www.world-grain.com/rss/news"),
]

_UA = {"User-Agent": "Silo/1.0 (grain-pricing-tool)"}


def _extract_link(item: ET.Element) -> str:
    # Standard child element
    link = item.findtext("link", "").strip()
    if link:
        return link
    # Some feeds put the URL in <guid isPermaLink="true"> or just <guid>
    guid = item.find("guid")
    if guid is not None:
        is_permalink = guid.attrib.get("isPermaLink", "true").lower() != "false"
        val = (guid.text or "").strip()
        if val and is_permalink and val.startswith("http"):
            return val
    # Atom-style <link href="..."/> mixed into RSS
    for child in item:
        if child.tag.endswith("link"):
            href = child.attrib.get("href", "").strip() or (child.text or "").strip()
            if href.startswith("http"):
                return href
    return ""


def get_ag_headlines(max_per_feed: int = 3) -> list[dict]:
    """
    Return up to max_per_feed headlines from each feed.
    Each item: {source, title, link, published}
    Falls back to empty list if all feeds fail.
    """
    headlines = []
    for source, url in _FEEDS:
        try:
            r = requests.get(url, headers=_UA, timeout=6)
            if r.status_code != 200:
                continue
            root = ET.fromstring(r.content)
            items = root.findall(".//item")[:max_per_feed]
            for item in items:
                title = item.findtext("title", "").strip()
                link  = _extract_link(item)
                pub   = item.findtext("pubDate", "").strip()
                if title and link:
                    headlines.append({"source": source, "title": title, "link": link, "published": pub})
        except Exception:
            continue
    return headlines
