import os
import requests
from geopy.distance import geodesic
from geopy.geocoders import Nominatim

_geolocator = Nominatim(user_agent="silo")


def _geocode(address: str) -> tuple[float, float] | None:
    try:
        loc = _geolocator.geocode(address, timeout=5)
        return (loc.latitude, loc.longitude) if loc else None
    except Exception:
        return None


def _google_distance(origin: str, destinations: list[str]) -> list[float] | None:
    api_key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not api_key:
        return None
    try:
        r = requests.get(
            "https://maps.googleapis.com/maps/api/distancematrix/json",
            params={
                "origins": origin,
                "destinations": "|".join(destinations),
                "units": "imperial",
                "key": api_key,
            },
            timeout=8,
        )
        data = r.json()
        if data.get("status") != "OK":
            return None
        miles = []
        for el in data["rows"][0]["elements"]:
            if el.get("status") == "OK":
                miles.append(el["distance"]["value"] / 1609.34)
            else:
                miles.append(None)
        return miles
    except Exception:
        return None


def _geopy_distance(origin: str, destination: str) -> float | None:
    a = _geocode(origin)
    b = _geocode(destination)
    if a and b:
        # multiply by 1.25 to approximate driving vs straight-line
        return geodesic(a, b).miles * 1.25
    return None


def get_distances(farm_address: str, buyer_addresses: list[str]) -> list[float]:
    """Return driving distances in miles for each buyer. Falls back to geopy if Google fails."""
    google = _google_distance(farm_address, buyer_addresses)
    results = []
    for i, addr in enumerate(buyer_addresses):
        if google and google[i] is not None:
            results.append(round(google[i], 1))
        else:
            fallback = _geopy_distance(farm_address, addr)
            results.append(round(fallback, 1) if fallback else 20.0)
    return results
