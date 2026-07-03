"""FastAPI endpoints for the AI Router."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field

import ai_router


class RouteRequestBody(BaseModel):
    task_type: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)
    sensitivity_level: str = "low"
    force_no_cache: bool = False


class KeyBody(BaseModel):
    api_key: str = Field(..., min_length=8)


def build_router(get_current_user_id):
    r = APIRouter(prefix="/api/ai-router", tags=["ai-router"])

    @r.post("/route")
    async def route(body: RouteRequestBody = Body(...),
                    user_id: str = Depends(get_current_user_id)):
        try:
            return await ai_router.route_ai_task(
                task_type=body.task_type,
                payload=body.payload,
                sensitivity_level=body.sensitivity_level,
                user_id=user_id,
                force_no_cache=body.force_no_cache,
            )
        except Exception as e:
            raise HTTPException(500, f"AI Router failed: {e}") from e

    @r.get("/dashboard")
    async def dashboard(days: int = 30, user_id: str = Depends(get_current_user_id)):
        return await ai_router.usage_dashboard(user_id=user_id, days=days)

    @r.get("/platforms")
    async def platforms(user_id: str = Depends(get_current_user_id)):
        _ = user_id
        return {"platforms": ai_router.platform_status_snapshot()}

    @r.put("/platforms/{platform_key}/set-key")
    async def set_key(platform_key: str, body: KeyBody = Body(...),
                      user_id: str = Depends(get_current_user_id)):
        _ = user_id
        try:
            return ai_router.set_platform_key(platform_key, body.api_key)
        except ValueError as ve:
            raise HTTPException(400, str(ve))
        except Exception as e:
            raise HTTPException(500, f"Failed to set key: {e}")

    @r.put("/platforms/{platform_key}/rotate-key")
    async def rotate_key(platform_key: str, body: KeyBody = Body(...),
                         user_id: str = Depends(get_current_user_id)):
        _ = user_id
        try:
            return ai_router.rotate_platform_key(platform_key, body.api_key)
        except ValueError as ve:
            raise HTTPException(400, str(ve))
        except Exception as e:
            raise HTTPException(500, f"Failed to rotate key: {e}")

    @r.delete("/platforms/{platform_key}/key")
    async def clear_key(platform_key: str,
                        user_id: str = Depends(get_current_user_id)):
        _ = user_id
        try:
            return ai_router.clear_platform_key(platform_key)
        except ValueError as ve:
            raise HTTPException(400, str(ve))
        except Exception as e:
            raise HTTPException(500, f"Failed to clear key: {e}")

    return r
