"""
Input validation utilities shared across endpoints.
Address validation uses Nominatim (OpenStreetMap) — same geocoder used elsewhere.
"""

from geopy.geocoders import Nominatim
from pydantic import field_validator
from fastapi import HTTPException

_geolocator = Nominatim(user_agent="silo-grain-recommender/1.0", timeout=6)


def validate_address(address: str, field_name: str = "address") -> str:
    """
    Strip, basic length-check, then verify the address resolves via Nominatim.
    Raises HTTPException 422 with a clear message on failure.
    """
    address = address.strip()
    if len(address) < 5:
        raise HTTPException(status_code=422, detail=f"{field_name}: too short to be a valid address")
    if len(address) > 300:
        raise HTTPException(status_code=422, detail=f"{field_name}: address too long")

    try:
        location = _geolocator.geocode(address)
    except Exception:
        # Nominatim timeout or network error — allow through rather than blocking
        return address

    if location is None:
        raise HTTPException(
            status_code=422,
            detail=f"{field_name}: '{address}' could not be found. Please enter a full street address including city and state.",
        )
    return address


def validate_addresses(*pairs: tuple[str, str]) -> None:
    """Validate multiple (value, field_name) address pairs in sequence."""
    for address, field_name in pairs:
        validate_address(address, field_name)
