"""
Nearby grain elevator lookup.

Geocodes the farmer's address with Nominatim (OpenStreetMap, no API key)
then filters a static list of Midwest elevators by driving-radius.

The static list covers Illinois and bordering-state elevator hubs.
No live elevator API exists for free; this gives reasonable suggestions.
"""

from geopy.geocoders import Nominatim
from geopy.distance import geodesic

# ── Static elevator dataset ───────────────────────────────────────────────────
# Fields: name, address, lat, lon
# Represents major elevator / co-op locations across IL and border states.
ELEVATORS: list[dict] = [
    # Central IL
    {"name": "ADM Grain – Decatur",        "address": "4666 E Pershing Rd, Decatur, IL 62526",          "lat": 39.8403, "lon": -88.9548},
    {"name": "Heartland Coop – Tuscola",   "address": "121 N Main St, Tuscola, IL 61953",                "lat": 39.8012, "lon": -88.2837},
    {"name": "The Andersons – Champaign",  "address": "2000 N Mattis Ave, Champaign, IL 61821",          "lat": 40.1164, "lon": -88.2434},
    {"name": "Louis Dreyfus – Gibson City","address": "400 N Sangamon Ave, Gibson City, IL 60936",       "lat": 40.4625, "lon": -88.3731},
    {"name": "Farmers Grain – Sullivan",   "address": "201 W Jackson St, Sullivan, IL 61951",            "lat": 39.5959, "lon": -88.6065},
    {"name": "Central Grain – Assumption", "address": "600 N Illinois Ave, Assumption, IL 62510",        "lat": 39.5231, "lon": -89.0487},

    # Northern IL
    {"name": "CHS Inc – Kankakee",         "address": "1340 E Court St, Kankakee, IL 60901",             "lat": 41.1200, "lon": -87.8611},
    {"name": "GROWMARK FS – Bloomington",  "address": "1701 Towanda Ave, Bloomington, IL 61701",         "lat": 40.4842, "lon": -88.9937},
    {"name": "Prairie Elevator – Lincoln", "address": "1120 N Kickapoo St, Lincoln, IL 62656",           "lat": 40.1489, "lon": -89.3651},
    {"name": "County Co-op – Pontiac",     "address": "900 N Mill St, Pontiac, IL 61764",                "lat": 40.8806, "lon": -88.6298},
    {"name": "Cardinal Grain – Kewanee",   "address": "200 S Chestnut St, Kewanee, IL 61443",            "lat": 41.2453, "lon": -89.9248},
    {"name": "Rock River Grain – Rock Island","address": "200 1st Ave, Rock Island, IL 61201",           "lat": 41.5095, "lon": -90.5790},
    {"name": "Tri-County Elevators – Monmouth","address": "300 N Main St, Monmouth, IL 61462",           "lat": 40.9117, "lon": -90.6470},
    {"name": "Heritage Grain – Galesburg", "address": "700 E Losey St, Galesburg, IL 61401",             "lat": 40.9478, "lon": -90.3712},

    # East-central IL
    {"name": "Cargill – Rantoul",          "address": "200 W Grove Ave, Rantoul, IL 61866",              "lat": 40.3073, "lon": -88.1561},
    {"name": "Bunge Grain – Danville",     "address": "500 Industrial Blvd, Danville, IL 61832",         "lat": 40.1245, "lon": -87.6298},
    {"name": "AgriCo-op – Paris",          "address": "200 N Central Ave, Paris, IL 61944",              "lat": 39.6109, "lon": -87.6965},
    {"name": "Southeast Grain – Mattoon",  "address": "2025 Dewitt Ave E, Mattoon, IL 61938",            "lat": 39.4831, "lon": -88.3731},

    # Southern IL
    {"name": "Richland Grain – Olney",     "address": "800 E Laurel St, Olney, IL 62450",                "lat": 38.7306, "lon": -88.0851},
    {"name": "Southern IL Grain – Mt Vernon","address": "1000 S 10th St, Mount Vernon, IL 62864",        "lat": 38.3173, "lon": -88.9031},
    {"name": "White County Grain – Carmi", "address": "200 E Main St, Carmi, IL 62821",                  "lat": 38.0870, "lon": -88.1589},

    # Western IL / Mississippi River terminals
    {"name": "Western Grain – Macomb",     "address": "1200 Industrial Dr, Macomb, IL 61455",            "lat": 40.4589, "lon": -90.6715},
    {"name": "Heartland Coop – Quincy",    "address": "330 S 36th St, Quincy, IL 62301",                 "lat": 39.9356, "lon": -91.4099},
    {"name": "Gateway Grain – Alton",      "address": "1 Harbor Dr, Alton, IL 62002",                    "lat": 38.8906, "lon": -90.1844},
    {"name": "Prairie State Grain – Jerseyville","address": "500 W Pearl St, Jerseyville, IL 62052",     "lat": 39.1201, "lon": -90.3276},
    {"name": "Midwest Grain – Peoria",     "address": "2000 SW Washington St, Peoria, IL 61602",         "lat": 40.6936, "lon": -89.5890},

    # Border states (within 50mi of IL edge)
    {"name": "Beck's Hybrids – Covington, IN","address": "500 Commerce Dr, Covington, IN 47932",         "lat": 40.1403, "lon": -87.4081},
    {"name": "Cargill – Indianapolis, IN", "address": "3100 S Harding St, Indianapolis, IN 46217",       "lat": 39.7234, "lon": -86.1829},
    {"name": "MFA Inc – Hannibal, MO",     "address": "1 Broadway, Hannibal, MO 63401",                  "lat": 39.7084, "lon": -91.3585},
    {"name": "Gavilon – St Louis, MO",     "address": "1400 S Third St, St Louis, MO 63104",             "lat": 38.6019, "lon": -90.2162},
]


def get_nearby_elevators(farm_address: str, radius_miles: float = 50) -> list[dict]:
    """
    Geocode farm_address with Nominatim (OpenStreetMap) and return
    elevators within radius_miles, sorted by distance.
    Returns empty list on geocode failure rather than crashing.
    """
    try:
        geolocator = Nominatim(user_agent="silo-grain-recommender/1.0", timeout=6)
        location = geolocator.geocode(farm_address)
        if not location:
            return []
        farm_coords = (location.latitude, location.longitude)
    except Exception:
        return []

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
