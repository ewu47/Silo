from fastapi import APIRouter, Depends
from backend.auth import get_current_user
from backend.db import get_supabase
from backend.models import UserProfile

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserProfile)
def get_profile(user_id: str = Depends(get_current_user)):
    db = get_supabase()
    resp = db.table("user_profiles").select("*").eq("user_id", user_id).maybe_single().execute()
    if not resp.data:
        return UserProfile()
    return UserProfile(
        farm_address=resp.data.get("farm_address"),
        preferred_commodity=resp.data.get("preferred_commodity"),
    )


@router.put("", response_model=UserProfile)
def update_profile(profile: UserProfile, user_id: str = Depends(get_current_user)):
    # Address already verified on the frontend via Nominatim dropdown selection
    db = get_supabase()
    data = {"user_id": user_id}
    if profile.farm_address is not None:
        data["farm_address"] = profile.farm_address
    if profile.preferred_commodity is not None:
        data["preferred_commodity"] = profile.preferred_commodity

    db.table("user_profiles").upsert(data).execute()
    return get_profile(user_id)
