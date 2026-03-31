"""
health_insights.py — LLM-powered health analysis via Google Gemini.

After each vitals measurement is uploaded to Supabase, this module is called
asynchronously to generate personalised health insights and caregiver
suggestions.  Results are written back to the `health_insights` table.
"""

import os
import json
import logging
from datetime import datetime, timezone, date

from google import genai
from google.genai import types
from supabase import Client as SupabaseClient

logger = logging.getLogger(__name__)

# ── Gemini setup ──────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

client = None
if GEMINI_API_KEY:
    client = genai.Client(api_key=GEMINI_API_KEY)
    logger.info(f"Gemini configured with model: {GEMINI_MODEL}")
else:
    logger.warning("GEMINI_API_KEY not set — health insights disabled")


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
    """Fetch age and gender from the elderlies table."""
    try:
        result = (
            sb.table("elderlies")
            .select("first_name, date_of_birth, gender")
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
            }
    except Exception as exc:
        logger.error(f"Failed to fetch elderly profile: {exc}")
    return {"name": "the elderly", "age": None, "gender": "unknown"}


# ── Prompt construction ───────────────────────────────────────────────────────

_SYSTEM_PROMPT = """\
You are a professional health-monitoring AI assistant for elderly care.
You receive vital-sign measurements from a smart mirror and produce a
brief, actionable health report for the caregiver.

RULES:
1. Write in clear, empathetic language a caregiver can understand.
2. Do NOT diagnose — you are not a doctor.  Flag concerns and suggest
   consulting a healthcare professional when appropriate.
3. Keep both sections concise (3-5 bullet points each).
4. Assign a risk_level: "low", "moderate", or "high" based on the vitals.

Return your answer ONLY as valid JSON with exactly these keys:
{
  "insights": "<health analysis as a single string with bullet points separated by newlines>",
  "suggestions": "<caregiver suggestions as a single string with bullet points separated by newlines>",
  "risk_level": "low | moderate | high"
}
"""


def _build_user_prompt(profile: dict, vitals: dict) -> str:
    """Build the user-turn prompt with elderly context and latest vitals."""
    age_str = f"{profile['age']} years old" if profile['age'] else "age unknown"
    gender_str = profile.get("gender", "unknown")

    lines = [
        f"Elderly profile: {profile['name']}, {age_str}, {gender_str}.",
        "",
        "Latest vital-sign measurement:",
    ]

    metric_labels = {
        "heart_rate": ("Heart Rate", "bpm"),
        "respiratory_rate": ("Respiratory Rate", "rpm"),
        "hrv_sdnn": ("HRV SDNN", "ms"),
        "hrv_rmssd": ("HRV RMSSD", "ms"),
        "hrv_lfhf": ("HRV LF/HF Ratio", ""),
        "wellness_score": ("Wellness Score", "/100"),
        "stress_level": ("Stress Level", ""),
    }

    for key, (label, unit) in metric_labels.items():
        value = vitals.get(key)
        if value is not None:
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
    """Call Gemini to analyse vitals and store the result in health_insights.

    This runs in a background thread so it never blocks the main request.
    """
    if not GEMINI_API_KEY:
        logger.warning("Gemini API key not set — skipping health insights")
        return

    # 1. Fetch elderly profile
    profile = _fetch_elderly_profile(sb, elderly_id)
    logger.info(f"Generating health insights for {profile['name']} (vitals_id={vitals_id})")

    # 2. Build prompt
    user_prompt = _build_user_prompt(profile, vitals_data)

    # 3. Call Gemini
    try:
        if not client:
            raise ValueError("Gemini client not initialized")
            
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=user_prompt,
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
                response_mime_type="application/json",
            )
        )

        # Extract JSON from response
        raw_text = response.text.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1]  # remove first line
            raw_text = raw_text.rsplit("```", 1)[0]  # remove last fence
            raw_text = raw_text.strip()

        parsed = json.loads(raw_text)
    except json.JSONDecodeError as exc:
        logger.error(f"Gemini returned invalid JSON: {exc}\nRaw: {raw_text[:500]}")
        return
    except Exception as exc:
        logger.error(f"Gemini API call failed: {exc}", exc_info=True)
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
