"""
Nearby grain elevator lookup.

Tries Gemini first for richer/more current results.
Falls back to the static dataset if Gemini is unavailable, rate-limited, or returns empty.
"""

import os
import json
from geopy.geocoders import Nominatim
from geopy.distance import geodesic

# ── Static fallback dataset ───────────────────────────────────────────────────

ELEVATORS: list[dict] = [
    # Central IL
    {"name": "ADM Grain – Decatur",            "address": "4666 E Pershing Rd, Decatur, IL 62526",             "lat": 39.8403, "lon": -88.9548},
    {"name": "Heartland Coop – Tuscola",        "address": "121 N Main St, Tuscola, IL 61953",                  "lat": 39.8012, "lon": -88.2837},
    {"name": "The Andersons – Champaign",       "address": "2000 N Mattis Ave, Champaign, IL 61821",            "lat": 40.1164, "lon": -88.2434},
    {"name": "Louis Dreyfus – Gibson City",     "address": "400 N Sangamon Ave, Gibson City, IL 60936",         "lat": 40.4625, "lon": -88.3731},
    {"name": "Farmers Grain – Sullivan",        "address": "201 W Jackson St, Sullivan, IL 61951",              "lat": 39.5959, "lon": -88.6065},
    {"name": "Central Grain – Assumption",      "address": "600 N Illinois Ave, Assumption, IL 62510",          "lat": 39.5231, "lon": -89.0487},
    # Northern IL
    {"name": "CHS Inc – Kankakee",              "address": "1340 E Court St, Kankakee, IL 60901",               "lat": 41.1200, "lon": -87.8611},
    {"name": "GROWMARK FS – Bloomington",       "address": "1701 Towanda Ave, Bloomington, IL 61701",           "lat": 40.4842, "lon": -88.9937},
    {"name": "Prairie Elevator – Lincoln",      "address": "1120 N Kickapoo St, Lincoln, IL 62656",             "lat": 40.1489, "lon": -89.3651},
    {"name": "County Co-op – Pontiac",          "address": "900 N Mill St, Pontiac, IL 61764",                  "lat": 40.8806, "lon": -88.6298},
    {"name": "Cardinal Grain – Kewanee",        "address": "200 S Chestnut St, Kewanee, IL 61443",              "lat": 41.2453, "lon": -89.9248},
    {"name": "Rock River Grain – Rock Island",  "address": "200 1st Ave, Rock Island, IL 61201",                "lat": 41.5095, "lon": -90.5790},
    {"name": "Tri-County Elevators – Monmouth", "address": "300 N Main St, Monmouth, IL 61462",                 "lat": 40.9117, "lon": -90.6470},
    {"name": "Heritage Grain – Galesburg",      "address": "700 E Losey St, Galesburg, IL 61401",               "lat": 40.9478, "lon": -90.3712},
    # East-central IL
    {"name": "Cargill – Rantoul",               "address": "200 W Grove Ave, Rantoul, IL 61866",                "lat": 40.3073, "lon": -88.1561},
    {"name": "Bunge Grain – Danville",          "address": "500 Industrial Blvd, Danville, IL 61832",           "lat": 40.1245, "lon": -87.6298},
    {"name": "AgriCo-op – Paris",               "address": "200 N Central Ave, Paris, IL 61944",                "lat": 39.6109, "lon": -87.6965},
    {"name": "Southeast Grain – Mattoon",       "address": "2025 Dewitt Ave E, Mattoon, IL 61938",              "lat": 39.4831, "lon": -88.3731},
    # Southern IL
    {"name": "Richland Grain – Olney",          "address": "800 E Laurel St, Olney, IL 62450",                  "lat": 38.7306, "lon": -88.0851},
    {"name": "Southern IL Grain – Mt Vernon",   "address": "1000 S 10th St, Mount Vernon, IL 62864",            "lat": 38.3173, "lon": -88.9031},
    {"name": "White County Grain – Carmi",      "address": "200 E Main St, Carmi, IL 62821",                    "lat": 38.0870, "lon": -88.1589},
    # Western IL
    {"name": "Western Grain – Macomb",          "address": "1200 Industrial Dr, Macomb, IL 61455",              "lat": 40.4589, "lon": -90.6715},
    {"name": "Heartland Coop – Quincy",         "address": "330 S 36th St, Quincy, IL 62301",                   "lat": 39.9356, "lon": -91.4099},
    {"name": "Gateway Grain – Alton",           "address": "1 Harbor Dr, Alton, IL 62002",                      "lat": 38.8906, "lon": -90.1844},
    {"name": "Prairie State Grain – Jerseyville","address": "500 W Pearl St, Jerseyville, IL 62052",            "lat": 39.1201, "lon": -90.3276},
    {"name": "Midwest Grain – Peoria",          "address": "2000 SW Washington St, Peoria, IL 61602",           "lat": 40.6936, "lon": -89.5890},
    # Border states
    {"name": "Beck's Hybrids – Covington, IN",  "address": "500 Commerce Dr, Covington, IN 47932",              "lat": 40.1403, "lon": -87.4081},
    {"name": "Cargill – Indianapolis, IN",      "address": "3100 S Harding St, Indianapolis, IN 46217",         "lat": 39.7234, "lon": -86.1829},
    {"name": "MFA Inc – Hannibal, MO",          "address": "1 Broadway, Hannibal, MO 63401",                    "lat": 39.7084, "lon": -91.3585},
    {"name": "Gavilon – St Louis, MO",          "address": "1400 S Third St, St Louis, MO 63104",               "lat": 38.6019, "lon": -90.2162},
    {"name": "AGCO – Ames, IA",                 "address": "521 S Duff Ave, Ames, IA 50010",                    "lat": 42.0308, "lon": -93.6319},
    {"name": "Cargill – Iowa Falls, IA",        "address": "600 N Oak St, Iowa Falls, IA 50126",                "lat": 42.5233, "lon": -93.2549},
    {"name": "Southwest Iowa Grain – Red Oak",  "address": "302 E Reed St, Red Oak, IA 51566",                  "lat": 41.0019, "lon": -95.2308},
    {"name": "Consolidated Grain – Lafayette, IN","address": "3700 S 9th St, Lafayette, IN 47909",              "lat": 40.3706, "lon": -86.8927},
    {"name": "The Andersons – Maumee, OH",      "address": "480 W Dussel Dr, Maumee, OH 43537",                 "lat": 41.5645, "lon": -83.6613},
    {"name": "Cargill – Toledo, OH",            "address": "1 Maritime Plaza, Toledo, OH 43604",                "lat": 41.6639, "lon": -83.5552},
    {"name": "Landmark Services – Cottage Grove, WI","address": "4585 County Rd N, Cottage Grove, WI 53527",   "lat": 43.0836, "lon": -89.2020},
    {"name": "CHS – Mankato, MN",               "address": "1010 Lor Ray Dr, North Mankato, MN 56003",          "lat": 44.1483, "lon": -94.0452},
    {"name": "Paducah Grain – Paducah, KY",     "address": "1 Riverport Rd, Paducah, KY 42001",                 "lat": 37.0834, "lon": -88.5701},
    {"name": "Henderson Grain – Henderson, KY", "address": "200 Water St, Henderson, KY 42420",                 "lat": 37.8362, "lon": -87.5900},
]

ELEVATOR_PROMPT = """You are a grain market data assistant. Return a JSON array of real grain elevators, co-ops, or grain terminals within {radius} miles of this location.

Farm: {address} (lat {lat:.4f}, lon {lon:.4f})

Return ONLY a valid JSON array — no markdown, no explanation. Each object:
  "name": string, "address": string, "lat": number, "lon": number, "distance_miles": number

Rules: real operating locations only, sort by distance_miles ascending, up to 15 results."""


def get_nearby_elevators(farm_address: str, radius_miles: float = 50) -> list[dict]:
    """Try Gemini first; fall back to static dataset if Gemini is unavailable or returns empty."""
    # Geocode once — needed for both paths
    try:
        geolocator = Nominatim(user_agent="silo-grain-recommender/1.0", timeout=6)
        location = geolocator.geocode(farm_address)
        farm_coords = (location.latitude, location.longitude) if location else None
    except Exception:
        farm_coords = None

    # Try Gemini
    gemini_results = _try_gemini(farm_address, farm_coords, radius_miles)
    if gemini_results:
        return gemini_results

    # Fall back to static dataset
    if not farm_coords:
        return []
    return _static_lookup(farm_coords, radius_miles)


def _try_gemini(farm_address: str, farm_coords: tuple | None, radius: float) -> list[dict]:
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        return []
    try:
        from google import genai
        if farm_coords:
            prompt = ELEVATOR_PROMPT.format(
                address=farm_address, lat=farm_coords[0], lon=farm_coords[1], radius=radius
            )
        else:
            prompt = (
                f"Return a JSON array of up to 15 real grain elevators within {radius} miles of: {farm_address}. "
                "Each object: name, address, lat, lon, distance_miles. Sort ascending. ONLY valid JSON."
            )
        client = genai.Client(api_key=api_key)
        result = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        raw = result.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        elevators = json.loads(raw)
        validated = [_normalize(e) for e in elevators if _valid(e)]
        return validated  # empty list triggers fallback
    except Exception:
        return []


def _static_lookup(farm_coords: tuple, radius_miles: float) -> list[dict]:
    results = []
    for elev in ELEVATORS:
        dist = geodesic(farm_coords, (elev["lat"], elev["lon"])).miles
        if dist <= radius_miles:
            results.append({
                "name": elev["name"],
                "address": elev["address"],
                "lat": elev["lat"],
                "lon": elev["lon"],
                "distance_miles": round(dist, 1),
            })
    results.sort(key=lambda x: x["distance_miles"])
    return results


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
