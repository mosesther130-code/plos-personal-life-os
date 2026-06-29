"""
PLOS — Security Enhancements (Enhancement 6)
- Editable Breach Monitor accounts CRUD
- Police report jurisdiction lookup (dynamic, county-based)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/security", tags=["security-enhanced"])

ACCOUNT_TYPES = {"email", "phone", "username", "ssn_last4"}


class MonitoredAccount(BaseModel):
    account_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    account_type: str  # email | phone | username | ssn_last4
    identifier: str
    label: Optional[str] = None


class MonitoredAccountCreate(BaseModel):
    account_type: str
    identifier: str
    label: Optional[str] = None


# County jurisdiction directory — extensible, covers user's known locations
JURISDICTION_DIRECTORY: Dict[str, Dict[str, Any]] = {
    "dekalb,ga": {
        "county": "DeKalb County",
        "state": "GA",
        "department": "DeKalb County Police Department",
        "non_emergency_phone": "(770) 724-7300",
        "online_report_url": "https://www.dekalbcountyga.gov/police/file-police-report-online",
    },
    "fulton,ga": {
        "county": "Fulton County",
        "state": "GA",
        "department": "Fulton County Police Department",
        "non_emergency_phone": "(404) 613-0500",
        "online_report_url": "https://www.fultoncountyga.gov/inside-fulton-county/fulton-county-departments/police",
    },
    "gwinnett,ga": {
        "county": "Gwinnett County",
        "state": "GA",
        "department": "Gwinnett County Police Department",
        "non_emergency_phone": "(770) 513-5000",
        "online_report_url": "https://www.gwinnettcounty.com/web/gwinnett/departments/police",
    },
    "cobb,ga": {
        "county": "Cobb County",
        "state": "GA",
        "department": "Cobb County Police Department",
        "non_emergency_phone": "(770) 499-3911",
        "online_report_url": "https://www.cobbcounty.org/public-safety/police",
    },
    "clayton,ga": {
        "county": "Clayton County",
        "state": "GA",
        "department": "Clayton County Police Department",
        "non_emergency_phone": "(770) 477-3550",
        "online_report_url": "https://www.claytoncountyga.gov/government/police",
    },
    "henry,ga": {
        "county": "Henry County",
        "state": "GA",
        "department": "Henry County Police Department",
        "non_emergency_phone": "(770) 957-9121",
        "online_report_url": "https://www.henrycountypolice.com",
    },
}


def _mask(s: str, account_type: str) -> str:
    if not s:
        return s
    if account_type == "email":
        # show first char + domain
        if "@" in s:
            local, dom = s.split("@", 1)
            head = local[:1] if local else ""
            return f"{head}{'*' * max(2, len(local)-1)}@{dom}"
        return s
    if account_type == "ssn_last4":
        return f"XXX-XX-{s[-4:]}" if len(s) >= 4 else s
    if account_type == "phone":
        return f"***-***-{s[-4:]}" if len(s) >= 4 else s
    if len(s) <= 3:
        return s
    return s[:2] + "*" * (len(s) - 2)


def _strip(d):
    if not d:
        return None
    d.pop("_id", None)
    return d


# ------- Jurisdiction Lookup (module-level so it's importable) -------
def lookup_jurisdiction(county: Optional[str], state: Optional[str]) -> Dict[str, Any]:
    if not county:
        return {
            "found": False,
            "county": None,
            "state": state,
            "department": None,
            "non_emergency_phone": None,
            "online_report_url": None,
            "fallback_message": "File a police report with the law enforcement agency in your county of residence.",
            "fallback_url": "https://www.usa.gov/local-governments",
        }
    c_norm = county.lower().replace(" county", "").strip()
    s_norm = (state or "").lower().strip()
    key = f"{c_norm},{s_norm}"
    if key in JURISDICTION_DIRECTORY:
        return {"found": True, **JURISDICTION_DIRECTORY[key]}
    return {
        "found": False,
        "county": county,
        "state": state,
        "department": None,
        "non_emergency_phone": None,
        "online_report_url": None,
        "fallback_message": f"File a police report with your local law enforcement in {county}{', ' + state if state else ''}.",
        "fallback_url": "https://www.usa.gov/local-governments",
    }


# ============= Factory =============
def make_router(db, get_current_user_id):
    # ------- Breach Monitor CRUD -------
    @router.get("/monitored-accounts")
    async def list_monitored(user_id: str = Depends(get_current_user_id)):
        # Auto-seed primary email if collection is empty
        cnt = await db.monitored_accounts.count_documents({"user_id": user_id})
        if cnt == 0:
            user = await db.users.find_one({"user_id": user_id})
            seed_email = "mndifon@gsu.edu" if user and user.get("email") == "test1@plos.app" else (user.get("email") if user else None)
            if seed_email:
                doc = MonitoredAccount(account_type="email", identifier=seed_email, label="Primary Email").model_dump()
                try:
                    await db.monitored_accounts.insert_one({
                        **doc,
                        "user_id": user_id,
                        "added_at": datetime.now(timezone.utc).isoformat(),
                        "last_scanned_at": None,
                    })
                except Exception:
                    pass

        items = []
        async for d in db.monitored_accounts.find({"user_id": user_id}).sort("added_at", 1):
            d = _strip(d)
            d["masked_identifier"] = _mask(d.get("identifier", ""), d.get("account_type", "")) if d.get("account_type") in {"ssn_last4", "phone"} else d.get("identifier", "")
            # don't return raw SSN/phone
            if d.get("account_type") in {"ssn_last4", "phone"}:
                d.pop("identifier", None)
            items.append(d)
        return {"accounts": items}

    @router.post("/monitored-accounts")
    async def create_monitored(payload: MonitoredAccountCreate, user_id: str = Depends(get_current_user_id)):
        from pymongo.errors import DuplicateKeyError
        if payload.account_type not in ACCOUNT_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid account_type. Must be one of {sorted(ACCOUNT_TYPES)}")
        doc = MonitoredAccount(**payload.model_dump()).model_dump()
        try:
            await db.monitored_accounts.insert_one({
                **doc, "user_id": user_id,
                "added_at": datetime.now(timezone.utc).isoformat(),
                "last_scanned_at": None,
            })
        except DuplicateKeyError:
            raise HTTPException(status_code=409, detail="This identifier is already monitored")
        return {"account_id": doc["account_id"]}

    @router.put("/monitored-accounts/{account_id}")
    async def update_monitored(
        account_id: str, payload: MonitoredAccountCreate, user_id: str = Depends(get_current_user_id)
    ):
        if payload.account_type not in ACCOUNT_TYPES:
            raise HTTPException(status_code=400, detail="Invalid account_type")
        upd = payload.model_dump()
        r = await db.monitored_accounts.update_one(
            {"user_id": user_id, "account_id": account_id}, {"$set": upd}
        )
        if r.matched_count == 0:
            raise HTTPException(status_code=404, detail="Account not found")
        return {"ok": True}

    @router.delete("/monitored-accounts/{account_id}")
    async def delete_monitored(account_id: str, user_id: str = Depends(get_current_user_id)):
        await db.monitored_accounts.delete_one({"user_id": user_id, "account_id": account_id})
        return {"ok": True}

    # ------- Jurisdiction Lookup (uses module-level helper) -------
    @router.get("/jurisdiction")
    async def get_jurisdiction(user_id: str = Depends(get_current_user_id)):
        profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
        return lookup_jurisdiction(profile.get("home_county"), profile.get("home_state"))

    # ------- Identity Theft Police Report Step (dynamic) -------
    @router.get("/identity-theft/police-step")
    async def police_step(user_id: str = Depends(get_current_user_id)):
        profile = await db.user_profile.find_one({"user_id": user_id}, {"_id": 0}) or {}
        j = lookup_jurisdiction(profile.get("home_county"), profile.get("home_state"))
        if j["found"]:
            return {
                "step_id": "police_report",
                "title": f"File a police report at {j['department']}",
                "description": (
                    f"Visit your local precinct ({j['department']}) with: photo ID, FTC affidavit, "
                    f"proof of address, and evidence of fraud. "
                    f"Non-emergency line: {j['non_emergency_phone']}."
                ),
                "links": [
                    {"label": "File online", "url": j["online_report_url"]},
                ],
                "jurisdiction": j,
            }
        return {
            "step_id": "police_report",
            "title": "File a local police report",
            "description": j["fallback_message"]
            + " Add your home county in Settings so PLOS can show your exact precinct.",
            "links": [{"label": "Find local agency", "url": j["fallback_url"]}],
            "jurisdiction": j,
        }

    return router
