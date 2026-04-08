from __future__ import annotations

import json
from typing import Any

import httpx

from .storage import (
    get_app_settings,
    get_test_session,
    get_uploaded_session,
    list_ai_chat_messages,
    list_ai_memory_entries,
    list_coaching_notes,
    list_drivers,
    list_events,
    list_generated_reports,
    list_setup_database,
    list_tracks,
    list_test_sessions,
    list_uploaded_sessions,
    list_user_accounts,
)
from .tracks import find_track_context


AUDIENCE_GUIDANCE: dict[str, dict[str, str]] = {
    "coach": {
        "label": "Coach format",
        "style": (
            "Write like a race engineer and performance coach. Be direct, technical, and concise. "
            "Use lap-time, sector, consistency, and setup-aware language where supported by the data."
        ),
        "headline": "Create a short report headline that sounds like a coach or engineer title for the session.",
        "key_takeaways": "Give concise technical takeaways that summarize the most important evidence from the session.",
        "primary_focus": "State the single highest-value technical focus for the next run.",
        "support_notes": "Give one short support note that helps explain the broader technical context or risk.",
        "overall_summary": (
            "Summarize the driver's pace level, ranking, likely time-loss phase, and the most important "
            "performance story from the session."
        ),
        "strengths": (
            "List technical strengths such as sector wins, pace stability, minimum speed, top speed, or strong channel trends."
        ),
        "weaknesses": (
            "List the main technical losses, focusing on sectors, consistency, braking/throttle phases, or pace gaps."
        ),
        "action_points": (
            "Give concrete next-run actions a coach or engineer can apply immediately. Mention setup or corner focus only if supported."
        ),
    },
    "driver": {
        "label": "Driver format",
        "style": (
            "Write directly to the driver in clear coaching language. Keep it practical, confident, and action-focused. "
            "Avoid unnecessary jargon and turn technical findings into on-track cues."
        ),
        "headline": "Create a short motivational coaching headline for the driver.",
        "key_takeaways": "Give simple, practical takeaways the driver can understand quickly.",
        "primary_focus": "State the single most important driving focus for the next run.",
        "support_notes": "Give one short note describing what feeling, cue, or habit should help on track.",
        "overall_summary": (
            "Explain what the driver achieved, where the biggest opportunity is, and what feeling or approach they should carry into the next run."
        ),
        "strengths": (
            "List things the driver did well in simple coaching language, such as carrying speed, consistency, or strong exits."
        ),
        "weaknesses": (
            "List the main areas still costing time, phrased as driving opportunities rather than criticism."
        ),
        "action_points": (
            "Give short, specific driving actions for the next run. Focus on what to feel, what to change, and where to apply it."
        ),
    },
    "parent": {
        "label": "Parent-friendly format",
        "style": (
            "Write in plain English for a parent. Be supportive, easy to understand, and light on technical jargon. "
            "Frame the session as progress, learning, and next-step development."
        ),
        "headline": "Create a short reassuring summary headline a parent would immediately understand.",
        "key_takeaways": "Give plain-English progress takeaways for a parent.",
        "primary_focus": "State the main development focus in plain English.",
        "support_notes": "Give one short reassuring note about what the team will do next.",
        "overall_summary": (
            "Explain how the session went overall, what progress was visible, and the main development theme in plain English."
        ),
        "strengths": (
            "List positive takeaways and areas of progress that a parent would understand without telemetry knowledge."
        ),
        "weaknesses": (
            "List the current development areas gently and clearly, without race-engineering jargon."
        ),
        "action_points": (
            "Give short next steps that explain what the team or driver will work on next. These should be reassuring and understandable to a parent."
        ),
    },
}


def build_feedback_payload(analysis: dict, audience: str) -> list[dict]:
    drivers = analysis.get("drivers")
    if not isinstance(drivers, list) or not drivers:
        raise ValueError("Analysis is missing driver telemetry data. Open a processed uploaded session before generating a report.")
    track_context = find_track_context(analysis.get("event_name"))
    return [
        {
            "driver_id": driver.get("driver_id"),
            "driver_name": driver["driver_name"],
            "canonical_driver_name": driver.get("canonical_driver_name") or driver["driver_name"],
            "format_label": audience_label(audience),
            "track_context": track_context,
            "metrics": {
                "best_lap": driver["best_lap"],
                "best_three_average": driver["best_three_average"],
                "consistency": driver["consistency"],
                "best_sector_sum": driver.get("best_sector_sum"),
                "session_rank": driver["session_rank"],
                "lap_delta_to_fastest": driver.get("lap_delta_to_fastest"),
                "time_loss_hint": driver["time_loss_hint"],
                "sector_comparison": driver["sector_comparison"],
                "channel_summary": driver["channel_summary"],
                "average_best_3_speed": driver.get("average_best_3_speed"),
                "average_best_3_throttle": driver.get("average_best_3_throttle"),
                "average_best_3_brake": driver.get("average_best_3_brake"),
                "rpm_extremes": driver.get("rpm_extremes"),
                "gear_extremes": driver.get("gear_extremes"),
                "minimum_corner_speed": driver.get("minimum_corner_speed"),
                "throttle_brake_overlap": driver.get("throttle_brake_overlap"),
                "valid_lap_count": driver.get("valid_lap_count"),
                "invalid_lap_count": driver.get("invalid_lap_count"),
            },
        }
        for driver in drivers
    ]


async def generate_feedback(
    provider: str,
    model: str,
    api_key: str | None,
    analysis: dict,
    audience: str,
    user_account_id: str = "",
    email: str = "",
    role: str = "",
    test_session_id: str = "",
    use_retrieval: bool = True,
    use_memory: bool = True,
) -> list[dict]:
    payloads = build_feedback_payload(analysis, audience)
    shared_context = build_retrieval_context(
        user_account_id=user_account_id,
        email=email,
        role=role,
        session_id=analysis.get("session_id") or "",
        test_session_id=test_session_id,
        use_retrieval=use_retrieval,
        use_memory=use_memory,
    )
    reports = []
    for payload in payloads:
        if provider == "openai":
            response = await generate_with_openai(model, api_key, payload, audience, shared_context)
        else:
            response = await generate_with_ollama(model, payload, audience, shared_context)
        reports.append({
            "driver_id": payload.get("driver_id"),
            "driver_name": payload["driver_name"],
            "canonical_driver_name": payload.get("canonical_driver_name") or payload["driver_name"],
            "format_label": audience_label(audience),
            "headline": response.get("headline", ""),
            "overall_summary": response["overall_summary"],
            "key_takeaways": response.get("key_takeaways", []),
            "primary_focus": response.get("primary_focus", ""),
            "support_notes": response.get("support_notes", []),
            "strengths": response["strengths"],
            "weaknesses": response["weaknesses"],
            "action_points": response["action_points"],
            "confidence_rating": response["confidence_rating"],
            "raw_model_output": response,
        })
    return reports


async def generate_with_openai(model: str, api_key: str | None, payload: dict, audience: str, retrieval_context: dict | None = None) -> dict:
    if not api_key:
        return fallback_report(payload, audience)

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a performance coach generating structured kart telemetry feedback. Return valid JSON only.",
                    },
                    {
                        "role": "user",
                        "content": build_prompt(payload, audience, retrieval_context),
                    },
                ],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": {
                        "name": "driver_feedback",
                        "strict": True,
                        "schema": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "overall_summary": {"type": "string"},
                                "headline": {"type": "string"},
                                "key_takeaways": {"type": "array", "items": {"type": "string"}},
                                "primary_focus": {"type": "string"},
                                "support_notes": {"type": "array", "items": {"type": "string"}},
                                "strengths": {"type": "array", "items": {"type": "string"}},
                                "weaknesses": {"type": "array", "items": {"type": "string"}},
                                "action_points": {"type": "array", "items": {"type": "string"}},
                                "confidence_rating": {"type": "string"},
                            },
                            "required": ["overall_summary", "headline", "key_takeaways", "primary_focus", "support_notes", "strengths", "weaknesses", "action_points", "confidence_rating"],
                        },
                    },
                },
            },
        )
        response.raise_for_status()
        data = response.json()
        parsed = safe_json_parse(
            (((data.get("choices") or [{}])[0]).get("message") or {}).get("content")
        )
        return parsed or fallback_report(payload, audience)


async def generate_with_ollama(model: str, payload: dict, audience: str, retrieval_context: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "http://127.0.0.1:11434/api/generate",
            json={
                "model": model,
                "prompt": build_prompt(payload, audience, retrieval_context),
                "stream": False,
                "format": {
                    "type": "object",
                    "properties": {
                        "overall_summary": {"type": "string"},
                        "headline": {"type": "string"},
                        "key_takeaways": {"type": "array", "items": {"type": "string"}},
                        "primary_focus": {"type": "string"},
                        "support_notes": {"type": "array", "items": {"type": "string"}},
                        "strengths": {"type": "array", "items": {"type": "string"}},
                        "weaknesses": {"type": "array", "items": {"type": "string"}},
                        "action_points": {"type": "array", "items": {"type": "string"}},
                        "confidence_rating": {"type": "string"}
                    },
                    "required": ["overall_summary", "headline", "key_takeaways", "primary_focus", "support_notes", "strengths", "weaknesses", "action_points", "confidence_rating"]
                },
                "options": {"temperature": 0.2}
            },
        )
        response.raise_for_status()
        data = response.json()
        parsed = safe_json_parse(data.get("response"))
        return parsed or fallback_report(payload, audience)


async def openai_health(api_key: str | None = None) -> dict:
    if not api_key:
        return {
            "configured": False,
            "reachable": False,
            "models": [],
        }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            response.raise_for_status()
            payload = response.json()
            model_ids = [
                item.get("id")
                for item in payload.get("data", [])
                if isinstance(item, dict) and str(item.get("id", "")).startswith("gpt")
            ]
            return {
                "configured": True,
                "reachable": True,
                "models": model_ids[:24],
            }
    except Exception:
        return {
            "configured": True,
            "reachable": False,
            "models": [],
        }


async def ollama_health() -> dict:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get("http://127.0.0.1:11434/api/tags")
            response.raise_for_status()
            data = response.json()
            return {
                "reachable": True,
                "models": [model.get("name") for model in data.get("models", [])],
            }
    except Exception:
        return {
            "reachable": False,
            "models": [],
        }


async def chat_with_ollama(model: str, messages: list[dict], retrieval_context: dict | None = None) -> str:
    system_prompt = (
        "You are the DER UniPro Coaching Platform assistant. "
        "Help users with karting session planning, telemetry interpretation, driver coaching, "
        "track preparation, and using this local app. Be concise, practical, and avoid inventing telemetry facts."
    )
    if retrieval_context:
        system_prompt = f"{system_prompt}\n\nUse this app context and memory when helpful:\n{format_retrieval_context(retrieval_context)}"
    payload_messages = [{"role": "system", "content": system_prompt}]
    payload_messages.extend(
        {
            "role": message.get("role", "user"),
            "content": str(message.get("content", "")).strip(),
        }
        for message in messages
        if str(message.get("content", "")).strip()
    )
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            "http://127.0.0.1:11434/api/chat",
            json={
                "model": model,
                "messages": payload_messages,
                "stream": False,
                "options": {"temperature": 0.3},
            },
        )
        response.raise_for_status()
        data = response.json()
        return (
            data.get("message", {}).get("content")
            or data.get("response")
            or "I couldn't generate a reply just now."
        ).strip()


async def chat_with_openai(model: str, api_key: str | None, messages: list[dict], retrieval_context: dict | None = None) -> str:
    if not api_key:
        raise RuntimeError("OpenAI API key is required")
    system_prompt = (
        "You are the DER Telemetry Analysis Software assistant. "
        "Help users with karting telemetry, planning, reporting, setup sheets, and race-weekend workflow. "
        "Use the supplied app data and memory when relevant. Do not invent telemetry facts or session history."
    )
    if retrieval_context:
        system_prompt = f"{system_prompt}\n\nUse this app context and memory when helpful:\n{format_retrieval_context(retrieval_context)}"
    chat_messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    chat_messages.extend(
        {
            "role": message.get("role", "user"),
            "content": str(message.get("content", "")).strip(),
        }
        for message in messages
        if str(message.get("content", "")).strip()
    )
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": chat_messages,
            },
        )
        response.raise_for_status()
        payload = response.json()
        return (
            (((payload.get("choices") or [{}])[0]).get("message") or {}).get("content")
            or payload.get("output_text")
            or _extract_text_output(payload)
            or "I couldn't generate a reply just now."
        ).strip()


def build_prompt(payload: dict, audience: str, retrieval_context: dict | None = None) -> str:
    guidance = AUDIENCE_GUIDANCE.get(audience, AUDIENCE_GUIDANCE["coach"])
    retrieval_text = format_retrieval_context(retrieval_context)
    return f"""
You are a performance coach generating structured feedback for kart telemetry.
Audience: {audience}
Audience label: {guidance["label"]}
Writing style:
{guidance["style"]}

Driver summary:
{json.dumps(payload, indent=2)}

Relevant app context and memory:
{retrieval_text}

Return JSON only with keys:
headline
overall_summary
key_takeaways
primary_focus
support_notes
strengths
weaknesses
action_points
confidence_rating

Field-specific instructions:
- headline: {guidance["headline"]}
- key_takeaways: {guidance["key_takeaways"]}
- primary_focus: {guidance["primary_focus"]}
- support_notes: {guidance["support_notes"]}
- overall_summary: {guidance["overall_summary"]}
- strengths: {guidance["strengths"]}
- weaknesses: {guidance["weaknesses"]}
- action_points: {guidance["action_points"]}

Use the track_context if present to make the feedback track-aware, but do not invent any unsupported corner-specific claims.
The response must be concise, factual, and based on the supplied metrics rather than invented telemetry.
""".strip()


def fallback_report(payload: dict, audience: str) -> dict:
    metrics = payload["metrics"]
    track_context = payload.get("track_context") or {}
    first_focus = (track_context.get("coaching_focus") or ["Work on the biggest time-loss phase first."])[0]
    best_lap = metrics["best_lap"]
    best_three = metrics["best_three_average"]
    rank = metrics["session_rank"]
    hint = metrics["time_loss_hint"]
    valid_laps = metrics.get("valid_lap_count")
    sector_note = "Use the sector trend to decide the next area of focus."
    if audience == "driver":
        return {
            "headline": "Clear next-run opportunity",
            "overall_summary": (
                f"{payload['driver_name']} put together a best lap of {best_lap} with a best-three average of {best_three}. "
                f"The next gain should come from {hint.lower()}."
            ),
            "key_takeaways": [
                f"Best lap was {best_lap}.",
                f"Session rank was P{rank}.",
            ],
            "primary_focus": first_focus,
            "support_notes": [
                "Keep the strongest laps as the feeling reference for the next run.",
            ],
            "strengths": [
                f"You were ranked P{rank} on outright lap time.",
                f"Your best lap was {best_lap}.",
            ],
            "weaknesses": [
                hint,
                "There is still time to find by repeating the strongest laps more consistently.",
            ],
            "action_points": [
                first_focus,
                "Carry the strongest rhythm from your best laps into the next run.",
                sector_note,
            ],
            "confidence_rating": "Medium",
        }
    if audience == "parent":
        return {
            "headline": "Progress summary from the session",
            "overall_summary": (
                f"{payload['driver_name']} completed the session with a best lap of {best_lap} and showed a best-three average of {best_three}. "
                "The main focus now is turning the quickest moments into repeatable pace."
            ),
            "key_takeaways": [
                f"Best lap recorded was {best_lap}.",
                f"The session position for this driver was P{rank}.",
            ],
            "primary_focus": "Build more repeatable pace across the run.",
            "support_notes": [
                "The team will use the next session to reinforce the same key focus areas.",
            ],
            "strengths": [
                f"Session ranking was P{rank}.",
                f"The fastest lap of the session for this driver was {best_lap}.",
            ],
            "weaknesses": [
                f"The biggest current development area is {hint.lower()}",
                "The next step is improving repeatability across more laps.",
            ],
            "action_points": [
                "The coaching focus will stay on the biggest time-loss area first.",
                "The team will review the session trend before the next run.",
                "This report is intended as a progress summary rather than a full engineering sheet.",
            ],
            "confidence_rating": "Medium",
        }
    return {
        "headline": "Technical session debrief",
        "overall_summary": (
            f"{payload['driver_name']} completed the session with best lap {best_lap}, best-three average {best_three}, "
            f"and session rank P{rank}."
        ),
        "key_takeaways": [
            f"Best lap {best_lap}.",
            f"Session rank P{rank}.",
        ],
        "primary_focus": first_focus,
        "support_notes": [
            sector_note,
        ],
        "strengths": [f"Session rank: {rank}", f"Best lap: {best_lap}", *( [f"Valid laps: {valid_laps}"] if valid_laps is not None else [] )],
        "weaknesses": [hint],
        "action_points": [
            first_focus,
            sector_note,
            "Use the coach report to brief the next run plan."
        ],
        "confidence_rating": "Medium"
    }


def audience_label(audience: str) -> str:
    return {
        "coach": "Coach format",
        "driver": "Driver format",
        "parent": "Parent-friendly format",
    }[audience]


def safe_json_parse(value: str | None):
    if not value:
        return None
    cleaned = value.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def _extract_json_response(payload: dict):
    direct = safe_json_parse(payload.get("output_text"))
    if direct:
        return direct
    for output in payload.get("output", []):
        for content in output.get("content", []):
            parsed = safe_json_parse(content.get("text"))
            if parsed:
                return parsed
    return None


def _extract_text_output(payload: dict) -> str:
    for output in payload.get("output", []):
        for content in output.get("content", []):
            text = content.get("text")
            if text:
                return str(text)
    return ""


def build_retrieval_context(
    user_account_id: str = "",
    email: str = "",
    role: str = "",
    session_id: str = "",
    test_session_id: str = "",
    use_retrieval: bool = True,
    use_memory: bool = True,
) -> dict:
    context: dict[str, Any] = {
        "memories": [],
        "recent_sessions": [],
        "recent_reports": [],
        "recent_notes": [],
        "recent_planned_sessions": [],
        "recent_chat": [],
        "current_session": {},
        "current_session_detail": {},
        "current_planned_session": {},
        "app_preferences": {},
        "driver_directory": [],
        "team_accounts": [],
        "track_library": [],
        "recent_events": [],
        "setup_database": [],
    }
    if use_memory:
        context["memories"] = list_ai_memory_entries(user_account_id=user_account_id, email=email, role=role)[:8]
        context["recent_chat"] = list_ai_chat_messages(user_account_id=user_account_id, email=email, role=role, limit=8)
    if not use_retrieval:
        return context

    settings = get_app_settings(user_account_id=user_account_id, email=email, role=role)
    context["app_preferences"] = {
        "organisation_name": settings.get("organisationName", ""),
        "support_email": settings.get("supportEmail", ""),
        "default_audience": settings.get("defaultAudience", ""),
        "default_session_type": settings.get("defaultSessionType", ""),
        "default_track_name": settings.get("defaultTrackName", ""),
        "speed_unit": settings.get("speedUnit", ""),
        "ai_provider": settings.get("aiProvider", ""),
        "ai_model": settings.get("openAiModel") or settings.get("aiModel") or "",
        "show_track_maps": settings.get("showTrackMaps", False),
        "compact_tables": settings.get("compactTables", False),
        "pdf_file_prefix": settings.get("pdfFilePrefix", ""),
    }

    uploaded_sessions = list_uploaded_sessions()
    if session_id:
        matching = next((item for item in uploaded_sessions if item.get("id") == session_id), None)
        if matching:
            context["current_session"] = matching
            try:
                detail = get_uploaded_session(session_id)
                context["current_session_detail"] = _summarize_uploaded_session_detail(detail)
            except Exception:
                context["current_session_detail"] = {}
    context["recent_sessions"] = uploaded_sessions[:6]
    context["recent_planned_sessions"] = list_test_sessions()[:6]
    recent_reports = list_generated_reports(include_reports=False)[:6]
    context["recent_reports"] = recent_reports
    context["recent_events"] = [_summarize_event(item) for item in list_events()[:6]]
    context["driver_directory"] = [_summarize_driver(item) for item in list_drivers()[:12]]
    context["team_accounts"] = [_summarize_account(item) for item in list_user_accounts()[:12]]
    context["track_library"] = [_summarize_track(item) for item in list_tracks()[:10]]
    context["setup_database"] = _summarize_setup_database(list_setup_database())

    note_rows: list[dict] = []
    for session_item in context["recent_sessions"][:4]:
        note_rows.extend(list_coaching_notes(session_item["id"])[:2])
    if session_id and not any(item.get("session_id") == session_id for item in note_rows):
        note_rows.extend(list_coaching_notes(session_id)[:4])
    context["recent_notes"] = note_rows[:8]

    if test_session_id:
        matching_planned = next((item for item in context["recent_planned_sessions"] if item.get("id") == test_session_id), None)
        if matching_planned:
            context["current_planned_session"] = matching_planned
        if not context["current_planned_session"]:
            try:
                context["current_planned_session"] = get_test_session(test_session_id)
            except Exception:
                context["current_planned_session"] = {}
    return context


def format_retrieval_context(context: dict | None) -> str:
    if not context:
        return "No retrieval context supplied."
    lines: list[str] = []
    memories = context.get("memories") or []
    if memories:
        lines.append("Saved memory:")
        for item in memories[:6]:
            label = item.get("title") or "Memory"
            lines.append(f"- {label}: {item.get('content', '')}")
    current_session = context.get("current_session") or {}
    if current_session:
        lines.append("Current uploaded session:")
        lines.append(
            f"- {current_session.get('event_round', current_session.get('event_name', 'Session'))} / "
            f"{current_session.get('session_type', '')} / {current_session.get('driver_count', 0)} drivers"
        )
    current_session_detail = context.get("current_session_detail") or {}
    if current_session_detail:
        lines.append("Current session detail:")
        for item in current_session_detail.get("drivers", [])[:6]:
            lines.append(
                f"- {item.get('name', 'Driver')}: best lap {item.get('best_lap', '-')}, "
                f"rank P{item.get('rank', '-')}, focus {item.get('time_loss_hint', '-')}"
            )
        for item in current_session_detail.get("notes", [])[:4]:
            lines.append(f"- Note: {item}")
        for item in current_session_detail.get("reports", [])[:4]:
            lines.append(f"- Report: {item}")
    planned_session = context.get("current_planned_session") or {}
    if planned_session:
        lines.append("Current planned session:")
        lines.append(
            f"- {planned_session.get('name', '')} / {planned_session.get('venue', '')} / "
            f"status {planned_session.get('status', 'planned')}"
        )
        if planned_session.get("drivers"):
            for driver in planned_session.get("drivers", [])[:8]:
                setup = driver.get("setup") or {}
                setup_bits = [
                    f"front {setup.get('front_sprocket')}" if setup.get("front_sprocket") else "",
                    f"rear {setup.get('rear_sprocket')}" if setup.get("rear_sprocket") else "",
                    f"front psi {setup.get('front_tyre_pressure')}" if setup.get("front_tyre_pressure") not in ("", None) else "",
                    f"rear psi {setup.get('rear_tyre_pressure')}" if setup.get("rear_tyre_pressure") not in ("", None) else "",
                ]
                lines.append(f"- Planned driver {driver.get('name', '')}: {', '.join(bit for bit in setup_bits if bit) or 'setup not set'}")
    recent_sessions = context.get("recent_sessions") or []
    if recent_sessions:
        lines.append("Recent uploaded sessions:")
        for item in recent_sessions[:5]:
            lines.append(
                f"- {item.get('event_round', item.get('event_name', 'Session'))}: "
                f"{item.get('session_type', '')}, {item.get('driver_count', 0)} drivers, status {item.get('status', 'uploaded')}"
            )
    recent_reports = context.get("recent_reports") or []
    if recent_reports:
        lines.append("Recent generated reports:")
        for item in recent_reports[:5]:
            lines.append(
                f"- {item.get('audience', 'coach')} report using {item.get('provider', '')} / {item.get('model', '')} "
                f"status {item.get('status', 'draft')}"
            )
    recent_notes = context.get("recent_notes") or []
    if recent_notes:
        lines.append("Recent coaching notes:")
        for item in recent_notes[:5]:
            driver_name = item.get("driver_name") or "General"
            lines.append(f"- {driver_name}: {item.get('title', '')} {item.get('body', '')}".strip())
    recent_events = context.get("recent_events") or []
    if recent_events:
        lines.append("Recent events:")
        for item in recent_events[:5]:
            lines.append(f"- {item.get('name', '')}: venue {item.get('venue', '')}, dates {item.get('date_label', '')}, sessions {item.get('session_count', 0)}")
    driver_directory = context.get("driver_directory") or []
    if driver_directory:
        lines.append("Driver directory:")
        for item in driver_directory[:8]:
            lines.append(
                f"- {item.get('name', '')} #{item.get('number', '-')}, class {item.get('class_name', 'Not set')}, aliases {', '.join(item.get('aliases', [])) or 'none'}"
            )
    team_accounts = context.get("team_accounts") or []
    if team_accounts:
        lines.append("Team accounts:")
        for item in team_accounts[:8]:
            lines.append(
                f"- {item.get('name', '')}: role {item.get('role', '')}, status {item.get('status', '')}, linked drivers {', '.join(item.get('assigned_drivers', [])) or 'none'}"
            )
    track_library = context.get("track_library") or []
    if track_library:
        lines.append("Track library:")
        for item in track_library[:6]:
            lines.append(
                f"- {item.get('name', '')}: venue {item.get('venue', '')}, aliases {', '.join(item.get('aliases', [])) or 'none'}, "
                f"coaching focus {', '.join(item.get('coaching_focus', [])) or 'none'}"
            )
    setup_database = context.get("setup_database") or []
    if setup_database:
        lines.append("Setup database:")
        for item in setup_database[:6]:
            lines.append(
                f"- {item.get('track_name', '')}: {item.get('setup_count', 0)} saved setups across "
                f"{item.get('session_count', 0)} sessions. Common rear sprocket {item.get('rear_sprocket') or 'not enough data'}, "
                f"front pressure {item.get('front_pressure') or 'not enough data'}, rear pressure {item.get('rear_pressure') or 'not enough data'}."
            )
            if item.get("baseline_label") or item.get("baseline_notes"):
                lines.append(
                    f"  Baseline: {item.get('baseline_label') or 'Recommended baseline'} / "
                    f"{item.get('baseline_notes') or 'No baseline notes'}"
                )
            if item.get("setup_notes"):
                lines.append(f"  Track setup notes: {', '.join(item.get('setup_notes') or [])}")
            example = item.get("example_entry") or {}
            if example:
                lines.append(
                    f"  Example: {example.get('driver_name', 'Driver')} / {example.get('session_name', '')} / "
                    f"{example.get('session_date', '')} / best lap {example.get('best_lap') or '-'}"
                )
    preferences = context.get("app_preferences") or {}
    if preferences:
        lines.append("App preferences:")
        for key, value in preferences.items():
            if value not in ("", None, [], {}):
                lines.append(f"- {key}: {value}")
    recent_chat = context.get("recent_chat") or []
    if recent_chat:
        lines.append("Recent chat history:")
        for item in recent_chat[-6:]:
            lines.append(f"- {item.get('role', 'user')}: {item.get('content', '')}")
    return "\n".join(lines) if lines else "No stored session history, reports, notes, or memory were found."


def _summarize_uploaded_session_detail(detail: dict) -> dict:
    session = detail.get("session") or {}
    analysis = session.get("analysis") or {}
    drivers = []
    for driver in (analysis.get("drivers") or [])[:8]:
        drivers.append(
            {
                "name": driver.get("canonical_driver_name") or driver.get("driver_name") or "Driver",
                "best_lap": driver.get("best_lap"),
                "rank": driver.get("session_rank"),
                "time_loss_hint": driver.get("time_loss_hint"),
                "minimum_corner_speed": driver.get("minimum_corner_speed"),
                "top_speed": (driver.get("channel_summary") or {}).get("top_speed"),
            }
        )
    notes = [
        f"{item.get('driver_name') or 'General'} - {item.get('title', '')}: {item.get('body', '')}".strip()
        for item in (detail.get("notes") or [])[:6]
    ]
    reports = [
        f"{item.get('audience', 'coach')} / {item.get('status', 'draft')} / {item.get('provider', '')} {item.get('model', '')}".strip()
        for item in (detail.get("reports") or [])[:6]
    ]
    return {
        "drivers": drivers,
        "notes": notes,
        "reports": reports,
    }


def _summarize_driver(driver: dict) -> dict:
    return {
        "id": driver.get("id"),
        "name": driver.get("name"),
        "number": driver.get("number"),
        "class_name": driver.get("class_name"),
        "aliases": driver.get("aliases") or [],
        "email": driver.get("email", ""),
    }


def _summarize_account(account: dict) -> dict:
    linked = []
    if account.get("linked_driver_id"):
        linked.append(account.get("linked_driver_id"))
    linked.extend(account.get("assigned_driver_ids") or [])
    return {
        "id": account.get("id"),
        "name": account.get("name"),
        "email": account.get("email"),
        "role": account.get("role"),
        "status": account.get("status"),
        "assigned_drivers": linked,
        "permissions": account.get("permissions") or {},
    }


def _summarize_track(track: dict) -> dict:
    return {
        "id": track.get("id"),
        "name": track.get("name"),
        "venue": track.get("venue"),
        "aliases": track.get("aliases") or [],
        "coaching_focus": track.get("coaching_focus") or [],
        "layout_notes": track.get("layout_notes", ""),
    }


def _summarize_event(event: dict) -> dict:
    date_bits = [event.get("start_date") or event.get("date") or "", event.get("end_date") or ""]
    date_label = " to ".join(bit for bit in date_bits if bit)
    return {
        "id": event.get("id"),
        "name": event.get("name"),
        "venue": event.get("venue"),
        "session_type": event.get("session_type"),
        "date_label": date_label,
        "session_count": len(event.get("sessions") or []),
        "drivers": [driver.get("name", "") for driver in (event.get("drivers") or [])[:8]],
    }


def _summarize_setup_database(setup_database: dict) -> list[dict]:
    payload = []
    for track in (setup_database.get("tracks") or [])[:8]:
        common_values = track.get("common_values") or {}
        example_entry = (track.get("entries") or [{}])[0] or {}
        payload.append(
            {
                "track_name": track.get("track_name", ""),
                "setup_count": track.get("setup_count", 0),
                "session_count": track.get("session_count", 0),
                "driver_count": track.get("driver_count", 0),
                "latest_date": track.get("latest_date", ""),
                "rear_sprocket": _common_setup_value(common_values, "rear_sprocket"),
                "front_sprocket": _common_setup_value(common_values, "front_sprocket"),
                "front_pressure": _common_setup_value(common_values, "front_tyre_pressure"),
                "rear_pressure": _common_setup_value(common_values, "rear_tyre_pressure"),
                "baseline_label": (track.get("recommended_baseline") or {}).get("label", ""),
                "baseline_notes": (track.get("recommended_baseline") or {}).get("notes", ""),
                "setup_notes": [item.get("label", "") for item in ((track.get("track") or {}).get("setupNotes") or [])[:4]],
                "example_entry": {
                    "driver_name": example_entry.get("driver_name", ""),
                    "session_name": example_entry.get("session_name", ""),
                    "session_date": example_entry.get("session_date", ""),
                    "best_lap": (example_entry.get("best_result") or {}).get("best_lap"),
                },
            }
        )
    return payload


def _common_setup_value(common_values: dict, field: str) -> str:
    entries = common_values.get(field) or []
    if not entries:
        return ""
    first = entries[0] or {}
    value = first.get("value")
    count = first.get("count")
    if value in ("", None):
        return ""
    return f"{value} ({count})" if count else str(value)
