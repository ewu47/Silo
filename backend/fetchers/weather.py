import requests
from geopy.geocoders import Nominatim
from backend.constants import NWS_BASE

_UA = {"User-Agent": "Silo/1.0 (grain-pricing-tool)"}

# Stress keywords and their severity weights
_HIGH_STRESS = {"drought", "extreme", "severe", "flood", "tornado", "freeze", "blizzard", "ice storm"}
_MED_STRESS  = {"dry", "frost", "heat", "storm", "rain", "snow", "wind", "humid"}


def _geocode(address: str) -> tuple[float, float] | None:
    try:
        loc = Nominatim(user_agent="silo").geocode(address, timeout=5)
        return (loc.latitude, loc.longitude) if loc else None
    except Exception:
        return None


def _classify_risk(periods: list[dict]) -> tuple[str, float, float]:
    """
    Analyze forecast periods for weather stress signals.
    Returns (risk_level, disruption_index, precip_anomaly).

    disruption_index: 0.0–1.0 scale for MPI
    precip_anomaly:   rough z-score proxy (-1 to +1)
    """
    stress_score = 0.0
    total_precip_pct = 0.0
    n = len(periods)

    for period in periods:
        forecast_text = period.get("detailedForecast", "") or period.get("shortForecast", "")
        lower = forecast_text.lower()

        for kw in _HIGH_STRESS:
            if kw in lower:
                stress_score += 2.0
                break
        else:
            for kw in _MED_STRESS:
                if kw in lower:
                    stress_score += 0.5
                    break

        precip = period.get("probabilityOfPrecipitation", {})
        if isinstance(precip, dict):
            val = precip.get("value")
            if val is not None:
                total_precip_pct += float(val)

    avg_precip = (total_precip_pct / n) if n > 0 else 0.0
    # Normalize disruption index to 0–1 (cap at 6.0 raw stress)
    disruption_index = min(stress_score / 6.0, 1.0)

    # Precip anomaly: >60% avg precip → positive shock, <20% → negative (drought)
    if avg_precip > 60:
        precip_anomaly = 0.5
    elif avg_precip < 20:
        precip_anomaly = -0.5
    else:
        precip_anomaly = 0.0

    if disruption_index >= 0.5:
        risk_level = "high"
    elif disruption_index >= 0.2:
        risk_level = "medium"
    else:
        risk_level = "low"

    return risk_level, round(disruption_index, 3), precip_anomaly


def get_weather_data(farm_address: str) -> dict:
    """
    Return structured weather features for the farm location.
    Keys: summary, risk_level, disruption_index, precip_anomaly
    Fallback: low-risk defaults if any step fails.
    """
    defaults = {
        "summary": None,
        "risk_level": "low",
        "disruption_index": 0.0,
        "precip_anomaly": 0.0,
    }

    coords = _geocode(farm_address)
    if not coords:
        return defaults
    lat, lon = coords

    try:
        r = requests.get(f"{NWS_BASE}/points/{lat:.4f},{lon:.4f}", headers=_UA, timeout=8)
        if r.status_code != 200:
            return defaults
        forecast_url = r.json()["properties"]["forecast"]

        r2 = requests.get(forecast_url, headers=_UA, timeout=8)
        if r2.status_code != 200:
            return defaults

        periods = r2.json()["properties"]["periods"][:7]  # 7 periods for better signal

        risk_level, disruption_index, precip_anomaly = _classify_risk(periods)

        # Build summary string from first 3 periods
        parts = []
        for p in periods[:3]:
            precip = p.get("probabilityOfPrecipitation", {})
            precip_val = precip.get("value") if isinstance(precip, dict) else None
            precip_str = f", {precip_val}% precip" if precip_val is not None else ""
            parts.append(
                f"{p['name']}: {p['temperature']}°{p['temperatureUnit']}, "
                f"{p['shortForecast']}{precip_str}"
            )
        summary = " | ".join(parts)

        return {
            "summary": summary,
            "risk_level": risk_level,
            "disruption_index": disruption_index,
            "precip_anomaly": precip_anomaly,
        }
    except Exception:
        return defaults
