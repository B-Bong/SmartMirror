"""
health_insights.py — LLM-powered health analysis via Groq.

After each vitals measurement is uploaded to Supabase, this module is called
asynchronously to generate personalised health insights and caregiver
suggestions using Groq (Llama 3). Results are written back to the `health_insights` table.
"""

import os
import json
import logging
from datetime import datetime, timezone, date
from pathlib import Path

try:
    from dotenv import load_dotenv as _load_dotenv
    _DOTENV_PATH = Path(__file__).parent / ".env"
    _HAS_DOTENV = True
except ImportError:
    _HAS_DOTENV = False

from groq import Groq
from supabase import Client as SupabaseClient

logger = logging.getLogger(__name__)

# ── Groq setup ────────────────────────────────────────────────────────────────
# Client is created lazily inside generate_and_store_insights so that
# changes to the GROQ_API_KEY in .env are picked up without restarting
# the backend server.

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


def _get_groq_client():
    """Return a fresh Groq client using the current env key.
    
    Reloads .env on every call so updating the key file takes effect
    immediately without restarting the backend server.
    """
    if _HAS_DOTENV:
        _load_dotenv(_DOTENV_PATH, override=True)
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise ValueError("GROQ_API_KEY not set in environment")
    return Groq(api_key=api_key)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _age_from_dob(dob: str | date | None) -> int | None:
    """Calculate age in years from a date-of-birth string (YYYY-MM-DD)."""
    if dob is None:
        return None
    if isinstance(dob, str):
        try:
            dob = datetime.strptime(dob, "%Y-%m-%d").date()
        except ValueError:
            return None
    today = date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _fetch_elderly_profile(sb: SupabaseClient, elderly_id: str) -> dict:
    """Fetch age, gender, and medical notes from the elderlies table."""
    try:
        result = (
            sb.table("elderlies")
            .select("first_name, date_of_birth, gender, medical_notes")
            .eq("id", elderly_id)
            .limit(1)
            .execute()
        )
        if result.data:
            row = result.data[0]
            return {
                "name": row.get("first_name", "the elderly"),
                "age": _age_from_dob(row.get("date_of_birth")),
                "gender": row.get("gender", "unknown"),
                "medical_notes": row.get("medical_notes", ""),
            }
    except Exception as exc:
        logger.error(f"Failed to fetch elderly profile: {exc}")
    return {"name": "the elderly", "age": None, "gender": "unknown", "medical_notes": ""}


# ── Prompt construction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional health-monitoring AI assistant for elderly care.
You receive vital-sign measurements from a smart mirror and produce a
brief, actionable, and highly personalized health report for the caregiver.

RULES:
1. Write in clear, empathetic language a caregiver can understand.
2. Do NOT diagnose — you are not a doctor.  Flag concerns and suggest consulting a healthcare professional when appropriate.
3. Keep both sections concise (3-5 bullet points each).
4. Assign a risk_level: "low", "moderate", or "high" based on the vitals and the elderly's medical context.
5. Provide deep, context-aware insights based on the elderly's specific medical background (if provided), rather than just comparing vitals to typical healthy baselines. 
6. Offer practical and specific caregiver suggestions tailored to the current vitals and their particular medical conditions.

Return your answer ONLY as valid JSON with exactly these keys:
{
  "insights": "<highly personalized health analysis as a single string with bullet points separated by newlines>",
  "suggestions": "<specific caregiver suggestions as a single string with bullet points separated by newlines>",
  "risk_level": "low | moderate | high"
}
"""


def _build_user_prompt(profile: dict, vitals: dict) -> str:
    """Build the user-turn prompt with elderly context and latest vitals."""
    age_str = f"{profile['age']} years old" if profile['age'] else "age unknown"
    gender_str = profile.get("gender", "unknown")
    medical_notes = profile.get("medical_notes", "")

    lines = [
        f"Elderly profile: {profile['name']}, {age_str}, {gender_str}.",
    ]
    if medical_notes:
        lines.append(f"Medical notes / Pre-existing conditions: {medical_notes}")
        
    lines.extend([
        "",
        "Latest vital-sign measurement:",
    ])

    # Required raw biometric metrics — Gemini derives its own assessment
    required_labels = {
        "heart_rate": ("Heart Rate", "bpm"),
        "respiratory_rate": ("Respiratory Rate", "rpm"),
    }
    # Optional metrics — omitted from prompt if not available
    optional_labels = {
        "hrv_sdnn": ("HRV SDNN", "ms"),
        "hrv_rmssd": ("HRV RMSSD", "ms"),
        "hrv_lfhf": ("HRV LF/HF Ratio", ""),  # often absent — not required
    }
    # wellness_score and stress_level are intentionally excluded —
    # they are backend-derived summaries; Gemini should form its own judgment.

    for key, (label, unit) in required_labels.items():
        value = vitals.get(key)
        if value is not None:
            lines.append(f"  • {label}: {value} {unit}".rstrip())

    for key, (label, unit) in optional_labels.items():
        value = vitals.get(key)
        if value is not None:  # silently skip if blank/null
            lines.append(f"  • {label}: {value} {unit}".rstrip())

    lines.append("")
    lines.append("Please analyse the vitals and provide health insights and caregiver suggestions.")

    return "\n".join(lines)


# ── Core function ─────────────────────────────────────────────────────────────

def generate_and_store_insights(
    sb: SupabaseClient,
    elderly_id: str,
    vitals_id: str,
    vitals_data: dict,
) -> None:
    """Call Groq to analyse vitals and store the result in health_insights.

    This runs in a background thread so it never blocks the main request.
    """
    api_key = os.getenv("GROQ_API_KEY", "")
    model = os.getenv("GROQ_MODEL", GROQ_MODEL)

    if not api_key:
        logger.warning("GROQ_API_KEY not set — skipping health insights")
        return

    # 1. Fetch elderly profile
    profile = _fetch_elderly_profile(sb, elderly_id)
    logger.info(f"Generating health insights for {profile['name']} (vitals_id={vitals_id}, model={model})")

    # 2. Build prompt
    user_prompt = _build_user_prompt(profile, vitals_data)

    # 3. Call Groq
    try:
        groq_client = _get_groq_client()

        response = groq_client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            response_format={"type": "json_object"}
        )

        # Extract JSON from response
        raw_text = response.choices[0].message.content.strip()

        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error(f"Groq returned invalid JSON: {exc}\nRaw: {raw_text[:500]}")
        return
    except Exception as exc:
        logger.error(f"Groq API call failed: {exc}", exc_info=True)
        return

    insights = parsed.get("insights", "")
    suggestions = parsed.get("suggestions", "")
    risk_level = parsed.get("risk_level", "low")

    # Validate risk_level
    if risk_level not in ("low", "moderate", "high"):
        risk_level = "moderate"

    # 4. Store in Supabase
    row = {
        "elderly_id":  elderly_id,
        "vitals_id":   vitals_id,
        "insights":    insights,
        "suggestions": suggestions,
        "risk_level":  risk_level,
    }

    try:
        result = sb.table("health_insights").insert(row).execute()
        logger.info(
            f"Health insights stored (id={result.data[0]['id'] if result.data else '?'}, "
            f"risk={risk_level})"
        )
    except Exception as exc:
        logger.error(f"Failed to store health insights: {exc}", exc_info=True)
