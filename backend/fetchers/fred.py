import os
import requests
from backend.constants import FRED_BASE, FRED_DIESEL_SERIES, FRED_TBILL_SERIES
from backend.constants import FALLBACK_DIESEL, FALLBACK_TBILL_RATE


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


def get_diesel_price() -> float:
    return _fetch_series(FRED_DIESEL_SERIES) or FALLBACK_DIESEL


def get_tbill_rate() -> float:
    return _fetch_series(FRED_TBILL_SERIES) or FALLBACK_TBILL_RATE
