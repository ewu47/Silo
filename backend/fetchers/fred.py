import os
import requests
from backend.constants import (
    FRED_BASE, FRED_DIESEL_SERIES, FRED_TBILL_SERIES,
    FRED_DIESEL_BY_PADD, STATE_TO_PADD,
    FALLBACK_DIESEL, FALLBACK_TBILL_RATE,
)


def _fetch_series(series_id: str) -> float | None:
    api_key = os.getenv("FRED_API_KEY", "")
    try:
        r = requests.get(
            FRED_BASE,
            params={"series_id": series_id, "file_type": "json", "api_key": api_key},
            timeout=8,
        )
        if r.status_code != 200:
            return None
        obs = r.json().get("observations", [])
        latest = next((o for o in reversed(obs) if o["value"] != "."), None)
        return float(latest["value"]) if latest else None
    except Exception:
        return None


def get_diesel_price(state: str | None = None) -> float:
    """
    Return diesel $/gal. If a US state abbreviation is provided, fetches the
    PADD regional price from FRED (e.g. PADD 2 = Midwest). Falls back to the
    national average series, then to the static fallback.
    """
    if state:
        padd = STATE_TO_PADD.get(state.upper())
        if padd:
            series = FRED_DIESEL_BY_PADD[padd]
            price = _fetch_series(series)
            if price is not None:
                return price
    return _fetch_series(FRED_DIESEL_SERIES) or FALLBACK_DIESEL


def get_tbill_rate() -> float:
    return _fetch_series(FRED_TBILL_SERIES) or FALLBACK_TBILL_RATE
