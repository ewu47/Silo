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
from backend.constants import USDA_BASE, FALLBACK_BASIS, STATE_TO_USDA_REGION

_COMMODITY_SEARCH_TERMS = {
    "soybeans": ["soybean", "soy"],
    "corn":     ["corn"],
    "wheat":    ["wheat"],
}

# Known stable report slugs per state (as of 2024).
# Keyed by state abbreviation; each commodity may have a different slug.
# If a state isn't listed or returns 404, falls back to dynamic search.
_PREFERRED_SLUGS_BY_STATE: dict[str, dict[str, str]] = {
    "IL": {"soybeans": "SJ_GR110", "corn": "SJ_GR110", "wheat": "SJ_GR111"},
    "IA": {"soybeans": "SJ_GR112", "corn": "SJ_GR112", "wheat": "SJ_GR113"},
    "IN": {"soybeans": "SJ_GR114", "corn": "SJ_GR114", "wheat": "SJ_GR115"},
    "OH": {"soybeans": "SJ_GR116", "corn": "SJ_GR116", "wheat": "SJ_GR117"},
    "MN": {"soybeans": "SJ_GR118", "corn": "SJ_GR118", "wheat": "SJ_GR119"},
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


def _dynamic_search(commodity: str, auth: tuple, state: str | None) -> float | None:
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
        region_terms = STATE_TO_USDA_REGION.get(state or "", [])

        def score(rpt: dict) -> int:
            title = (rpt.get("reportTitle") or "").lower()
            s = 0
            # Boost reports matching the farm's state; fall back to any grain report
            for term in region_terms:
                if term in title:
                    s += 3
                    break
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


def get_regional_cash_price(commodity: str, state: str | None = None) -> float | None:
    """
    Return estimated regional cash price $/bu for the commodity.
    state: 2-letter abbreviation used to select a state-specific USDA report.
    Returns None if USDA is unavailable (caller uses fallback basis).
    """
    auth = _auth()
    if not auth:
        return None

    # Try preferred slug for the state first (fast path)
    state_slugs = _PREFERRED_SLUGS_BY_STATE.get(state or "", {})
    preferred = state_slugs.get(commodity)
    if preferred:
        price = _try_report(preferred, commodity, auth)
        if price is not None:
            return price

    return _dynamic_search(commodity, auth, state)


def get_basis_estimate(commodity: str, futures_price: float, state: str | None = None) -> float:
    """
    Return B_region = P_cash_regional - P_futures ($/bu).
    Uses state-specific USDA report when available.
    Falls back to commodity-specific historical average if USDA unavailable.
    """
    regional_cash = get_regional_cash_price(commodity, state)
    if regional_cash is not None:
        basis = regional_cash - futures_price
        # Sanity clamp: basis historically stays within ±$1.50/bu
        basis = max(-1.50, min(1.50, basis))
        return round(basis, 3)
    return FALLBACK_BASIS[commodity]
