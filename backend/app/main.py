from __future__ import annotations

import io
import sqlite3
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import httpx
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .ai import chat_with_ollama, chat_with_openai, generate_feedback, ollama_health, openai_health
from .analysis import _build_corner_analysis, _build_sector_analysis, build_analysis
from .mailer import email_settings_ready, send_email
from .parser import parse_tsv_file
from .schemas import AccountActionRequest, AccessLevelRequest, AiMemoryRequest, AiMemoryResponse, AppSettingsRequest, BackupCreateResponse, ChatRequest, ChatResponse, CoachingNoteRequest, DriverCreateRequest, EmailSettingsRequest, EmailSettingsTestRequest, EventCreateRequest, FeedbackRequest, FeedbackResponse, LoginRequest, LoginResponse, PasswordChangeRequest, PasswordResetConfirmRequest, PasswordResetRequest, PasswordResetResponse, RegisterRequest, RegistrationResponse, ReportPublishRequest, SeedOverview, SessionPresetRequest, SessionStatusRequest, TestSessionCreateRequest, TrackUpdateRequest, UserAccountRequest
from .storage import (
    append_ai_chat_messages,
    approve_user_account,
    change_user_account_password,
    create_database_backup,
    create_access_level,
    create_driver,
    create_event,
    create_password_reset_token,
    create_registration_account,
    create_test_session,
    create_user_account,
    clear_ai_chat_messages,
    delete_coaching_note,
    delete_ai_memory_entry,
    delete_driver,
    delete_event,
    delete_test_session,
    delete_uploaded_session,
    delete_session_preset,
    delete_user_account,
    export_operational_data,
    get_database_health,
    get_email_settings,
    get_app_settings,
    get_app_settings_with_secrets,
    get_driver,
    get_driver_by_credentials,
    get_driver_timeline,
    get_driver_portal,
    list_ai_chat_messages,
    list_ai_memory_entries,
    get_user_account,
    get_test_session,
    get_test_session_snapshot,
    get_uploaded_session,
    get_user_account_by_credentials,
    get_user_account_by_email,
    get_user_account_portal,
    get_restore_guidance,
    init_database,
    list_access_levels,
    list_auth_audit_log,
    list_database_backups,
    list_drivers,
    list_email_delivery_log,
    list_events,
    list_generated_reports,
    list_kart_classes,
    list_coaching_notes,
    list_setup_database,
    list_session_presets,
    list_tracks,
    list_test_sessions,
    list_uploaded_sessions,
    list_user_accounts,
    match_driver_name,
    reset_password_with_token,
    reject_user_account,
    record_auth_audit_event,
    record_email_delivery,
    save_ai_memory_entry,
    save_generated_report,
    save_app_settings,
    save_email_settings,
    save_coaching_note,
    save_uploaded_session,
    save_session_preset,
    update_generated_report_publish_state,
    update_access_level,
    update_driver,
    update_event,
    update_track,
    update_uploaded_session_status,
    update_test_session,
    update_test_session_weather_forecast,
    update_user_account,
)
from .weather import fetch_weather_forecast

app = FastAPI(title="UniPro Fleet Intelligence API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _generate_temporary_password() -> str:
    import secrets

    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%"
    return "".join(secrets.choice(alphabet) for _ in range(12))


def _send_approval_email(account: dict, temporary_password: str) -> None:
    settings = get_email_settings()
    if not email_settings_ready(settings):
        raise RuntimeError("Email settings are incomplete")
    role_label = "Coach" if account["role"] == "manager" else account["role"].title()
    body = (
        f"Hello {account['name']},\n\n"
        f"Your {role_label} account for DER UniPro Coaching Platform has been approved.\n\n"
        f"Email: {account['email']}\n"
        f"Temporary password: {temporary_password}\n\n"
        "You will be asked to change this password the first time you sign in.\n\n"
        "Regards,\nDER UniPro Coaching Platform"
    )
    send_email(settings, account["email"], "Your DER UniPro account has been approved", body)


def _email_diagnostics(settings: dict | None) -> dict:
    settings = settings or {}
    return {
        "host": str(settings.get("smtpHost", "")).strip(),
        "port": str(settings.get("smtpPort", "")).strip(),
        "security": "SSL" if settings.get("useSsl") else "STARTTLS" if settings.get("useTls", True) else "None",
        "allow_invalid_certificates": bool(settings.get("allowInvalidCertificates", False)),
    }


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


def _resolve_openai_api_key(user_account_id: str = "", email: str = "", role: str = "", api_key: str | None = None) -> str | None:
    provided_key = str(api_key or "").strip()
    if provided_key:
        return provided_key
    settings = get_app_settings_with_secrets(user_account_id=user_account_id, email=email, role=role)
    saved_key = str(settings.get("openAiApiKey", "") or "").strip()
    return saved_key or None


def _send_password_reset_email(email: str, token: str) -> None:
    settings = get_email_settings()
    if not email_settings_ready(settings):
        raise RuntimeError("Email settings are incomplete")
    body = (
        "A password reset was requested for your DER UniPro Coaching Platform account.\n\n"
        f"Reset token: {token}\n\n"
        "Return to the login screen, choose Forgot password, and enter this token with your new password.\n"
        "This token expires in 30 minutes.\n\n"
        "If you did not request this, you can ignore this email."
    )
    send_email(settings, email, "DER UniPro password reset", body)


@app.on_event("startup")
async def startup_event():
    init_database()


@app.get("/seed/overview", response_model=SeedOverview)
async def seed_overview():
    return SeedOverview(
        drivers=[driver["name"] for driver in list_drivers()],
        events=[event["name"] for event in list_events()],
    )


@app.get("/drivers")
async def drivers_index():
    return {"drivers": list_drivers()}


@app.post("/drivers")
async def drivers_create(payload: DriverCreateRequest):
    try:
        return create_driver(payload.name, payload.number, payload.class_name, payload.aliases, payload.email, payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/drivers/{driver_id}")
async def drivers_update(driver_id: str, payload: DriverCreateRequest):
    try:
        return update_driver(driver_id, payload.name, payload.number, payload.class_name, payload.aliases, payload.email, payload.password)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Driver not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/drivers/{driver_id}")
async def drivers_delete(driver_id: str):
    try:
        delete_driver(driver_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Driver not found") from exc
    return {"ok": True}


@app.get("/events")
async def events_index():
    return {"events": list_events()}


@app.get("/access-levels")
async def access_levels_index():
    return {"access_levels": list_access_levels()}


@app.post("/access-levels")
async def access_levels_create(payload: AccessLevelRequest):
    return create_access_level(payload.name, payload.permissions)


@app.put("/access-levels/{access_level_id}")
async def access_levels_update(access_level_id: str, payload: AccessLevelRequest):
    try:
        return update_access_level(access_level_id, payload.name, payload.permissions)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Access level not found") from exc


@app.get("/user-accounts")
async def user_accounts_index():
    return {"user_accounts": list_user_accounts()}


@app.post("/user-accounts")
async def user_accounts_create(payload: UserAccountRequest):
    try:
        return create_user_account(
            payload.name,
            payload.email,
            payload.password,
            payload.role,
            payload.access_level_id,
            payload.linked_driver_id,
            payload.assigned_driver_ids,
            payload.status,
            payload.must_change_password,
            False,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="An account with that email already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.put("/user-accounts/{account_id}")
async def user_accounts_update(account_id: str, payload: UserAccountRequest):
    try:
        return update_user_account(
            account_id,
            payload.name,
            payload.email,
            payload.password,
            payload.role,
            payload.access_level_id,
            payload.linked_driver_id,
            payload.assigned_driver_ids,
            payload.status,
            payload.must_change_password,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="An account with that email already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.delete("/user-accounts/{account_id}")
async def user_accounts_delete(account_id: str):
    try:
        delete_user_account(account_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    return {"ok": True}


@app.post("/user-accounts/{account_id}/approve")
async def user_accounts_approve(account_id: str, request: Request, payload: AccountActionRequest | None = None):
    pending_account = None
    try:
        settings = get_email_settings()
        if not email_settings_ready(settings):
            raise HTTPException(status_code=400, detail="Email settings are incomplete")
        pending_account = get_user_account(account_id)
        temporary_password = _generate_temporary_password()
        _send_approval_email(pending_account, temporary_password)
        record_email_delivery(
            category="approval",
            recipient_email=pending_account["email"],
            subject="Your DER UniPro account has been approved",
            status="sent",
            detail=f"Approval email sent via {_email_diagnostics(settings)['security']} {_email_diagnostics(settings)['host']}:{_email_diagnostics(settings)['port']}",
            actor_email=(payload.actor_email if payload else ""),
        )
        approved = approve_user_account(account_id, temporary_password)
        record_auth_audit_event(
            action_type="account_approved",
            email=approved["email"],
            actor_email=(payload.actor_email if payload else ""),
            role=approved.get("role", ""),
            user_account_id=approved["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="Approval email sent and temporary password issued.",
        )
        return {"ok": True, "account": approved}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    except Exception as exc:
        if pending_account:
            record_email_delivery(
                category="approval",
                recipient_email=pending_account.get("email", ""),
                subject="Your DER UniPro account has been approved",
                status="failed",
                detail=str(exc),
                actor_email=(payload.actor_email if payload else ""),
            )
            record_auth_audit_event(
                action_type="account_approved",
                email=pending_account.get("email", ""),
                actor_email=(payload.actor_email if payload else ""),
                role=pending_account.get("role", ""),
                user_account_id=pending_account.get("id", ""),
                success=False,
                ip_address=_client_ip(request),
                detail=str(exc),
            )
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/user-accounts/{account_id}/resend-approval")
async def user_accounts_resend_approval(account_id: str, request: Request, payload: AccountActionRequest | None = None):
    account = None
    try:
        settings = get_email_settings()
        if not email_settings_ready(settings):
            raise HTTPException(status_code=400, detail="Email settings are incomplete")
        account = get_user_account(account_id)
        temporary_password = _generate_temporary_password()
        _send_approval_email(account, temporary_password)
        record_email_delivery(
            category="approval_resend",
            recipient_email=account["email"],
            subject="Your DER UniPro account has been approved",
            status="sent",
            detail="Approval email resent with a fresh temporary password.",
            actor_email=(payload.actor_email if payload else ""),
        )
        refreshed = approve_user_account(account_id, temporary_password)
        record_auth_audit_event(
            action_type="approval_email_resent",
            email=refreshed["email"],
            actor_email=(payload.actor_email if payload else ""),
            role=refreshed.get("role", ""),
            user_account_id=refreshed["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="Approval email resent with a fresh temporary password.",
        )
        return {"ok": True, "account": refreshed}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    except Exception as exc:
        if account:
            record_email_delivery(
                category="approval_resend",
                recipient_email=account.get("email", ""),
                subject="Your DER UniPro account has been approved",
                status="failed",
                detail=str(exc),
                actor_email=(payload.actor_email if payload else ""),
            )
        record_auth_audit_event(
            action_type="approval_email_resent",
            email=account.get("email", "") if account else "",
            actor_email=(payload.actor_email if payload else ""),
            user_account_id=account_id,
            success=False,
            ip_address=_client_ip(request),
            detail=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/user-accounts/{account_id}/approve-manual")
async def user_accounts_approve_manual(account_id: str, request: Request, payload: AccountActionRequest | None = None):
    account = None
    try:
        account = get_user_account(account_id)
        temporary_password = _generate_temporary_password()
        approved = approve_user_account(account_id, temporary_password)
        record_auth_audit_event(
            action_type="account_approved_manual",
            email=approved["email"],
            actor_email=(payload.actor_email if payload else ""),
            role=approved.get("role", ""),
            user_account_id=approved["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="Account approved without email delivery.",
        )
        return {
            "ok": True,
            "account": approved,
            "temporary_password": temporary_password,
            "message": "Account approved without email. Share the temporary password securely.",
        }
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    except Exception as exc:
        record_auth_audit_event(
            action_type="account_approved_manual",
            email=account.get("email", "") if account else "",
            actor_email=(payload.actor_email if payload else ""),
            user_account_id=account_id,
            success=False,
            ip_address=_client_ip(request),
            detail=str(exc),
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/user-accounts/{account_id}/reject")
async def user_accounts_reject(account_id: str, request: Request, payload: AccountActionRequest | None = None):
    try:
        rejected = reject_user_account(account_id)
        record_auth_audit_event(
            action_type="account_rejected",
            email=rejected["email"],
            actor_email=(payload.actor_email if payload else ""),
            role=rejected.get("role", ""),
            user_account_id=rejected["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="Account registration rejected.",
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc
    return {"ok": True, "account": rejected}


@app.get("/tracks")
async def tracks_index():
    return {"tracks": list_tracks()}


@app.put("/tracks/{track_id}")
async def tracks_update(track_id: str, payload: TrackUpdateRequest):
    try:
        return update_track(
            track_id,
            payload.layout_notes,
            payload.coaching_focus,
            payload.corner_notes,
            [item.model_dump() for item in payload.corner_definitions],
            payload.corner_marker_offsets,
            payload.setup_notes,
            payload.preferred_setup_baseline,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Track not found") from exc


@app.get("/settings/app")
async def app_settings_show(user_account_id: str = "", email: str = "", role: str = ""):
    return {"settings": get_app_settings(user_account_id=user_account_id, email=email, role=role)}


@app.put("/settings/app")
async def app_settings_update(payload: AppSettingsRequest):
    try:
        settings = save_app_settings(
            payload.settings,
            user_account_id=payload.user_account_id,
            email=payload.email,
            role=payload.role,
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail="Settings scope not provided") from exc
    return {"settings": settings}


@app.get("/settings/email")
async def email_settings_show():
    return {"settings": get_email_settings()}


@app.put("/settings/email")
async def email_settings_update(payload: EmailSettingsRequest):
    return {"settings": save_email_settings(payload.settings)}


@app.post("/settings/email/test")
async def email_settings_test(payload: EmailSettingsTestRequest):
    settings = get_email_settings()
    if not email_settings_ready(settings):
        raise HTTPException(status_code=400, detail="Email settings are incomplete")
    diagnostics = _email_diagnostics(settings)
    try:
        send_email(
            settings,
            payload.to_email,
            "DER UniPro email test",
            "This is a test email from DER UniPro Coaching Platform.",
        )
        record_email_delivery(
            category="smtp_test",
            recipient_email=payload.to_email,
            subject="DER UniPro email test",
            status="sent",
            detail=f"SMTP test succeeded via {diagnostics['security']} {diagnostics['host']}:{diagnostics['port']}",
        )
    except Exception as exc:
        record_email_delivery(
            category="smtp_test",
            recipient_email=payload.to_email,
            subject="DER UniPro email test",
            status="failed",
            detail=f"{diagnostics['security']} {diagnostics['host']}:{diagnostics['port']} -> {exc}",
        )
        raise HTTPException(status_code=400, detail=f"SMTP test failed via {diagnostics['security']} {diagnostics['host']}:{diagnostics['port']}: {exc}") from exc
    return {"ok": True, "message": f"Test email sent to {payload.to_email}", "diagnostics": diagnostics}


@app.get("/kart-classes")
async def kart_classes_index():
    return {"classes": list_kart_classes()}


@app.get("/sessions")
async def sessions_index():
    return {"sessions": list_uploaded_sessions()}


@app.get("/sessions/{session_id}")
async def sessions_show(session_id: str):
    try:
        session = get_uploaded_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    if session.get("analysis"):
        track = next((item for item in list_tracks() if item["name"] == session["event_name"] or session["event_name"].lower() in [alias.lower() for alias in item.get("aliases", [])]), None)
        session["analysis"].setdefault("track_context", {
            "track_id": track.get("id") if track else "",
            "track_name": track.get("name") if track else session["event_name"],
            "corner_definitions": track.get("cornerDefinitions", []) if track else [],
        })
        session["analysis"]["corner_analysis"] = _build_corner_analysis(session["analysis"].get("drivers", []), track)
        session["analysis"]["sector_analysis"] = _build_sector_analysis(session["analysis"].get("drivers", []), track)
    planned_session = None
    snapshot_session = session.get("planned_session_snapshot") or {}
    if session.get("test_session_id"):
        try:
            planned_session = get_test_session(session["test_session_id"])
        except KeyError:
            planned_session = None
    setup_source = planned_session or snapshot_session
    if setup_source:
        planned_driver_map = {driver["id"]: driver for driver in setup_source.get("drivers", [])}
        for driver in session.get("analysis", {}).get("drivers", []):
            planned_driver = planned_driver_map.get(driver.get("driver_id"))
            if planned_driver:
                driver["setup"] = planned_driver.get("setup", {})
        if planned_session:
            session["planned_session"] = planned_session
        elif snapshot_session:
            session["planned_session"] = snapshot_session
    return {
        "session": session,
        "reports": list_generated_reports(session_id=session_id, include_reports=True),
        "presets": list_session_presets(session_id),
        "notes": list_coaching_notes(session_id),
    }


@app.delete("/sessions/{session_id}")
async def sessions_delete(session_id: str):
    try:
        delete_uploaded_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return {"ok": True, "session_id": session_id}


@app.post("/sessions/{session_id}/presets")
async def session_presets_create(session_id: str, payload: SessionPresetRequest):
    try:
        get_uploaded_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return {"preset": save_session_preset(session_id, payload.name, payload.preset)}


@app.delete("/sessions/{session_id}/presets/{preset_id}")
async def session_presets_delete(session_id: str, preset_id: str):
    try:
        delete_session_preset(preset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Preset not found") from exc
    return {"ok": True, "session_id": session_id}


@app.post("/sessions/{session_id}/notes")
async def session_notes_create(session_id: str, payload: CoachingNoteRequest):
    try:
        get_uploaded_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return {"note": save_coaching_note(session_id, payload.driver_id, payload.title, payload.body, payload.next_actions)}


@app.delete("/sessions/{session_id}/notes/{note_id}")
async def session_notes_delete(session_id: str, note_id: str):
    try:
        delete_coaching_note(note_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Note not found") from exc
    return {"ok": True, "session_id": session_id}


@app.get("/test-sessions")
async def test_sessions_index():
    return {"test_sessions": list_test_sessions()}


@app.get("/setup-database")
async def setup_database_index():
    return {"setup_database": list_setup_database()}


@app.get("/reports")
async def reports_index():
    return {"reports": list_generated_reports()}


@app.get("/drivers/{driver_id}/portal")
async def driver_portal(driver_id: str):
    try:
        return get_driver_portal(driver_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Driver not found") from exc


@app.get("/drivers/{driver_id}/timeline")
async def driver_timeline(driver_id: str):
    try:
        return get_driver_timeline(driver_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Driver not found") from exc


@app.get("/user-accounts/{account_id}/portal")
async def user_account_portal(account_id: str):
    try:
        return get_user_account_portal(account_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="User account not found") from exc


@app.post("/events")
async def events_create(payload: EventCreateRequest):
    return create_event(payload.venue, payload.name, payload.session_type, payload.start_date, payload.end_date, payload.driver_ids)


@app.post("/test-sessions")
async def test_sessions_create(payload: TestSessionCreateRequest):
        return create_test_session(
            payload.name,
            payload.venue,
            payload.session_type,
            payload.date,
            payload.start_time,
            payload.end_time,
            payload.event_id,
            payload.status,
        payload.weather,
        payload.track_condition,
        payload.tyre_condition,
        payload.mechanic_notes,
        payload.coach_notes,
        payload.driver_ids,
        {driver_id: setup.model_dump() for driver_id, setup in payload.driver_setups.items()},
    )


@app.get("/test-sessions/{test_session_id}")
async def test_sessions_show(test_session_id: str):
    try:
        return get_test_session(test_session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Test session not found") from exc


@app.put("/test-sessions/{test_session_id}")
async def test_sessions_update(test_session_id: str, payload: TestSessionCreateRequest):
    try:
        return update_test_session(
            test_session_id,
            payload.name,
            payload.venue,
            payload.session_type,
            payload.date,
            payload.start_time,
            payload.end_time,
            payload.event_id,
            payload.status,
            payload.weather,
            payload.track_condition,
            payload.tyre_condition,
            payload.mechanic_notes,
            payload.coach_notes,
            payload.driver_ids,
            {driver_id: setup.model_dump() for driver_id, setup in payload.driver_setups.items()},
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Test session not found") from exc


@app.post("/test-sessions/{test_session_id}/weather-refresh")
async def test_session_weather_refresh(test_session_id: str):
    try:
        session = get_test_session(test_session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Test session not found") from exc
    try:
        forecast = await fetch_weather_forecast(session.get("venue", ""), session.get("date", ""))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Weather provider request failed: {exc}") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    forecast["session_start_time"] = session.get("start_time", "")
    forecast["session_end_time"] = session.get("end_time", "")
    updated = update_test_session_weather_forecast(test_session_id, forecast)
    return {"test_session": updated, "forecast": forecast}


@app.delete("/test-sessions/{test_session_id}")
async def test_sessions_delete(test_session_id: str):
    try:
        delete_test_session(test_session_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Test session not found") from exc
    return {"ok": True, "test_session_id": test_session_id}


@app.put("/events/{event_id}")
async def events_update(event_id: str, payload: EventCreateRequest):
    try:
        return update_event(event_id, payload.venue, payload.name, payload.session_type, payload.start_date, payload.end_date, payload.driver_ids)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Event not found") from exc


@app.delete("/events/{event_id}")
async def events_delete(event_id: str):
    try:
        delete_event(event_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Event not found") from exc
    return {"ok": True}


@app.get("/ai/health")
async def ai_health(user_account_id: str = "", email: str = "", role: str = ""):
    return {
        "ollama": await ollama_health(),
        "openai": await openai_health(_resolve_openai_api_key(user_account_id=user_account_id, email=email, role=role)),
    }


@app.post("/ai/chat", response_model=ChatResponse)
async def ai_chat(payload: ChatRequest):
    retrieval_context = {
        "memories": [],
        "recent_sessions": [],
        "recent_reports": [],
        "recent_notes": [],
        "recent_planned_sessions": [],
        "recent_chat": [],
        "current_session": {},
    }
    try:
        from .ai import build_retrieval_context

        retrieval_context = build_retrieval_context(
            user_account_id=payload.user_account_id,
            email=payload.email,
            role=payload.role,
            session_id=payload.session_id,
            test_session_id=payload.test_session_id,
            selected_event_id=payload.selected_event_id,
            current_screen=payload.current_screen,
            use_retrieval=payload.use_retrieval,
            use_memory=payload.use_memory,
        )
        if payload.provider == "openai":
            reply = await chat_with_openai(
                payload.model,
                _resolve_openai_api_key(
                    user_account_id=payload.user_account_id,
                    email=payload.email,
                    role=payload.role,
                    api_key=payload.api_key,
                ),
                [message.model_dump() for message in payload.messages],
                retrieval_context,
            )
        else:
            reply = await chat_with_ollama(
                payload.model,
                [message.model_dump() for message in payload.messages],
                retrieval_context,
            )
        if payload.use_memory and (payload.user_account_id or payload.email):
            clear_ai_chat_messages(payload.user_account_id, payload.email, payload.role)
            append_ai_chat_messages(
                [*([message.model_dump() for message in payload.messages]), {"role": "assistant", "content": reply}],
                user_account_id=payload.user_account_id,
                email=payload.email,
                role=payload.role,
            )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            response_json = exc.response.json()
            detail = response_json.get("error", {}).get("message") or response_json.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except Exception as exc:
        detail = "OpenAI chat is unavailable" if payload.provider == "openai" else "Ollama chat is unavailable"
        raise HTTPException(status_code=502, detail=detail) from exc
    return ChatResponse(
        reply=reply,
        retrieved_items=sum(len(retrieval_context.get(key) or []) for key in ("recent_sessions", "recent_reports", "recent_notes", "recent_planned_sessions")),
        memory_items=len(retrieval_context.get("memories") or []),
    )


@app.get("/ai/memory")
async def ai_memory_list(user_account_id: str = "", email: str = "", role: str = ""):
    return {"memories": list_ai_memory_entries(user_account_id=user_account_id, email=email, role=role)}


@app.post("/ai/memory", response_model=AiMemoryResponse)
async def ai_memory_create(payload: AiMemoryRequest):
    try:
        memory = save_ai_memory_entry(
            payload.title,
            payload.content,
            payload.tags,
            payload.pinned,
            user_account_id=payload.user_account_id,
            email=payload.email,
            role=payload.role,
        )
    except KeyError as exc:
        raise HTTPException(status_code=400, detail="Memory scope not provided") from exc
    return AiMemoryResponse(**memory)


@app.delete("/ai/memory/{memory_id}")
async def ai_memory_delete(memory_id: str):
    try:
        delete_ai_memory_entry(memory_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Memory entry not found") from exc
    return {"ok": True}


@app.get("/ai/chat-history")
async def ai_chat_history(user_account_id: str = "", email: str = "", role: str = ""):
    return {"messages": list_ai_chat_messages(user_account_id=user_account_id, email=email, role=role)}


@app.post("/auth/login", response_model=LoginResponse)
async def auth_login(payload: LoginRequest, request: Request):
    account_by_email = get_user_account_by_email(payload.email)
    if account_by_email and account_by_email.get("status") == "pending":
        record_auth_audit_event(
            action_type="login",
            email=payload.email,
            role=account_by_email.get("role", ""),
            user_account_id=account_by_email.get("id", ""),
            success=False,
            ip_address=_client_ip(request),
            detail="Account pending administrator approval.",
        )
        raise HTTPException(status_code=403, detail="This account is pending administrator approval")
    if account_by_email and account_by_email.get("status") == "rejected":
        record_auth_audit_event(
            action_type="login",
            email=payload.email,
            role=account_by_email.get("role", ""),
            user_account_id=account_by_email.get("id", ""),
            success=False,
            ip_address=_client_ip(request),
            detail="Account registration rejected.",
        )
        raise HTTPException(status_code=403, detail="This account registration was rejected. Contact an administrator")
    account = get_user_account_by_credentials(payload.email, payload.password)
    if account:
        assigned_driver_ids = [driver["id"] for driver in account.get("assigned_drivers", [])]
        record_auth_audit_event(
            action_type="login",
            email=account["email"],
            role=account.get("role", ""),
            user_account_id=account["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="User account login successful.",
        )
        return LoginResponse(
            name=account["name"],
            email=account["email"],
            role=account["role"],
            driver_id=account.get("linked_driver_id") or None,
            user_account_id=account["id"],
            permissions=account.get("permissions") or {},
            assigned_driver_ids=assigned_driver_ids,
            must_change_password=bool(account.get("must_change_password")),
            account_status=account.get("status") or "approved",
        )
    driver = get_driver_by_credentials(payload.email, payload.password)
    if driver:
        record_auth_audit_event(
            action_type="login",
            email=driver["email"],
            role="driver",
            driver_id=driver["id"],
            success=True,
            ip_address=_client_ip(request),
            detail="Driver login successful.",
        )
        return LoginResponse(
            name=driver["name"],
            email=driver["email"],
            role="driver",
            driver_id=driver["id"],
            permissions={"view_sessions": True, "view_feedback": True, "view_history": True},
            assigned_driver_ids=[driver["id"]],
            must_change_password=False,
            account_status="approved",
        )
    record_auth_audit_event(
        action_type="login",
        email=payload.email,
        success=False,
        ip_address=_client_ip(request),
        detail="Invalid credentials.",
    )
    raise HTTPException(status_code=401, detail="Invalid credentials")


@app.post("/auth/register", response_model=RegistrationResponse)
async def auth_register(payload: RegisterRequest, request: Request):
    existing = get_user_account_by_email(payload.email)
    if existing:
        raise HTTPException(status_code=400, detail="An account with that email already exists")
    try:
        create_registration_account(
            payload.name,
            payload.email,
            payload.role,
            payload.linked_driver_id,
            payload.assigned_driver_ids,
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=400, detail="An account with that email already exists") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_auth_audit_event(
        action_type="registration_submitted",
        email=payload.email,
        actor_email=payload.email,
        role=payload.role,
        success=True,
        ip_address=_client_ip(request),
        detail="Registration submitted and waiting approval.",
    )
    return RegistrationResponse(
        ok=True,
        message="Registration submitted. An administrator must approve the account before you can sign in.",
    )


@app.post("/auth/password-change", response_model=PasswordResetResponse)
async def auth_password_change(payload: PasswordChangeRequest, request: Request):
    if len(payload.password.strip()) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    account = change_user_account_password(payload.email, payload.current_password, payload.password)
    if not account:
        record_auth_audit_event(
            action_type="password_change",
            email=payload.email,
            success=False,
            ip_address=_client_ip(request),
            detail="Current password is incorrect.",
        )
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    record_auth_audit_event(
        action_type="password_change",
        email=account["email"],
        role=account.get("role", ""),
        user_account_id=account["id"],
        success=True,
        ip_address=_client_ip(request),
        detail="Password changed successfully.",
    )
    return PasswordResetResponse(ok=True, message="Password updated successfully. You can now continue into the app.")


@app.post("/auth/password-reset/request", response_model=PasswordResetResponse)
async def auth_password_reset_request(payload: PasswordResetRequest, request: Request):
    response = create_password_reset_token(payload.email)
    if response.get("reset_token"):
        try:
            _send_password_reset_email(payload.email.strip().lower(), response["reset_token"])
            response["message"] = "If that email exists in the platform, a reset email has been sent."
            response["reset_token"] = None
            record_email_delivery(
                category="password_reset",
                recipient_email=payload.email,
                subject="DER UniPro password reset",
                status="sent",
                detail="Password reset email sent.",
            )
        except Exception as exc:
            record_email_delivery(
                category="password_reset",
                recipient_email=payload.email,
                subject="DER UniPro password reset",
                status="failed",
                detail=str(exc),
            )
            record_auth_audit_event(
                action_type="password_reset_requested",
                email=payload.email,
                success=False,
                ip_address=_client_ip(request),
                detail=str(exc),
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    record_auth_audit_event(
        action_type="password_reset_requested",
        email=payload.email,
        success=True,
        ip_address=_client_ip(request),
        detail="Password reset requested.",
    )
    return PasswordResetResponse(**response)


@app.post("/auth/password-reset/confirm", response_model=PasswordResetResponse)
async def auth_password_reset_confirm(payload: PasswordResetConfirmRequest, request: Request):
    if len(payload.password.strip()) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters long")
    try:
        reset_password_with_token(payload.token, payload.password)
    except KeyError as exc:
        record_auth_audit_event(
            action_type="password_reset_confirmed",
            success=False,
            ip_address=_client_ip(request),
            detail=str(exc.args[0] if exc.args else "invalid_reset_token"),
        )
        reason = exc.args[0] if exc.args else "invalid_reset_token"
        if reason == "expired_reset_token":
            raise HTTPException(status_code=400, detail="This reset token has expired") from exc
        if reason == "used_reset_token":
            raise HTTPException(status_code=400, detail="This reset token has already been used") from exc
        raise HTTPException(status_code=400, detail="Invalid reset token") from exc
    record_auth_audit_event(
        action_type="password_reset_confirmed",
        success=True,
        ip_address=_client_ip(request),
        detail="Password reset completed.",
    )
    return PasswordResetResponse(
        ok=True,
        message="Password updated successfully. You can now sign in with the new password.",
    )


@app.post("/sessions/upload")
async def upload_sessions(
    files: list[UploadFile] = File(...),
    driver_ids: list[str] = Form([]),
    event_name: str = Form(...),
    event_round: str = Form(...),
    session_type: str = Form(...),
    test_session_id: str | None = Form(None),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files were uploaded.")
    uploaded_files = []
    parsed = []
    driver_id_map = [driver_id for driver_id in driver_ids]
    try:
        for index, file in enumerate(files):
            file_name = file.filename or "session.tsv"
            content = await file.read()
            if not content:
                raise HTTPException(status_code=400, detail=f"{file_name} is empty.")
            parsed_session = parse_tsv_file(file_name, content)
            if not parsed_session.headers:
                raise HTTPException(status_code=400, detail=f"{file_name} does not contain a readable UniPro TSV header row.")
            if not parsed_session.rows:
                raise HTTPException(status_code=400, detail=f"{file_name} does not contain any telemetry rows.")
            assigned_driver_id = driver_id_map[index] if index < len(driver_id_map) else ""
            if assigned_driver_id:
                try:
                    assigned_driver = get_driver(assigned_driver_id)
                except KeyError:
                    assigned_driver = None
                if assigned_driver:
                    parsed_session.driver_name = assigned_driver["name"]
                    parsed_session.metadata["uploaded_driver_id"] = assigned_driver_id
                    parsed_session.metadata["declared_driver_name"] = assigned_driver["name"]
            uploaded_files.append(
                {
                    "file_name": file_name,
                    "driver_id": assigned_driver_id,
                    "driver_name": parsed_session.metadata.get("declared_driver_name") or parsed_session.driver_name,
                }
            )
            parsed.append(parsed_session)
        analysis = build_analysis(parsed, event_name=event_name, event_round=event_round, session_type=session_type)
        _apply_driver_matching(analysis)
        validation = {}
        if test_session_id:
            try:
                planned_session = get_test_session_snapshot(test_session_id)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail="Test session not found") from exc
            expected_drivers = planned_session["drivers"]
            expected_driver_id_set = {item["id"] for item in expected_drivers}
            matched_driver_ids = {driver.get("driver_id") for driver in analysis["drivers"] if driver.get("driver_id")}
            expected_driver_names = sorted(driver["name"] for driver in expected_drivers)
            uploaded_driver_names = sorted(str(driver.get("driver_name") or "Unknown driver") for driver in analysis["drivers"])
            missing_drivers = [driver["name"] for driver in expected_drivers if driver["id"] not in matched_driver_ids]
            unplanned_drivers = [
                driver.get("canonical_driver_name") or driver.get("driver_name") or "Unknown driver"
                for driver in analysis["drivers"]
                if not driver.get("driver_id") or driver["driver_id"] not in expected_driver_id_set
            ]
            validation = {
                "test_session_id": test_session_id,
                "test_session_name": planned_session["name"],
                "expected_drivers": expected_driver_names,
                "uploaded_drivers": uploaded_driver_names,
                "missing_drivers": missing_drivers,
                "unplanned_drivers": unplanned_drivers,
                "driver_matches": [
                    {
                        "uploaded_name": driver.get("driver_name") or "Unknown driver",
                        "matched_name": driver.get("canonical_driver_name"),
                        "matched_by": driver.get("match_source"),
                    }
                    for driver in analysis["drivers"]
                ],
                "matched": not missing_drivers and not unplanned_drivers,
            }
        session_id = save_uploaded_session(event_name, event_round, session_type, analysis, test_session_id=test_session_id, validation=validation, uploaded_files=uploaded_files)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Upload failed while processing the selected UniPro files: {exc}") from exc
    analysis["session_id"] = session_id
    analysis["validation"] = validation
    analysis["uploaded_files"] = uploaded_files
    return analysis


@app.post("/ai/feedback", response_model=FeedbackResponse)
async def ai_feedback(payload: FeedbackRequest):
    try:
        reports = await generate_feedback(
            provider=payload.provider,
            model=payload.model,
            api_key=_resolve_openai_api_key(
                user_account_id=payload.user_account_id,
                email=payload.email,
                role=payload.role,
                api_key=payload.api_key,
            ),
            analysis=payload.analysis,
            audience=payload.audience,
            user_account_id=payload.user_account_id,
            email=payload.email,
            role=payload.role,
            test_session_id=payload.test_session_id,
            use_retrieval=payload.use_retrieval,
            use_memory=payload.use_memory,
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            response_json = exc.response.json()
            detail = response_json.get("error", {}).get("message") or response_json.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    save_generated_report(payload.analysis.get("session_id"), payload.audience, payload.provider, payload.model, reports)
    return FeedbackResponse(reports=reports)


@app.put("/sessions/{session_id}/status")
async def session_status_update(session_id: str, payload: SessionStatusRequest):
    try:
        session = update_uploaded_session_status(session_id, payload.status)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    return {"session": session}


@app.put("/reports/{report_id}/publish")
async def report_publish_update(report_id: str, payload: ReportPublishRequest):
    try:
        report = update_generated_report_publish_state(
            report_id,
            payload.status,
            payload.visible_to_driver,
            payload.visible_to_parent,
            payload.review_note,
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Report not found") from exc
    return {"report": report}


@app.get("/audit/auth")
async def audit_auth(limit: int = 100):
    return {"entries": list_auth_audit_log(limit=limit)}


@app.get("/email/delivery")
async def email_delivery(limit: int = 50):
    return {"deliveries": list_email_delivery_log(limit=limit)}


@app.post("/operations/backups", response_model=BackupCreateResponse)
async def operations_create_backup():
    return BackupCreateResponse(**create_database_backup())


@app.get("/operations/backups")
async def operations_list_backups():
    return {"backups": list_database_backups()}


@app.get("/operations/export")
async def operations_export():
    return JSONResponse(content=export_operational_data())


@app.get("/operations/restore-guidance")
async def operations_restore_guidance():
    return get_restore_guidance()


@app.get("/operations/health")
async def operations_health(user_account_id: str = "", email: str = "", role: str = ""):
    return {
        "generated_at": datetime.now().isoformat(),
        "database": get_database_health(),
        "smtp": {
            "ready": email_settings_ready(get_email_settings()),
            "settings": _email_diagnostics(get_email_settings()),
            "last_delivery": (list_email_delivery_log(limit=1) or [{}])[0],
        },
        "ai": {
            "ollama": await ollama_health(),
            "openai": await openai_health(_resolve_openai_api_key(user_account_id=user_account_id, email=email, role=role)),
        },
    }


@app.post("/reports/pdf")
async def build_pdf(payload: FeedbackRequest):
    try:
        reports = await generate_feedback(
            provider=payload.provider,
            model=payload.model,
            api_key=_resolve_openai_api_key(
                user_account_id=payload.user_account_id,
                email=payload.email,
                role=payload.role,
                api_key=payload.api_key,
            ),
            analysis=payload.analysis,
            audience=payload.audience,
            user_account_id=payload.user_account_id,
            email=payload.email,
            role=payload.role,
            test_session_id=payload.test_session_id,
            use_retrieval=payload.use_retrieval,
            use_memory=payload.use_memory,
        )
    except httpx.HTTPStatusError as exc:
        detail = exc.response.text
        try:
            response_json = exc.response.json()
            detail = response_json.get("error", {}).get("message") or response_json.get("detail") or detail
        except Exception:
            pass
        raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 50
    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(40, y, "UniPro Session Debrief")
    y -= 30

    for report in reports:
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(40, y, report["driver_name"])
        y -= 18
        pdf.setFont("Helvetica", 10)
        pdf.drawString(40, y, report["overall_summary"][:110])
        y -= 18
        for action in report["action_points"][:3]:
            pdf.drawString(55, y, f"- {action[:100]}")
            y -= 14
        y -= 8
        if y < 120:
            pdf.showPage()
            y = height - 50

    pdf.save()
    buffer.seek(0)
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=session-report.pdf"})


def _apply_driver_matching(analysis: dict) -> None:
    for driver in analysis.get("drivers", []):
        if driver.get("uploaded_for_driver_id"):
            try:
                matched_driver = get_driver(driver["uploaded_for_driver_id"])
            except KeyError:
                matched_driver = None
            if matched_driver:
                driver["driver_id"] = matched_driver["id"]
                driver["canonical_driver_name"] = matched_driver["name"]
                driver["match_source"] = "assigned upload"
                continue
        match = match_driver_name(driver.get("driver_name", ""))
        if match:
            driver["driver_id"] = match["driver"]["id"]
            driver["canonical_driver_name"] = match["driver"]["name"]
            driver["match_source"] = match["matched_by"]
        else:
            driver["driver_id"] = None
            driver["canonical_driver_name"] = driver.get("driver_name")
            driver["match_source"] = None
