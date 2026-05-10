"""
FastAPI auth dependency.
Validates a Supabase JWT from the Authorization: Bearer header.
Returns the user_id (UUID string) on success, raises 401 on failure.
"""

from fastapi import Header, HTTPException
from backend.db import get_supabase


async def get_current_user(authorization: str = Header(...)) -> str:
    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        resp = get_supabase().auth.get_user(token)
        if not resp.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return resp.user.id
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
