"""PLOS Career — AI Resume Tailor + Cover Letter + Interview Prep.

Uses Claude Sonnet 4.5 via emergentintegrations. Generates:
- ATS-tailored resume (markdown)
- Cover letter (markdown, 350-450 words, business format)
- Interview questions (10 tailored questions)
- ATS keyword analysis (matched + missing keywords, 0-100 match score)

Also handles:
- PDF export via fpdf2 (professional business format, sans-serif, ATS-safe)
- Email delivery via SendGrid (activates when SENDGRID_API_KEY is present)
- Thank-you and follow-up letter generation
- Resume version history (resume_versions collection)
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from career_resumes import get_default_or_by_id

load_dotenv()

logger = logging.getLogger(__name__)

# ---------- System prompt (per user spec) ----------------------------------
SYSTEM_PROMPT = (
    "You are an expert career coach and professional resume writer with deep "
    "expertise in ATS optimization, federal government hiring (USAJobs), "
    "international development organizations (ADB, World Bank, USAID), NATO "
    "civilian positions, and higher education administration. The user is "
    "Moses Ndifon — a Department Coordinator at Georgia State University "
    "Perimeter College with a background as a USAID Deputy Controller managing "
    "multi-country foreign assistance portfolios across Asia-Pacific. He holds "
    "an MBA from University of West Georgia and a BBA in Accounting from "
    "Morehead State University. When tailoring resumes and cover letters, "
    "emphasize financial management expertise, international development "
    "experience, multilateral organization knowledge, and academic "
    "administration skills as appropriate for each specific role. Always "
    "optimize for ATS keyword matching while maintaining authentic, "
    "professional language."
)


# ---------- Models ---------------------------------------------------------
class TailorBody(BaseModel):
    resume_id: Optional[str] = None
    job_title: str = Field(..., min_length=1, max_length=200)
    company: str = Field(..., min_length=1, max_length=200)
    job_description: str = Field(..., min_length=20)
    job_url: Optional[str] = None
    tailor_resume: bool = True
    generate_cover_letter: bool = True
    generate_interview_questions: bool = True
    email_to_me: bool = False
    send_pdf: bool = True


class ThankYouBody(BaseModel):
    version_id: str
    interviewer_name: str = Field(..., min_length=1, max_length=120)
    topic_discussed: str = Field(..., min_length=3, max_length=500)
    email_to_me: bool = False


class FollowUpBody(BaseModel):
    version_id: str
    days_since_applied: int = Field(..., ge=0, le=180)
    email_to_me: bool = False


class SaveApplicationBody(BaseModel):
    version_id: str


# ---------- Claude JSON generation ----------------------------------------
def _extract_json(raw: str) -> Dict[str, Any]:
    """Extract the first {...} JSON blob from Claude's response."""
    if not raw:
        return {}
    # Strip markdown fences if present
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
    if m:
        raw = m.group(1)
    # Fallback: first { to last }
    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return {}
    try:
        return json.loads(raw[start : end + 1])
    except Exception as exc:
        logger.warning("JSON parse failed: %s", exc)
        return {}


async def _run_tailor(
    call_claude,
    user_id: str,
    resume_text: str,
    job_title: str,
    company: str,
    jd: str,
    tailor_resume: bool,
    do_cover: bool,
    do_interview: bool,
) -> Dict[str, Any]:
    """Ask Claude for the full tailoring bundle in a single call.

    Returns a dict with keys: tailored_resume_md, cover_letter_md,
    interview_questions[], ats_score (0-100), keywords_matched[],
    keywords_missing[], summary.
    """
    parts = []
    if tailor_resume:
        parts.append(
            '"tailored_resume_md": (markdown, ATS-friendly, keep truthful — do '
            "NOT fabricate experience the candidate does not have; reorder + "
            "rephrase existing content to match the JD; include Contact, "
            "Professional Summary, Core Competencies, Professional Experience, "
            "Education, and Certifications sections)"
        )
    if do_cover:
        parts.append(
            '"cover_letter_md": (markdown, formal business letter format, '
            "350–450 words, 3–4 paragraphs: hook, experience alignment, value "
            "proposition, closing CTA; include the current date at the top, "
            'formal salutation, and closing sign-off "Sincerely, Moses Ndifon")'
        )
    if do_interview:
        parts.append(
            '"interview_questions": (array of exactly 10 tailored interview '
            "questions the candidate should prepare answers for, mixing "
            "behavioral, technical, and situational — no answers, just questions)"
        )
    parts.append(
        '"ats_score": (integer 0-100 estimating how well the tailored resume '
        "matches this JD after tailoring), "
        '"keywords_matched": (array of 8-15 key JD terms present in the '
        "tailored resume), "
        '"keywords_missing": (array of 3-10 JD terms the candidate should '
        "consider adding truthfully), "
        '"summary": (one-paragraph explanation of the tailoring approach)'
    )
    schema = ", ".join(parts)

    prompt = f"""You will produce a JSON object with the following keys:
{{{schema}}}

Return ONLY the JSON object, no prose before or after, no code fences.

Target role: {job_title} at {company}

Job description:
\"\"\"
{jd[:6000]}
\"\"\"

Candidate's current master resume (source of truth — do not invent
experience):
\"\"\"
{resume_text[:8000]}
\"\"\"

Requirements:
- If a JD keyword does not appear in the candidate's resume, put it in
  keywords_missing, do NOT insert it into the tailored resume.
- The tailored resume must be ATS-safe: no tables, no columns, no images —
  plain markdown with clear section headers.
- The cover letter must NOT repeat the resume verbatim. It should tell a
  story that connects the candidate's background to the role.
- All output must be a single valid JSON object.
"""
    session_id = f"tailor-{user_id}-{uuid.uuid4().hex[:8]}"
    raw = await call_claude(session_id, SYSTEM_PROMPT, prompt)
    data = _extract_json(raw)
    if not data:
        raise HTTPException(502, "PLOS AI returned no parseable JSON — try again")
    # Guarantee schema keys
    data.setdefault("tailored_resume_md", "")
    data.setdefault("cover_letter_md", "")
    data.setdefault("interview_questions", [])
    data.setdefault("ats_score", 0)
    data.setdefault("keywords_matched", [])
    data.setdefault("keywords_missing", [])
    data.setdefault("summary", "")
    return data


# ---------- PDF generation (fpdf2) -----------------------------------------
def _strip_md(text: str) -> str:
    """Very light markdown → plain-text sanitiser suitable for ATS PDFs."""
    if not text:
        return ""
    t = text.replace("\r\n", "\n")
    # Headers → plain caps line
    t = re.sub(r"^#{1,6}\s*(.+)$", lambda m: m.group(1).upper(), t, flags=re.M)
    # Bold/italic markers
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = re.sub(r"__(.+?)__", r"\1", t)
    t = re.sub(r"\*(.+?)\*", r"\1", t)
    t = re.sub(r"_(.+?)_", r"\1", t)
    # Bullet markers stay as "- " prefix
    t = re.sub(r"^\s*[-*+]\s+", "  - ", t, flags=re.M)
    # Links [text](url) → text (url)
    t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", t)
    return t.strip()


def _ascii_safe(text: str) -> str:
    """fpdf2 with core fonts requires latin-1. Replace common unicode."""
    if not text:
        return ""
    repl = {
        "\u2013": "-", "\u2014": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2022": "-", "\u2026": "...",
        "\u00a0": " ", "\u2011": "-",
    }
    for k, v in repl.items():
        text = text.replace(k, v)
    return text.encode("latin-1", "replace").decode("latin-1")


def build_pdf(title: str, body_md: str, footer: str = "") -> bytes:
    """Return raw PDF bytes for the given markdown body."""
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    pdf = FPDF(format="Letter", unit="pt")
    pdf.set_auto_page_break(auto=True, margin=54)
    pdf.add_page()
    pdf.set_margins(left=54, top=54, right=54)

    body = _ascii_safe(_strip_md(body_md))
    lines = body.split("\n")

    # fpdf2 default new_x=RIGHT causes width-0 multi_cell to fail on subsequent
    # lines; force x back to left margin after every cell.
    NEW_X = XPos.LMARGIN
    NEW_Y = YPos.NEXT

    for line in lines:
        line = line.rstrip()
        if not line:
            pdf.ln(6)
            continue
        # Detect our normalised headers (ALL CAPS, ≤50 chars, ends w/o punctuation)
        stripped = line.strip()
        is_header = (
            stripped
            and stripped == stripped.upper()
            and 2 <= len(stripped) <= 55
            and not stripped.endswith((".", ",", ":", ";"))
            and any(c.isalpha() for c in stripped)
            and stripped.count(" ") <= 6
        )
        if is_header:
            pdf.set_font("Helvetica", "B", 12)
            pdf.set_text_color(30, 64, 175)  # PLOS blue
            pdf.ln(4)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 15, stripped, new_x=NEW_X, new_y=NEW_Y)
            # Section divider
            y = pdf.get_y()
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
            pdf.ln(4)
            pdf.set_text_color(0, 0, 0)
            continue
        # Bullet indent
        if stripped.startswith("- "):
            pdf.set_font("Helvetica", "", 10)
            pdf.set_x(pdf.l_margin + 12)
            # Use ASCII bullet ('-') because Helvetica core font is latin-1
            # and U+2022 would trigger FPDFUnicodeEncodingException.
            pdf.multi_cell(0, 14, "- " + stripped[2:],
                           new_x=NEW_X, new_y=NEW_Y)
            continue
        # Regular
        pdf.set_font("Helvetica", "", 10)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 14, stripped, new_x=NEW_X, new_y=NEW_Y)

    if footer:
        pdf.set_y(-40)
        pdf.set_font("Helvetica", "I", 8)
        pdf.set_text_color(140, 140, 140)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 12, _ascii_safe(footer), new_x=NEW_X, new_y=NEW_Y)

    out = pdf.output(dest="S")
    if isinstance(out, str):
        return out.encode("latin-1")
    return bytes(out)


# ---------- SendGrid email delivery ---------------------------------------
def _sendgrid_ready() -> bool:
    key = os.environ.get("SENDGRID_API_KEY", "").strip()
    return bool(key) and not key.lower().startswith("placeholder")


def send_via_sendgrid(
    *,
    to_email: str,
    to_name: str,
    subject: str,
    body_text: str,
    body_html: str,
    attachments: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Send an email via SendGrid. Returns a status dict — never raises."""
    if not to_email:
        return {"status": "skipped", "reason": "no_recipient"}
    if not _sendgrid_ready():
        # TODO: activate when SENDGRID_API_KEY is provided.
        logger.info(
            "SendGrid not configured — would have emailed %s (subject=%r)",
            to_email, subject,
        )
        return {"status": "deferred", "reason": "sendgrid_key_missing"}
    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import (
            Mail, Attachment, FileContent, FileName, FileType, Disposition,
        )
        message = Mail(
            from_email=("noreply@plos-app.com", "PLOS Career Assistant"),
            to_emails=(to_email, to_name),
            subject=subject,
            plain_text_content=body_text,
            html_content=body_html or f"<pre>{body_text}</pre>",
        )
        # sendgrid.Mail.attachment is a *list* setter — assigning multiple times
        # in a loop overwrites; build the list once and assign at the end.
        att_list: List[Any] = []
        for att in attachments or []:
            att_list.append(
                Attachment(
                    FileContent(att["content_b64"]),
                    FileName(att["filename"]),
                    FileType(att.get("mime", "application/pdf")),
                    Disposition("attachment"),
                )
            )
        if att_list:
            message.attachment = att_list
        sg = SendGridAPIClient(os.environ["SENDGRID_API_KEY"])
        resp = sg.send(message)
        return {"status": "sent", "http_status": resp.status_code}
    except Exception as exc:
        logger.warning("SendGrid send failed: %s", exc)
        return {"status": "failed", "reason": str(exc)[:200]}


# ---------- Version storage helpers ---------------------------------------
async def _save_version(
    db,
    user_id: str,
    body: TailorBody,
    resume_id: str,
    resume_name: str,
    result: Dict[str, Any],
) -> str:
    version_id = f"ver_{uuid.uuid4().hex[:12]}"
    doc = {
        "version_id": version_id,
        "user_id": user_id,
        "resume_id": resume_id,
        "resume_name": resume_name,
        "job_title": body.job_title,
        "company": body.company,
        "job_url": body.job_url,
        "job_description_used": body.job_description,
        "tailored_resume_md": result.get("tailored_resume_md", ""),
        "cover_letter_md": result.get("cover_letter_md", ""),
        "interview_questions": result.get("interview_questions", []),
        "ats_score": int(result.get("ats_score") or 0),
        "keywords_matched": result.get("keywords_matched", []),
        "keywords_missing": result.get("keywords_missing", []),
        "summary": result.get("summary", ""),
        "generated_date": datetime.now(timezone.utc).isoformat(),
        "thank_you_letter_md": "",
        "follow_up_letter_md": "",
        "saved_to_application_id": None,
    }
    await db.resume_versions.insert_one(doc)
    return version_id


# ---------- Router factory ------------------------------------------------
def make_router(db, get_current_user_id, emergent_llm_key, llm_chat_cls, user_msg_cls):
    async def call_claude(session_id: str, system: str, prompt: str) -> str:
        chat = llm_chat_cls(
            api_key=emergent_llm_key, session_id=session_id, system_message=system,
        ).with_model("anthropic", "claude-sonnet-4-5-20250929")
        resp = await chat.send_message(user_msg_cls(text=prompt))
        return resp if isinstance(resp, str) else str(resp)

    r = APIRouter(prefix="/api/career/tailor", tags=["career-tailor"])

    # -------- Main tailor endpoint --------
    @r.post("")
    async def tailor(body: TailorBody, user_id: str = Depends(get_current_user_id)):
        # 1. Resolve resume
        resume_doc = await get_default_or_by_id(db, user_id, body.resume_id)
        if not resume_doc:
            raise HTTPException(
                400,
                "No resume on file — upload a resume in the Resume Vault first.",
            )
        resume_text = (resume_doc.get("text") or "").strip()
        if len(resume_text) < 30:
            raise HTTPException(
                400,
                "Selected resume has no extracted text. Try re-uploading as TXT "
                "or pasting the content directly.",
            )

        # 2. Ask Claude for the full bundle
        result = await _run_tailor(
            call_claude,
            user_id,
            resume_text,
            body.job_title,
            body.company,
            body.job_description,
            body.tailor_resume,
            body.generate_cover_letter,
            body.generate_interview_questions,
        )

        # 3. Persist version
        version_id = await _save_version(
            db, user_id, body, resume_doc["resume_id"], resume_doc["name"], result
        )

        # 4. Optional email
        email_status: Optional[Dict[str, Any]] = None
        if body.email_to_me:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            email = (user or {}).get("email", "")
            name = (user or {}).get("full_name", "PLOS User")
            today = datetime.now().strftime("%Y-%m-%d")
            subject = (
                f"PLOS Career — Tailored Resume for {body.job_title} at "
                f"{body.company} — {today}"
            )
            attachments: List[Dict[str, Any]] = []
            if body.send_pdf and result.get("tailored_resume_md"):
                pdf_bytes = build_pdf(
                    f"{body.job_title} — Tailored Resume",
                    result["tailored_resume_md"],
                    footer=f"Generated by PLOS Career Assistant · {today}",
                )
                attachments.append(
                    {
                        "content_b64": base64.b64encode(pdf_bytes).decode("ascii"),
                        "filename": f"Resume - {body.company} - {today}.pdf",
                        "mime": "application/pdf",
                    }
                )
            body_text = (
                f"Hi {name},\n\nAttached is your tailored resume for the "
                f"{body.job_title} role at {body.company}. Below is the cover "
                f"letter draft.\n\nATS match score: {result.get('ats_score')}/100\n\n"
                "---\n\n" + (result.get("cover_letter_md") or "")
            )
            email_status = send_via_sendgrid(
                to_email=email,
                to_name=name,
                subject=subject,
                body_text=body_text,
                body_html=body_text.replace("\n", "<br>"),
                attachments=attachments,
            )

        return {
            "ok": True,
            "version_id": version_id,
            "ats_score": int(result.get("ats_score") or 0),
            "keywords_matched": result.get("keywords_matched", []),
            "keywords_missing": result.get("keywords_missing", []),
            "summary": result.get("summary", ""),
            "tailored_resume_md": result.get("tailored_resume_md", ""),
            "cover_letter_md": result.get("cover_letter_md", ""),
            "interview_questions": result.get("interview_questions", []),
            "email_status": email_status,
        }

    # -------- Version history --------
    @r.get("/versions")
    async def list_versions(user_id: str = Depends(get_current_user_id)):
        docs = await db.resume_versions.find(
            {"user_id": user_id},
            {
                "_id": 0,
                "job_description_used": 0,  # keep list light
                "tailored_resume_md": 0,
                "cover_letter_md": 0,
                "interview_questions": 0,
            },
        ).sort("generated_date", -1).to_list(100)
        return {"versions": docs}

    @r.get("/versions/{version_id}")
    async def get_version(
        version_id: str, user_id: str = Depends(get_current_user_id)
    ):
        doc = await db.resume_versions.find_one(
            {"user_id": user_id, "version_id": version_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(404, "Version not found")
        return doc

    @r.delete("/versions/{version_id}")
    async def delete_version(
        version_id: str, user_id: str = Depends(get_current_user_id)
    ):
        res = await db.resume_versions.delete_one(
            {"user_id": user_id, "version_id": version_id}
        )
        if res.deleted_count == 0:
            raise HTTPException(404, "Version not found")
        return {"ok": True}

    # -------- PDF download --------
    @r.get("/versions/{version_id}/download")
    async def download_version(
        version_id: str,
        kind: str = "resume",  # "resume" | "cover" | "thankyou" | "followup"
        user_id: str = Depends(get_current_user_id),
    ):
        doc = await db.resume_versions.find_one(
            {"user_id": user_id, "version_id": version_id}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(404, "Version not found")
        kind_map = {
            "resume": ("tailored_resume_md", "Resume"),
            "cover": ("cover_letter_md", "Cover Letter"),
            "thankyou": ("thank_you_letter_md", "Thank You"),
            "followup": ("follow_up_letter_md", "Follow-up"),
        }
        if kind not in kind_map:
            raise HTTPException(400, f"Unknown kind {kind}")
        field, label = kind_map[kind]
        content = doc.get(field) or ""
        if not content:
            raise HTTPException(404, f"No {label} generated for this version yet.")
        today = datetime.now().strftime("%Y-%m-%d")
        pdf_bytes = build_pdf(
            f"{label} — {doc.get('company')} · {doc.get('job_title')}",
            content,
            footer=f"Generated by PLOS Career Assistant · {today}",
        )
        filename = (
            f"{label} - {doc.get('company', 'Company')} - {today}.pdf"
        )
        return {
            "filename": filename,
            "mime": "application/pdf",
            "content_b64": base64.b64encode(pdf_bytes).decode("ascii"),
            "markdown": content,
        }

    # -------- Thank-you letter --------
    @r.post("/thankyou")
    async def gen_thank_you(
        body: ThankYouBody, user_id: str = Depends(get_current_user_id)
    ):
        ver = await db.resume_versions.find_one(
            {"user_id": user_id, "version_id": body.version_id}, {"_id": 0}
        )
        if not ver:
            raise HTTPException(404, "Version not found")
        prompt = f"""Draft a professional interview thank-you letter (200-280 words) in
markdown business-letter format. Use today's date. Salutation to
"Dear {body.interviewer_name},".

Job: {ver.get('job_title')} at {ver.get('company')}
Topic discussed during interview: {body.topic_discussed}

Structure: (1) thank them for their time and reiterate interest;
(2) reference the specific topic discussed and briefly add one insight or
question that follows on from it; (3) close with a clear next-step
statement and formal sign-off "Sincerely, Moses Ndifon".

Return ONLY the letter markdown, no preamble.
"""
        raw = await call_claude(
            f"thankyou-{body.version_id}", SYSTEM_PROMPT, prompt
        )
        letter = raw.strip()
        await db.resume_versions.update_one(
            {"user_id": user_id, "version_id": body.version_id},
            {"$set": {"thank_you_letter_md": letter}},
        )
        email_status = None
        if body.email_to_me:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            email = (user or {}).get("email", "")
            name = (user or {}).get("full_name", "PLOS User")
            today = datetime.now().strftime("%Y-%m-%d")
            pdf_bytes = build_pdf(
                f"Thank You — {ver.get('job_title')}",
                letter,
                footer=f"Generated by PLOS Career Assistant · {today}",
            )
            email_status = send_via_sendgrid(
                to_email=email, to_name=name,
                subject=f"PLOS Career — Thank You Letter for {ver.get('company')} — {today}",
                body_text=letter,
                body_html=letter.replace("\n", "<br>"),
                attachments=[
                    {
                        "content_b64": base64.b64encode(pdf_bytes).decode("ascii"),
                        "filename": f"Thank You - {ver.get('company')} - {today}.pdf",
                        "mime": "application/pdf",
                    }
                ],
            )
        return {"ok": True, "thank_you_letter_md": letter, "email_status": email_status}

    # -------- Follow-up letter --------
    @r.post("/followup")
    async def gen_followup(
        body: FollowUpBody, user_id: str = Depends(get_current_user_id)
    ):
        ver = await db.resume_versions.find_one(
            {"user_id": user_id, "version_id": body.version_id}, {"_id": 0}
        )
        if not ver:
            raise HTTPException(404, "Version not found")
        prompt = f"""Draft a professional follow-up letter (200-280 words) in markdown
business-letter format. It has been {body.days_since_applied} days since the
application was submitted. Job: {ver.get('job_title')} at {ver.get('company')}.

Structure: (1) polite reminder + reference the submitted application;
(2) reiterate one specific value proposition tailored to this role;
(3) restate enthusiasm and request a status update or next-step
information. Formal sign-off "Sincerely, Moses Ndifon".

Return ONLY the letter markdown, no preamble.
"""
        raw = await call_claude(
            f"followup-{body.version_id}", SYSTEM_PROMPT, prompt
        )
        letter = raw.strip()
        await db.resume_versions.update_one(
            {"user_id": user_id, "version_id": body.version_id},
            {"$set": {"follow_up_letter_md": letter}},
        )
        email_status = None
        if body.email_to_me:
            user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
            email = (user or {}).get("email", "")
            name = (user or {}).get("full_name", "PLOS User")
            today = datetime.now().strftime("%Y-%m-%d")
            pdf_bytes = build_pdf(
                f"Follow-Up — {ver.get('job_title')}",
                letter,
                footer=f"Generated by PLOS Career Assistant · {today}",
            )
            email_status = send_via_sendgrid(
                to_email=email, to_name=name,
                subject=f"PLOS Career — Follow-up Letter for {ver.get('company')} — {today}",
                body_text=letter,
                body_html=letter.replace("\n", "<br>"),
                attachments=[
                    {
                        "content_b64": base64.b64encode(pdf_bytes).decode("ascii"),
                        "filename": f"Follow-Up - {ver.get('company')} - {today}.pdf",
                        "mime": "application/pdf",
                    }
                ],
            )
        return {"ok": True, "follow_up_letter_md": letter, "email_status": email_status}

    # -------- Save to Application --------
    @r.post("/save-application")
    async def save_to_application(
        body: SaveApplicationBody, user_id: str = Depends(get_current_user_id)
    ):
        ver = await db.resume_versions.find_one(
            {"user_id": user_id, "version_id": body.version_id}, {"_id": 0}
        )
        if not ver:
            raise HTTPException(404, "Version not found")
        app_id = f"app_{uuid.uuid4().hex[:12]}"
        today = datetime.now(timezone.utc).isoformat()
        app_doc = {
            "application_id": app_id,
            "user_id": user_id,
            "employer": ver.get("company"),
            "role_title": ver.get("job_title"),
            "status": "Applied",
            "applied_date": today,
            "job_url": ver.get("job_url"),
            "match_score": ver.get("ats_score"),
            "tailored_resume_md": ver.get("tailored_resume_md"),
            "cover_letter_md": ver.get("cover_letter_md"),
            "resume_version_id": body.version_id,
            "created_at": today,
        }
        await db.job_applications.insert_one(app_doc)
        await db.resume_versions.update_one(
            {"user_id": user_id, "version_id": body.version_id},
            {"$set": {"saved_to_application_id": app_id}},
        )
        return {"ok": True, "application_id": app_id}

    # -------- SendGrid health --------
    @r.get("/email/status")
    async def email_status(user_id: str = Depends(get_current_user_id)):
        return {
            "sendgrid_ready": _sendgrid_ready(),
            "hint": (
                "Set SENDGRID_API_KEY in backend .env to enable email delivery."
                if not _sendgrid_ready() else
                "SendGrid is configured. From: noreply@plos-app.com"
            ),
        }

    return r
