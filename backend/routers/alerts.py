from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from backend.auth import get_current_user
from backend.db import get_supabase
from backend.models import BasisAlert, BasisAlertCreate
from backend.fetchers.usda import get_regional_cash_price
from backend.fetchers.futures import get_futures_features
from backend.validators import validate_address

router = APIRouter(prefix="/alerts/basis", tags=["alerts"])


def _row_to_alert(row: dict) -> BasisAlert:
    return BasisAlert(
        id=row["id"],
        commodity=row["commodity"],
        farm_address=row["farm_address"],
        target_basis=row["target_basis"],
        direction=row["direction"],
        triggered=row["triggered"],
        triggered_at=str(row["triggered_at"]) if row.get("triggered_at") else None,
        triggered_basis=row.get("triggered_basis"),
        created_at=str(row["created_at"]),
    )


@router.post("", response_model=BasisAlert)
def create_alert(body: BasisAlertCreate, user_id: str = Depends(get_current_user)):
    validate_address(body.farm_address, "farm_address")
    db = get_supabase()
    resp = db.table("basis_alerts").insert({
        "user_id": user_id,
        "commodity": body.commodity,
        "farm_address": body.farm_address,
        "target_basis": body.target_basis,
        "direction": body.direction,
    }).execute()
    return _row_to_alert(resp.data[0])


@router.get("", response_model=list[BasisAlert])
def list_alerts(user_id: str = Depends(get_current_user)):
    db = get_supabase()
    resp = db.table("basis_alerts").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
    return [_row_to_alert(r) for r in (resp.data or [])]


@router.delete("/{alert_id}")
def delete_alert(alert_id: str, user_id: str = Depends(get_current_user)):
    db = get_supabase()
    resp = db.table("basis_alerts").delete().eq("id", alert_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"deleted": alert_id}


@router.post("/check", response_model=list[BasisAlert])
def check_alerts(user_id: str = Depends(get_current_user)):
    """
    Fetch live basis for each active (non-triggered) alert and mark any that crossed
    the threshold. Returns the list of alerts that fired in this check.
    """
    db = get_supabase()
    resp = db.table("basis_alerts").select("*").eq("user_id", user_id).eq("triggered", False).execute()
    alerts = resp.data or []

    if not alerts:
        return []

    # Fetch live futures once per unique commodity
    futures_cache: dict[str, float] = {}
    for alert in alerts:
        c = alert["commodity"]
        if c not in futures_cache:
            try:
                futures_cache[c] = get_futures_features(c)["price"]
            except Exception:
                futures_cache[c] = 0.0

    # Fetch live regional cash price once per unique commodity
    cash_cache: dict[str, float] = {}
    for alert in alerts:
        c = alert["commodity"]
        if c not in cash_cache:
            try:
                cash_cache[c] = get_regional_cash_price(c) or futures_cache.get(c, 0.0)
            except Exception:
                cash_cache[c] = futures_cache.get(c, 0.0)

    fired: list[BasisAlert] = []
    now = datetime.now(timezone.utc).isoformat()

    for alert in alerts:
        c = alert["commodity"]
        live_basis = cash_cache.get(c, 0.0) - futures_cache.get(c, 0.0)

        crossed = (
            (alert["direction"] == "above" and live_basis >= alert["target_basis"]) or
            (alert["direction"] == "below" and live_basis <= alert["target_basis"])
        )

        if crossed:
            update_resp = db.table("basis_alerts").update({
                "triggered": True,
                "triggered_at": now,
                "triggered_basis": round(live_basis, 4),
            }).eq("id", alert["id"]).execute()
            fired.append(_row_to_alert(update_resp.data[0]))

    return fired
