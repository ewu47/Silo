"""
USDA Market News API — regional cash price and basis estimation.

Role in the system:
  - Provides regional benchmark cash price (NOT the farmer's executable bid)
  - Used to compute B_region = P_cash_regional - P_futures
  - A wider local basis vs regional basis = farmer is being underpaid relative to market
  - Falls back to commodity-specific historical average basis if API unavailable

Auth: HTTP Basic with USDA_API_KEY (username=key, password empty).
"""

import os
import requests
from backend.constants import USDA_BASE, FALLBACK_BASIS

_COMMODITY_SEARCH_TERMS = {
    "soybeans": ["soybean", "soy"],
    "corn":     ["corn"],
    "wheat":    ["wheat"],
}

# Known stable report slugs for IL grain cash bids (as of 2024)
# These are read from /reports and hardcoded as a performance optimization.
# If they return 404, the fetcher falls back to dynamic search.
_PREFERRED_SLUGS = {
    "soybeans": "SJ_GR110",
    "corn":     "SJ_GR110",
    "wheat":    "SJ_GR111",
}


def _auth() -> tuple[str, str] | None:
    key = os.getenv("USDA_API_KEY", "")
    return (key, "") if key else None


def _try_report(slug: str, commodity: str, auth: tuple) -> float | None:
    """Attempt to extract a regional cash bid from a specific report slug."""
    try:
        r = requests.get(
            f"{USDA_BASE}/reports/{slug}",
            auth=auth,
            params={"q": _COMMODITY_SEARCH_TERMS[commodity][0]},
            timeout=10,
        )
        if r.status_code != 200:
            return None

        results = r.json().get("results", [])
        if not results:
            return None

        # Search for a per-bushel price field in the most recent result
        for row in results[:10]:
            for field in ("Price", "price", "CashPrice", "Avg_Price", "avg_price"):
                val = row.get(field)
                if val is not None:
                    try:
                        price = float(str(val).replace("$", "").replace(",", ""))
                        # Sanity check: expect $2–$20/bu range
                        if 2.0 < price < 20.0:
                            return price
                    except (ValueError, TypeError):
                        continue
        return None
    except Exception:
        return None


def _dynamic_search(commodity: str, auth: tuple) -> float | None:
    """Search the full report list for a relevant grain cash price report."""
    try:
        r = requests.get(
            f"{USDA_BASE}/reports",
            auth=auth,
            params={"q": _COMMODITY_SEARCH_TERMS[commodity][0]},
            timeout=10,
        )
        if r.status_code != 200:
            return None

        reports = r.json().get("results", [])

        # Prefer IL daily grain price reports
        def score(rpt: dict) -> int:
            title = (rpt.get("reportTitle") or "").lower()
            s = 0
            if "illinois" in title or " il " in title:
                s += 3
            if "daily" in title:
                s += 2
            if "grain" in title or "elevator" in title:
                s += 2
            if any(t in title for t in _COMMODITY_SEARCH_TERMS[commodity]):
                s += 2
            return s

        ranked = sorted(reports, key=score, reverse=True)
        for rpt in ranked[:5]:
            slug = rpt.get("slug_id") or rpt.get("id")
            if slug:
                price = _try_report(str(slug), commodity, auth)
                if price is not None:
                    return price
        return None
    except Exception:
        return None


def get_regional_cash_price(commodity: str) -> float | None:
    """
    Return estimated regional cash price $/bu for the commodity.
    Used only as a benchmark — not an executable farmer price.
    Returns None if USDA is unavailable (caller uses fallback basis).
    """
    auth = _auth()
    if not auth:
        return None

    # Try preferred slug first (fast path)
    preferred = _PREFERRED_SLUGS.get(commodity)
    if preferred:
        price = _try_report(preferred, commodity, auth)
        if price is not None:
            return price

    # Fall back to dynamic report search
    return _dynamic_search(commodity, auth)


def get_basis_estimate(commodity: str, futures_price: float) -> float:
    """
    Return B_region = P_cash_regional - P_futures ($/bu).
    Falls back to commodity-specific historical average if USDA unavailable.
    """
    regional_cash = get_regional_cash_price(commodity)
    if regional_cash is not None:
        basis = regional_cash - futures_price
        # Sanity clamp: basis historically stays within ±$1.50/bu
        basis = max(-1.50, min(1.50, basis))
        return round(basis, 3)
    return FALLBACK_BASIS[commodity]
