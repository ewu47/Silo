"""
Ag news headlines via RSS — no API key required.
Used by the /market dashboard endpoint.
"""

import requests
import xml.etree.ElementTree as ET

# Free RSS feeds relevant to grain/commodity markets
_FEEDS = [
    ("DTN Ag News",         "https://www.dtnpf.com/agriculture/web/ag/news/rss"),
    ("USDA Newsroom",       "https://www.usda.gov/rss/home.xml"),
    ("World Grain",         "https://www.world-grain.com/rss/news"),
]

_UA = {"User-Agent": "Silo/1.0 (grain-pricing-tool)"}


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
                link  = item.findtext("link", "").strip()
                pub   = item.findtext("pubDate", "").strip()
                if title:
                    headlines.append({"source": source, "title": title, "link": link, "published": pub})
        except Exception:
            continue
    return headlines
