from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Any
from backend.auth import get_current_user
from backend.db import get_supabase
from backend.models import SavedAnalysis

router = APIRouter(prefix="/analyses", tags=["analyses"])


class SaveAnalysisRequest(BaseModel):
    commodity: str
    quantity_bu: float
    farm_address: Optional[str] = None
    request_json: dict[str, Any]
    response_json: dict[str, Any]


@router.post("", response_model=SavedAnalysis)
def save_analysis(body: SaveAnalysisRequest, user_id: str = Depends(get_current_user)):
    db = get_supabase()
    resp = db.table("analyses").insert({
        "user_id": user_id,
        "commodity": body.commodity,
        "quantity_bu": body.quantity_bu,
        "farm_address": body.farm_address,
        "request_json": body.request_json,
        "response_json": body.response_json,
    }).execute()

    row = resp.data[0]
    return SavedAnalysis(
        id=row["id"],
        commodity=row["commodity"],
        quantity_bu=row["quantity_bu"],
        farm_address=row.get("farm_address"),
        created_at=str(row["created_at"]),
        response_json=row["response_json"],
    )


@router.get("", response_model=list[SavedAnalysis])
def list_analyses(
    commodity: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    user_id: str = Depends(get_current_user),
):
    db = get_supabase()
    q = db.table("analyses").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit)
    if commodity:
        q = q.eq("commodity", commodity)
    resp = q.execute()

    return [
        SavedAnalysis(
            id=row["id"],
            commodity=row["commodity"],
            quantity_bu=row["quantity_bu"],
            farm_address=row.get("farm_address"),
            created_at=str(row["created_at"]),
            response_json=row["response_json"],
        )
        for row in (resp.data or [])
    ]


@router.delete("/{analysis_id}")
def delete_analysis(analysis_id: str, user_id: str = Depends(get_current_user)):
    db = get_supabase()
    resp = db.table("analyses").delete().eq("id", analysis_id).eq("user_id", user_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return {"deleted": analysis_id}
