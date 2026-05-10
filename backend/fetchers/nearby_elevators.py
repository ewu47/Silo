"""
Nearby grain elevator lookup via Gemini.

Geocodes the farmer's address with Nominatim to get coordinates, then asks
Gemini to return grain elevators within the requested radius. Gemini knows
real elevator/co-op locations far better than any static dataset.
"""

import os
import json
from geopy.geocoders import Nominatim
from google import genai

ELEVATOR_PROMPT = """You are a grain market data assistant. Given a farm location and radius, return a JSON array of real grain elevators, co-ops, or grain terminals within that radius.

Return ONLY a valid JSON array — no markdown, no explanation. Each object must have exactly these fields:
- "name": string (elevator/co-op name)
- "address": string (full street address)
- "lat": number (latitude, decimal degrees)
- "lon": number (longitude, decimal degrees)
- "distance_miles": number (approximate road distance from the farm, one decimal place)

Rules:
- Only include real, currently operating grain elevators or co-ops that accept grain.
- Sort by distance_miles ascending.
- Include up to 15 results.
- If fewer than 3 real elevators exist within the radius, expand slightly and note actual distance.
- Do not invent locations. If you are uncertain about an address, omit that elevator.

Farm location: {address} (approximately {lat:.4f}, {lon:.4f})
Search radius: {radius} miles
"""


def get_nearby_elevators(farm_address: str, radius_miles: float = 50) -> list[dict]:
    """
    Geocode farm_address with Nominatim, then ask Gemini for nearby grain elevators.
    Returns empty list on failure rather than crashing.
    """
    # Geocode the farm address to get coordinates for context
    try:
        geolocator = Nominatim(user_agent="silo-grain-recommender/1.0", timeout=6)
        location = geolocator.geocode(farm_address)
        if not location:
            return _gemini_elevators_no_coords(farm_address, radius_miles)
        lat, lon = location.latitude, location.longitude
    except Exception:
        return _gemini_elevators_no_coords(farm_address, radius_miles)

    return _gemini_elevators(farm_address, lat, lon, radius_miles)


def _gemini_elevators(address: str, lat: float, lon: float, radius: float) -> list[dict]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return []

    prompt = ELEVATOR_PROMPT.format(address=address, lat=lat, lon=lon, radius=radius)

    try:
        client = genai.Client(api_key=api_key)
        result = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        raw = result.text.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]
        elevators = json.loads(raw)
        return [_normalize(e) for e in elevators if _valid(e)]
    except Exception:
        return []


def _gemini_elevators_no_coords(address: str, radius: float) -> list[dict]:
    """Fallback when geocoding fails — omit coordinates from prompt."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return []

    prompt = (
        f"Return a JSON array of up to 15 real grain elevators or co-ops within {radius} miles of: {address}. "
        "Each object: name (string), address (string), lat (number), lon (number), distance_miles (number). "
        "Sort by distance_miles ascending. Return ONLY valid JSON, no markdown."
    )

    try:
        client = genai.Client(api_key=api_key)
        result = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        raw = result.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]
        elevators = json.loads(raw)
        return [_normalize(e) for e in elevators if _valid(e)]
    except Exception:
        return []


def _valid(e: dict) -> bool:
    return all(k in e for k in ("name", "address", "lat", "lon", "distance_miles"))


def _normalize(e: dict) -> dict:
    return {
        "name": str(e["name"]),
        "address": str(e["address"]),
        "lat": float(e["lat"]),
        "lon": float(e["lon"]),
        "distance_miles": round(float(e["distance_miles"]), 1),
    }
