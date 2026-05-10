"""
Location utilities — extract structured address components from a farm address string.
Used to route regional API calls (diesel by PADD, USDA by state).
"""

from geopy.geocoders import Nominatim

_geolocator = Nominatim(user_agent="silo")

_STATE_NAME_TO_ABBR: dict[str, str] = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID",
    "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT",
    "Vermont": "VT", "Virginia": "VA", "Washington": "WA", "West Virginia": "WV",
    "Wisconsin": "WI", "Wyoming": "WY",
}


def get_state_abbr(address: str) -> str | None:
    """
    Return 2-letter US state abbreviation for the given address, or None on failure.
    Uses Nominatim with addressdetails=True to parse the state component.
    """
    try:
        loc = _geolocator.geocode(address, timeout=5, addressdetails=True)
        if not loc:
            return None
        state_name = loc.raw.get("address", {}).get("state")
        return _STATE_NAME_TO_ABBR.get(state_name) if state_name else None
    except Exception:
        return None
