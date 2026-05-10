"""
Ag news headlines from USDA Market News (marsapi.ams.usda.gov).
Returns recent grain market reports with links to the real USDA report pages.
Used by the /market dashboard endpoint.
"""

import os
import requests
from backend.constants import USDA_BASE

_UA = {"User-Agent": "Silo/1.0 (grain-pricing-tool)"}

# Public USDA Market News report viewer — slug_id is the numeric ID from the API
_AMS_VIEWER_BASE = "https://mymarketnews.ams.usda.gov/viewReport"

# Search terms to pull relevant grain/oilseed reports
_GRAIN_QUERIES = ["grain", "corn", "wheat", "soybean"]

_GRAIN_KEYWORDS = {"grain", "corn", "wheat", "soybean", "oilseed", "elevator", "export", "crop"}


def _auth() -> tuple[str, str] | None:
    key = os.getenv("USDA_API_KEY", "")
    return (key, "") if key else None


def get_ag_headlines(max_total: int = 9) -> list[dict]:
    """
    Fetch recent USDA grain market news reports.
    Each item: {source, title, link, published}
    Returns empty list if USDA is unreachable or no key configured.
    """
    auth = _auth()
    if not auth:
        return []

    seen_slugs: set[str] = set()
    headlines: list[dict] = []

    for query in _GRAIN_QUERIES:
        if len(headlines) >= max_total:
            break
        try:
            r = requests.get(
                f"{USDA_BASE}/reports",
                auth=auth,
                params={"q": query, "sort_by": "published_date", "sort_order": "desc"},
                timeout=8,
            )
            if r.status_code != 200:
                continue

            # API returns a list directly (not wrapped in {"results": ...})
            reports = r.json() if isinstance(r.json(), list) else r.json().get("results", [])

            for report in reports[:8]:
                if len(headlines) >= max_total:
                    break

                slug_id = str(report.get("slug_id", "")).strip()
                if not slug_id or slug_id in seen_slugs:
                    continue

                title = (report.get("report_title") or "").strip()
                published = (report.get("published_date") or "").strip()

                if not title:
                    continue

                # Filter to grain-relevant reports
                title_lower = title.lower()
                if not any(kw in title_lower for kw in _GRAIN_KEYWORDS):
                    continue

                seen_slugs.add(slug_id)
                link = f"{_AMS_VIEWER_BASE}/{slug_id}"

                headlines.append({
                    "source": "USDA Market News",
                    "title": title,
                    "link": link,
                    "published": published[:10] if published else "",
                })
        except Exception:
            continue

    return headlines
