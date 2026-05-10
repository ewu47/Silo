import requests
from geopy.geocoders import Nominatim

NWS_BASE = "https://api.weather.gov"
_UA = {"User-Agent": "Silo/1.0"}


def _geocode(address: str) -> tuple[float, float] | None:
    try:
        loc = Nominatim(user_agent="silo").geocode(address, timeout=5)
        return (loc.latitude, loc.longitude) if loc else None
    except Exception:
        return None


def get_weather_summary(farm_address: str) -> str | None:
    coords = _geocode(farm_address)
    if not coords:
        return None
    lat, lon = coords
    try:
        r = requests.get(f"{NWS_BASE}/points/{lat},{lon}", headers=_UA, timeout=8)
        if r.status_code != 200:
            return None
        forecast_url = r.json()["properties"]["forecast"]

        r2 = requests.get(forecast_url, headers=_UA, timeout=8)
        if r2.status_code != 200:
            return None

        periods = r2.json()["properties"]["periods"][:3]
        parts = []
        for p in periods:
            precip = p.get("probabilityOfPrecipitation", {}).get("value")
            precip_str = f", {precip}% precip" if precip is not None else ""
            parts.append(f"{p['name']}: {p['temperature']}°{p['temperatureUnit']}, {p['shortForecast']}{precip_str}")
        return " | ".join(parts)
    except Exception:
        return None
