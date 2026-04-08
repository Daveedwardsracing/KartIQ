from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from .class_seed import CLASS_SEED
from .track_seed import TRACK_SEED


DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATABASE_PATH = DATA_DIR / "app.db"
LEGACY_STORE_PATH = DATA_DIR / "store.json"
BACKUP_DIR = DATA_DIR / "backups"
KART_SETUP_FIELDS = (
    "front_sprocket",
    "rear_sprocket",
    "carb_jet",
    "axle_length",
    "axle_type",
    "tyre_type",
    "front_tyre_pressure",
    "rear_tyre_pressure",
    "torsion_bar_type",
    "caster_type",
    "ride_height",
)
PLANNED_SESSION_STATUS_OPTIONS = ("planned", "setup_complete", "uploaded", "analysed", "reviewed")
PASSWORD_HASH_PREFIX = "pbkdf2_sha256"
PASSWORD_HASH_ITERATIONS = 260000


def _password_is_hashed(value: str) -> bool:
    return str(value or "").startswith(f"{PASSWORD_HASH_PREFIX}$")


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hash_password(password: str) -> str:
    if not password:
        return ""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_HASH_ITERATIONS)
    return f"{PASSWORD_HASH_PREFIX}${PASSWORD_HASH_ITERATIONS}${base64.b64encode(salt).decode('ascii')}${base64.b64encode(digest).decode('ascii')}"


def _verify_password(password: str, stored_value: str) -> bool:
    if not stored_value:
        return False
    if not _password_is_hashed(stored_value):
        return hmac.compare_digest(stored_value, password)
    try:
        _, iterations, salt_b64, digest_b64 = stored_value.split("$", 3)
        salt = base64.b64decode(salt_b64.encode("ascii"))
        expected = base64.b64decode(digest_b64.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
    except Exception:
        return False
    return hmac.compare_digest(actual, expected)


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _assert_email_available(connection: sqlite3.Connection, email: str, identity_type: str, current_id: str = "") -> None:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        return

    driver_row = connection.execute(
        "SELECT id FROM drivers WHERE lower(email) = ?",
        (normalized_email,),
    ).fetchone()
    user_row = connection.execute(
        "SELECT id FROM user_accounts WHERE lower(email) = ?",
        (normalized_email,),
    ).fetchone()

    if identity_type == "driver":
        if driver_row is not None and driver_row["id"] != current_id:
            raise ValueError("An account with that email already exists")
        if user_row is not None:
            raise ValueError("An account with that email already exists")
        return

    if identity_type == "user_account":
        if user_row is not None and user_row["id"] != current_id:
            raise ValueError("An account with that email already exists")
        if driver_row is not None and driver_row["id"] != current_id:
            raise ValueError("An account with that email already exists")
        return


def init_database() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS drivers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                number TEXT NOT NULL DEFAULT '',
                class_name TEXT NOT NULL DEFAULT '',
                aliases_json TEXT NOT NULL DEFAULT '[]',
                email TEXT NOT NULL DEFAULT '',
                password TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS kart_classes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                venue TEXT NOT NULL,
                name TEXT NOT NULL,
                session_type TEXT NOT NULL,
                date TEXT NOT NULL DEFAULT '',
                start_date TEXT NOT NULL DEFAULT '',
                end_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS event_drivers (
                event_id TEXT NOT NULL,
                driver_id TEXT NOT NULL,
                PRIMARY KEY (event_id, driver_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS test_sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                venue TEXT NOT NULL,
                session_type TEXT NOT NULL,
                date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS test_session_drivers (
                test_session_id TEXT NOT NULL,
                driver_id TEXT NOT NULL,
                PRIMARY KEY (test_session_id, driver_id)
            )
            """
        )
        _ensure_column(connection, "test_session_drivers", "setup_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(connection, "test_session_drivers", "front_sprocket", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "rear_sprocket", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "carb_jet", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "axle_length", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "axle_type", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "tyre_type", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "front_tyre_pressure", "REAL")
        _ensure_column(connection, "test_session_drivers", "rear_tyre_pressure", "REAL")
        _ensure_column(connection, "test_session_drivers", "torsion_bar_type", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "caster_type", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_session_drivers", "ride_height", "TEXT NOT NULL DEFAULT ''")
        _migrate_test_session_setup_json(connection)
        _ensure_column(connection, "test_sessions", "event_id", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "status", "TEXT NOT NULL DEFAULT 'planned'")
        _ensure_column(connection, "test_sessions", "start_time", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "end_time", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "weather", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "track_condition", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "tyre_condition", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "weather_forecast_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(connection, "test_sessions", "mechanic_notes", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "test_sessions", "coach_notes", "TEXT NOT NULL DEFAULT ''")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS access_levels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                permissions_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_accounts (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL,
                access_level_id TEXT,
                linked_driver_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        _ensure_column(connection, "user_accounts", "status", "TEXT NOT NULL DEFAULT 'approved'")
        _ensure_column(connection, "user_accounts", "must_change_password", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(connection, "user_accounts", "approved_at", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "user_accounts", "temporary_password", "INTEGER NOT NULL DEFAULT 0")
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_account_drivers (
                user_account_id TEXT NOT NULL,
                driver_id TEXT NOT NULL,
                PRIMARY KEY (user_account_id, driver_id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                id TEXT PRIMARY KEY,
                scope_type TEXT NOT NULL,
                scope_key TEXT NOT NULL UNIQUE,
                settings_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                id TEXT PRIMARY KEY,
                identity_type TEXT NOT NULL,
                identity_id TEXT NOT NULL,
                email TEXT NOT NULL,
                token TEXT NOT NULL UNIQUE,
                expires_at TEXT NOT NULL,
                used_at TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS auth_audit_log (
                id TEXT PRIMARY KEY,
                action_type TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                actor_email TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL DEFAULT '',
                user_account_id TEXT NOT NULL DEFAULT '',
                driver_id TEXT NOT NULL DEFAULT '',
                success INTEGER NOT NULL DEFAULT 1,
                ip_address TEXT NOT NULL DEFAULT '',
                detail TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS email_delivery_log (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL DEFAULT '',
                recipient_email TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending',
                detail TEXT NOT NULL DEFAULT '',
                actor_email TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_memory_entries (
                id TEXT PRIMARY KEY,
                scope_type TEXT NOT NULL,
                scope_key TEXT NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                tags_json TEXT NOT NULL DEFAULT '[]',
                pinned INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS ai_chat_messages (
                id TEXT PRIMARY KEY,
                scope_type TEXT NOT NULL,
                scope_key TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                venue TEXT NOT NULL,
                postcode TEXT NOT NULL DEFAULT '',
                address_json TEXT NOT NULL,
                google_query TEXT NOT NULL,
                official_url TEXT NOT NULL DEFAULT '',
                source_urls_json TEXT NOT NULL,
                layout_notes TEXT NOT NULL DEFAULT '',
                coaching_focus_json TEXT NOT NULL,
                corner_notes_json TEXT NOT NULL,
                setup_notes_json TEXT NOT NULL DEFAULT '[]',
                preferred_setup_baseline_json TEXT NOT NULL DEFAULT '{}',
                corner_marker_offsets_json TEXT NOT NULL DEFAULT '{}',
                corner_definitions_json TEXT NOT NULL DEFAULT '[]',
                aliases_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS uploaded_sessions (
                id TEXT PRIMARY KEY,
                event_name TEXT NOT NULL,
                event_round TEXT NOT NULL,
                session_type TEXT NOT NULL,
                driver_count INTEGER NOT NULL DEFAULT 0,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS generated_reports (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                audience TEXT NOT NULL,
                provider TEXT NOT NULL,
                model TEXT NOT NULL,
                reports_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS session_presets (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                name TEXT NOT NULL,
                preset_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS coaching_notes (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                driver_id TEXT NOT NULL DEFAULT '',
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                next_actions_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        _ensure_column(connection, "uploaded_sessions", "test_session_id", "TEXT")
        _ensure_column(connection, "uploaded_sessions", "planned_session_snapshot_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(connection, "uploaded_sessions", "validation_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(connection, "uploaded_sessions", "status", "TEXT NOT NULL DEFAULT 'uploaded'")
        _ensure_column(connection, "uploaded_sessions", "uploaded_files_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "drivers", "aliases_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "drivers", "email", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "drivers", "password", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "events", "start_date", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "events", "end_date", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "generated_reports", "status", "TEXT NOT NULL DEFAULT 'draft'")
        _ensure_column(connection, "generated_reports", "visible_to_driver", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(connection, "generated_reports", "visible_to_parent", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(connection, "generated_reports", "review_note", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(connection, "generated_reports", "reviewed_at", "TEXT")
        _ensure_column(connection, "generated_reports", "published_at", "TEXT")
        _ensure_column(connection, "tracks", "corner_definitions_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "tracks", "corner_marker_offsets_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(connection, "tracks", "setup_notes_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(connection, "tracks", "preferred_setup_baseline_json", "TEXT NOT NULL DEFAULT '{}'")
        connection.execute(
            """
            UPDATE events
            SET start_date = CASE WHEN start_date = '' THEN date ELSE start_date END,
                end_date = CASE WHEN end_date = '' THEN date ELSE end_date END
            """
        )
        connection.execute(
            """
            UPDATE uploaded_sessions
            SET status = CASE
                WHEN status = '' THEN 'uploaded'
                ELSE status
            END
            """
        )
        connection.execute(
            """
            UPDATE generated_reports
            SET status = CASE WHEN status = '' THEN 'draft' ELSE status END
            """
        )
        track_rows = connection.execute(
            "SELECT id, name, corner_notes_json, corner_definitions_json FROM tracks"
        ).fetchall()
        for row in track_rows:
            if row["name"] == "PF International":
                seeded_track = next((item for item in TRACK_SEED if item["id"] == row["id"]), None)
                if seeded_track and seeded_track.get("corner_definitions_json"):
                    connection.execute(
                        "UPDATE tracks SET corner_definitions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                        (seeded_track["corner_definitions_json"], row["id"]),
                    )
                    continue
            if row["corner_definitions_json"] and row["corner_definitions_json"] != "[]":
                continue
            corner_notes = json.loads(row["corner_notes_json"] or "[]")
            corner_definitions = [
                {
                    "name": f"Corner {index + 1}",
                    "sequence": index + 1,
                    "section_type": "",
                    "note": note,
                }
                for index, note in enumerate(corner_notes)
            ]
            connection.execute(
                "UPDATE tracks SET corner_definitions_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(corner_definitions), row["id"]),
            )
    _migrate_legacy_store()
    _seed_kart_classes()
    _seed_tracks()
    _seed_access_levels()


def list_drivers() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, name, number, class_name, aliases_json, email FROM drivers ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [_driver_row(row) for row in rows]


def list_events() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, venue, name, session_type, date, start_date, end_date FROM events ORDER BY start_date DESC, name COLLATE NOCASE"
        ).fetchall()
    return [get_event(row["id"]) for row in rows]


def list_kart_classes() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, name FROM kart_classes ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [{"id": row["id"], "name": row["name"]} for row in rows]


def list_access_levels() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            "SELECT id, name, permissions_json FROM access_levels ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [_access_level_row(row) for row in rows]


def create_access_level(name: str, permissions: dict[str, bool]) -> dict:
    access_level = {
        "id": f"acl-{uuid4().hex[:8]}",
        "name": name.strip(),
        "permissions": permissions or {},
    }
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO access_levels (id, name, permissions_json)
            VALUES (?, ?, ?)
            """,
            (access_level["id"], access_level["name"], json.dumps(access_level["permissions"])),
        )
    return access_level


def update_access_level(access_level_id: str, name: str, permissions: dict[str, bool]) -> dict:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE access_levels
            SET name = ?, permissions_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (name.strip(), json.dumps(permissions or {}), access_level_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(access_level_id)
        row = connection.execute(
            "SELECT id, name, permissions_json FROM access_levels WHERE id = ?",
            (access_level_id,),
        ).fetchone()
    return _access_level_row(row)


def list_user_accounts() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT ua.id, ua.name, ua.email, ua.role, ua.access_level_id, ua.linked_driver_id,
                   ua.status, ua.must_change_password, ua.approved_at, ua.temporary_password,
                   al.name AS access_level_name, al.permissions_json
            FROM user_accounts ua
            LEFT JOIN access_levels al ON al.id = ua.access_level_id
            ORDER BY ua.role, ua.name COLLATE NOCASE
            """
        ).fetchall()
    return [_user_account_row(row) for row in rows]


def create_user_account(
    name: str,
    email: str,
    password: str,
    role: str,
    access_level_id: str,
    linked_driver_id: str,
    assigned_driver_ids: list[str],
    status: str = "approved",
    must_change_password: bool = False,
    temporary_password: bool = False,
) -> dict:
    account_id = f"usr-{uuid4().hex[:8]}"
    normalized_email = _normalize_email(email)
    with _connect() as connection:
        _assert_email_available(connection, normalized_email, "user_account")
        connection.execute(
            """
            INSERT INTO user_accounts (id, name, email, password, role, access_level_id, linked_driver_id, status, must_change_password, approved_at, temporary_password)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                account_id,
                name.strip(),
                normalized_email,
                _hash_password(password.strip()) if password.strip() else "",
                role,
                access_level_id or None,
                linked_driver_id,
                status,
                1 if must_change_password else 0,
                datetime.now(timezone.utc).isoformat() if status == "approved" else "",
                1 if temporary_password else 0,
            ),
        )
        _sync_user_account_drivers(connection, account_id, assigned_driver_ids)
    return get_user_account(account_id)


def update_user_account(
    account_id: str,
    name: str,
    email: str,
    password: str,
    role: str,
    access_level_id: str,
    linked_driver_id: str,
    assigned_driver_ids: list[str],
    status: str = "approved",
    must_change_password: bool = False,
) -> dict:
    normalized_email = _normalize_email(email)
    with _connect() as connection:
        _assert_email_available(connection, normalized_email, "user_account", account_id)
        if password.strip():
            cursor = connection.execute(
                """
                UPDATE user_accounts
                SET name = ?, email = ?, password = ?, role = ?, access_level_id = ?, linked_driver_id = ?, status = ?, must_change_password = ?, temporary_password = ?, approved_at = CASE WHEN ? = 'approved' AND approved_at = '' THEN ? ELSE approved_at END, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    name.strip(),
                    normalized_email,
                    _hash_password(password.strip()),
                    role,
                    access_level_id or None,
                    linked_driver_id,
                    status,
                    1 if must_change_password else 0,
                    1 if must_change_password else 0,
                    status,
                    datetime.now(timezone.utc).isoformat(),
                    account_id,
                ),
            )
        else:
            cursor = connection.execute(
                """
                UPDATE user_accounts
                SET name = ?, email = ?, role = ?, access_level_id = ?, linked_driver_id = ?, status = ?, must_change_password = ?, approved_at = CASE WHEN ? = 'approved' AND approved_at = '' THEN ? ELSE approved_at END, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    name.strip(),
                    normalized_email,
                    role,
                    access_level_id or None,
                    linked_driver_id,
                    status,
                    1 if must_change_password else 0,
                    status,
                    datetime.now(timezone.utc).isoformat(),
                    account_id,
                ),
            )
        if cursor.rowcount == 0:
            raise KeyError(account_id)
        _sync_user_account_drivers(connection, account_id, assigned_driver_ids)
    return get_user_account(account_id)


def delete_user_account(account_id: str) -> None:
    with _connect() as connection:
        connection.execute(
            "DELETE FROM app_settings WHERE scope_type = 'user_account' AND scope_key = ?",
            (account_id,),
        )
        connection.execute("DELETE FROM user_account_drivers WHERE user_account_id = ?", (account_id,))
        cursor = connection.execute("DELETE FROM user_accounts WHERE id = ?", (account_id,))
        if cursor.rowcount == 0:
            raise KeyError(account_id)


def get_app_settings(user_account_id: str = "", email: str = "", role: str = "") -> dict:
    return _get_app_settings(user_account_id=user_account_id, email=email, role=role, include_secrets=False)


def _get_app_settings(user_account_id: str = "", email: str = "", role: str = "", include_secrets: bool = False) -> dict:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        return {}
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT settings_json
            FROM app_settings
            WHERE scope_type = ? AND scope_key = ?
            """,
            (scope_type, scope_key),
        ).fetchone()
    if row is None:
        return {}
    settings = json.loads(row["settings_json"] or "{}")
    if include_secrets:
        return settings
    return _sanitize_app_settings(settings)


def save_app_settings(settings: dict, user_account_id: str = "", email: str = "", role: str = "") -> dict:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        raise KeyError("settings_scope")
    with _connect() as connection:
        existing = connection.execute(
            """
            SELECT id, settings_json
            FROM app_settings
            WHERE scope_type = ? AND scope_key = ?
            """,
            (scope_type, scope_key),
        ).fetchone()
        next_settings = dict(settings or {})
        current_settings = json.loads(existing["settings_json"] or "{}") if existing and existing["settings_json"] else {}
        incoming_openai_key = str(next_settings.get("openAiApiKey", "") or "").strip()
        existing_openai_key = str(current_settings.get("openAiApiKey", "") or "").strip()
        if incoming_openai_key:
            next_settings["openAiApiKey"] = incoming_openai_key
        elif existing_openai_key:
            next_settings["openAiApiKey"] = existing_openai_key
        else:
            next_settings.pop("openAiApiKey", None)
        next_settings.pop("openAiApiKeyConfigured", None)
        payload = json.dumps(next_settings)
        if existing is None:
            connection.execute(
                """
                INSERT INTO app_settings (id, scope_type, scope_key, settings_json)
                VALUES (?, ?, ?, ?)
                """,
                (f"set-{uuid4().hex[:8]}", scope_type, scope_key, payload),
            )
        else:
            connection.execute(
                """
                UPDATE app_settings
                SET settings_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (payload, existing["id"]),
            )
    return get_app_settings(user_account_id=user_account_id, email=email, role=role)


def get_app_settings_with_secrets(user_account_id: str = "", email: str = "", role: str = "") -> dict:
    return _get_app_settings(user_account_id=user_account_id, email=email, role=role, include_secrets=True)


def _sanitize_app_settings(settings: dict) -> dict:
    sanitized = dict(settings or {})
    configured = bool(str(sanitized.get("openAiApiKey", "") or "").strip())
    sanitized["openAiApiKeyConfigured"] = configured
    sanitized["openAiApiKey"] = ""
    return sanitized


def get_email_settings() -> dict:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT settings_json
            FROM app_settings
            WHERE scope_type = 'system' AND scope_key = 'email_settings'
            """
        ).fetchone()
    if row is None:
        return {}
    return json.loads(row["settings_json"] or "{}")


def save_email_settings(settings: dict) -> dict:
    with _connect() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM app_settings
            WHERE scope_type = 'system' AND scope_key = 'email_settings'
            """
        ).fetchone()
        payload = json.dumps(settings or {})
        if existing is None:
            connection.execute(
                """
                INSERT INTO app_settings (id, scope_type, scope_key, settings_json)
                VALUES (?, 'system', 'email_settings', ?)
                """,
                (f"set-{uuid4().hex[:8]}", payload),
            )
        else:
            connection.execute(
                """
                UPDATE app_settings
                SET settings_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (payload, existing["id"]),
            )
    return get_email_settings()


def record_auth_audit_event(
    action_type: str,
    email: str = "",
    actor_email: str = "",
    role: str = "",
    user_account_id: str = "",
    driver_id: str = "",
    success: bool = True,
    ip_address: str = "",
    detail: str = "",
) -> dict:
    audit_id = f"aud-{uuid4().hex[:10]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO auth_audit_log (
                id,
                action_type,
                email,
                actor_email,
                role,
                user_account_id,
                driver_id,
                success,
                ip_address,
                detail
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                audit_id,
                str(action_type or "").strip(),
                _normalize_email(email) if email else "",
                _normalize_email(actor_email) if actor_email else "",
                str(role or "").strip().lower(),
                str(user_account_id or "").strip(),
                str(driver_id or "").strip(),
                int(bool(success)),
                str(ip_address or "").strip(),
                str(detail or "").strip(),
            ),
        )
    return list_auth_audit_log(limit=1)[0]


def list_auth_audit_log(limit: int = 100) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, action_type, email, actor_email, role, user_account_id, driver_id, success, ip_address, detail, created_at
            FROM auth_audit_log
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (max(1, min(int(limit or 100), 500)),),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "action_type": row["action_type"],
            "email": row["email"] or "",
            "actor_email": row["actor_email"] or "",
            "role": row["role"] or "",
            "user_account_id": row["user_account_id"] or "",
            "driver_id": row["driver_id"] or "",
            "success": bool(row["success"]),
            "ip_address": row["ip_address"] or "",
            "detail": row["detail"] or "",
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def record_email_delivery(
    category: str,
    recipient_email: str,
    subject: str,
    status: str,
    detail: str = "",
    actor_email: str = "",
) -> dict:
    email_id = f"eml-{uuid4().hex[:10]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO email_delivery_log (
                id,
                category,
                recipient_email,
                subject,
                status,
                detail,
                actor_email
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                email_id,
                str(category or "").strip(),
                _normalize_email(recipient_email) if recipient_email else "",
                str(subject or "").strip(),
                str(status or "pending").strip().lower(),
                str(detail or "").strip(),
                _normalize_email(actor_email) if actor_email else "",
            ),
        )
    return list_email_delivery_log(limit=1)[0]


def list_email_delivery_log(limit: int = 50) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, category, recipient_email, subject, status, detail, actor_email, created_at
            FROM email_delivery_log
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (max(1, min(int(limit or 50), 500)),),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "category": row["category"] or "",
            "recipient_email": row["recipient_email"] or "",
            "subject": row["subject"] or "",
            "status": row["status"] or "",
            "detail": row["detail"] or "",
            "actor_email": row["actor_email"] or "",
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def create_database_backup() -> dict:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target_path = BACKUP_DIR / f"app-backup-{timestamp}.db"
    with sqlite3.connect(DATABASE_PATH) as source_connection:
        with sqlite3.connect(target_path) as target_connection:
            source_connection.backup(target_connection)
    return {
        "file_name": target_path.name,
        "path": str(target_path),
        "size_bytes": target_path.stat().st_size if target_path.exists() else 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def list_database_backups() -> list[dict]:
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    backups = []
    for item in sorted(BACKUP_DIR.glob("*.db"), key=lambda path: path.stat().st_mtime, reverse=True):
        stat = item.stat()
        backups.append(
            {
                "file_name": item.name,
                "path": str(item),
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
            }
        )
    return backups


def export_operational_data() -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "events": list_events(),
        "test_sessions": list_test_sessions(),
        "uploaded_sessions": [get_uploaded_session(item["id"]) for item in list_uploaded_sessions()],
        "reports": list_generated_reports(include_reports=True),
        "auth_audit_log": list_auth_audit_log(limit=500),
        "email_delivery_log": list_email_delivery_log(limit=500),
    }


def get_restore_guidance() -> dict:
    return {
        "title": "SQLite restore guidance",
        "steps": [
            "Stop the DER Telemetry frontend and backend services before replacing the database.",
            "Copy the chosen backup .db file over backend/data/app.db.",
            "Start the backend service first, then the frontend service.",
            "Open the app and check Events, Sessions, and Reports before users return.",
        ],
        "backup_directory": str(BACKUP_DIR),
        "database_path": str(DATABASE_PATH),
    }


def get_database_health() -> dict:
    try:
        with _connect() as connection:
            driver_count = connection.execute("SELECT COUNT(*) FROM drivers").fetchone()[0]
            event_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            uploaded_count = connection.execute("SELECT COUNT(*) FROM uploaded_sessions").fetchone()[0]
        file_size = DATABASE_PATH.stat().st_size if DATABASE_PATH.exists() else 0
        return {
            "ok": True,
            "path": str(DATABASE_PATH),
            "size_bytes": file_size,
            "driver_count": driver_count,
            "event_count": event_count,
            "uploaded_session_count": uploaded_count,
        }
    except Exception as exc:
        return {
            "ok": False,
            "path": str(DATABASE_PATH),
            "error": str(exc),
        }


def list_ai_memory_entries(user_account_id: str = "", email: str = "", role: str = "") -> list[dict]:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        return []
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, title, content, tags_json, pinned, created_at, updated_at
            FROM ai_memory_entries
            WHERE scope_type = ? AND scope_key = ?
            ORDER BY pinned DESC, updated_at DESC, created_at DESC
            """,
            (scope_type, scope_key),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "title": row["title"] or "",
            "content": row["content"] or "",
            "tags": json.loads(row["tags_json"] or "[]"),
            "pinned": bool(row["pinned"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def save_ai_memory_entry(
    title: str,
    content: str,
    tags: list[str],
    pinned: bool,
    user_account_id: str = "",
    email: str = "",
    role: str = "",
) -> dict:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        raise KeyError("settings_scope")
    memory_id = f"mem-{uuid4().hex[:8]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO ai_memory_entries (id, scope_type, scope_key, title, content, tags_json, pinned)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                memory_id,
                scope_type,
                scope_key,
                (title or "").strip(),
                (content or "").strip(),
                json.dumps([str(item).strip() for item in (tags or []) if str(item).strip()]),
                int(bool(pinned)),
            ),
        )
    return list_ai_memory_entries(user_account_id=user_account_id, email=email, role=role)[0]


def delete_ai_memory_entry(memory_id: str) -> None:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM ai_memory_entries WHERE id = ?", (memory_id,))
        if cursor.rowcount == 0:
            raise KeyError(memory_id)


def list_ai_chat_messages(user_account_id: str = "", email: str = "", role: str = "", limit: int = 24) -> list[dict]:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        return []
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, role, content, created_at
            FROM ai_chat_messages
            WHERE scope_type = ? AND scope_key = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (scope_type, scope_key, max(1, int(limit))),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row["created_at"],
        }
        for row in reversed(rows)
    ]


def append_ai_chat_messages(
    messages: list[dict],
    user_account_id: str = "",
    email: str = "",
    role: str = "",
) -> None:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        raise KeyError("settings_scope")
    cleaned_messages = [
        {
            "role": str(item.get("role", "user")).strip().lower(),
            "content": str(item.get("content", "")).strip(),
        }
        for item in (messages or [])
        if str(item.get("content", "")).strip()
    ]
    if not cleaned_messages:
        return
    with _connect() as connection:
        for item in cleaned_messages:
            connection.execute(
                """
                INSERT INTO ai_chat_messages (id, scope_type, scope_key, role, content)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    f"msg-{uuid4().hex[:10]}",
                    scope_type,
                    scope_key,
                    item["role"],
                    item["content"],
                ),
            )


def clear_ai_chat_messages(user_account_id: str = "", email: str = "", role: str = "") -> None:
    scope_type, scope_key = _settings_scope(user_account_id=user_account_id, email=email, role=role)
    if not scope_key:
        raise KeyError("settings_scope")
    with _connect() as connection:
        connection.execute(
            "DELETE FROM ai_chat_messages WHERE scope_type = ? AND scope_key = ?",
            (scope_type, scope_key),
        )


def list_tracks() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, venue, postcode, address_json, google_query, official_url,
                   source_urls_json, layout_notes, coaching_focus_json, corner_notes_json, setup_notes_json, preferred_setup_baseline_json, corner_marker_offsets_json, corner_definitions_json, aliases_json
            FROM tracks
            ORDER BY name COLLATE NOCASE
            """
        ).fetchall()
    return [_track_row(row) for row in rows]


def find_track_by_name(track_name: str | None) -> dict | None:
    normalized = (track_name or "").strip().lower()
    if not normalized:
        return None
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, venue, postcode, address_json, google_query, official_url,
                   source_urls_json, layout_notes, coaching_focus_json, corner_notes_json, setup_notes_json, preferred_setup_baseline_json, corner_marker_offsets_json, corner_definitions_json, aliases_json
            FROM tracks
            """
        ).fetchall()
    for row in rows:
        track = _track_row(row)
        names = [track["name"].lower(), *[alias.lower() for alias in track.get("aliases", [])]]
        if normalized in names:
            return track
    return None


def update_track(
    track_id: str,
    layout_notes: str,
    coaching_focus: list[str],
    corner_notes: list[str],
    corner_definitions: list[dict],
    corner_marker_offsets: dict[str, float] | None = None,
    setup_notes: list[dict] | None = None,
    preferred_setup_baseline: dict | None = None,
) -> dict:
    normalized_corner_notes = [str(item).strip() for item in (corner_notes or []) if str(item).strip()]
    normalized_corner_definitions = []
    normalized_corner_marker_offsets = {}
    normalized_setup_notes = []
    normalized_preferred_baseline = _normalize_preferred_setup_baseline(preferred_setup_baseline or {})
    for index, item in enumerate(corner_definitions or [], start=1):
        name = str(item.get("name", "")).strip() or f"Corner {index}"
        note = str(item.get("note", "")).strip()
        normalized_corner_definitions.append(
            {
                "name": name,
                "sequence": int(item.get("sequence") or index),
                "section_type": str(item.get("section_type", "")).strip(),
                "note": note,
                "sector_name": str(item.get("sector_name", "")).strip(),
                "start_pct": float(item["start_pct"]) if item.get("start_pct") not in (None, "") else None,
                "end_pct": float(item["end_pct"]) if item.get("end_pct") not in (None, "") else None,
                "apex_pct": float(item["apex_pct"]) if item.get("apex_pct") not in (None, "") else None,
            }
        )
    for key, value in (corner_marker_offsets or {}).items():
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            continue
        normalized_corner_marker_offsets[str(key)] = numeric
    for item in setup_notes or []:
        label = str(item.get("label", "")).strip()
        note = str(item.get("note", "")).strip()
        if not label and not note:
            continue
        normalized_setup_notes.append(
            {
                "label": label,
                "note": note,
            }
        )
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE tracks
            SET layout_notes = ?, coaching_focus_json = ?, corner_notes_json = ?, setup_notes_json = ?, preferred_setup_baseline_json = ?, corner_marker_offsets_json = ?, corner_definitions_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                layout_notes.strip(),
                json.dumps([str(item).strip() for item in (coaching_focus or []) if str(item).strip()]),
                json.dumps(normalized_corner_notes),
                json.dumps(normalized_setup_notes),
                json.dumps(normalized_preferred_baseline),
                json.dumps(normalized_corner_marker_offsets),
                json.dumps(sorted(normalized_corner_definitions, key=lambda item: item["sequence"])),
                track_id,
            ),
        )
        if cursor.rowcount == 0:
            raise KeyError(track_id)
        row = connection.execute(
            """
            SELECT id, name, venue, postcode, address_json, google_query, official_url,
                   source_urls_json, layout_notes, coaching_focus_json, corner_notes_json, setup_notes_json, preferred_setup_baseline_json, corner_marker_offsets_json, corner_definitions_json, aliases_json
            FROM tracks
            WHERE id = ?
            """,
            (track_id,),
        ).fetchone()
    return _track_row(row)


def get_driver(driver_id: str) -> dict:
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, name, number, class_name, aliases_json, email FROM drivers WHERE id = ?",
            (driver_id,),
        ).fetchone()
    return _driver_row(row)


def create_driver(name: str, number: str, class_name: str, aliases: list[str], email: str, password: str) -> dict:
    driver = {
        "id": f"drv-{uuid4().hex[:8]}",
        "name": name,
        "number": number,
        "class_name": class_name,
        "aliases": _clean_aliases(aliases),
        "email": _normalize_email(email),
    }
    with _connect() as connection:
        _assert_email_available(connection, driver["email"], "driver")
        connection.execute(
            """
            INSERT INTO drivers (id, name, number, class_name, aliases_json, email, password)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                driver["id"],
                driver["name"],
                driver["number"],
                driver["class_name"],
                json.dumps(driver["aliases"]),
                driver["email"],
                _hash_password(password.strip()) if password.strip() else "",
            ),
        )
    return driver


def update_driver(
    driver_id: str,
    name: str,
    number: str,
    class_name: str,
    aliases: list[str],
    email: str,
    password: str,
) -> dict:
    normalized_email = _normalize_email(email)
    with _connect() as connection:
        _assert_email_available(connection, normalized_email, "driver", driver_id)
        if password.strip():
            cursor = connection.execute(
                """
                UPDATE drivers
                SET name = ?, number = ?, class_name = ?, aliases_json = ?, email = ?, password = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (name, number, class_name, json.dumps(_clean_aliases(aliases)), normalized_email, _hash_password(password.strip()), driver_id),
            )
        else:
            cursor = connection.execute(
                """
                UPDATE drivers
                SET name = ?, number = ?, class_name = ?, aliases_json = ?, email = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (name, number, class_name, json.dumps(_clean_aliases(aliases)), normalized_email, driver_id),
            )
        if cursor.rowcount == 0:
            raise KeyError(driver_id)
        row = connection.execute(
            "SELECT id, name, number, class_name, aliases_json, email FROM drivers WHERE id = ?",
            (driver_id,),
        ).fetchone()
    return _driver_row(row)


def delete_driver(driver_id: str) -> None:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM drivers WHERE id = ?", (driver_id,))
        if cursor.rowcount == 0:
            raise KeyError(driver_id)


def create_event(venue: str, name: str, session_type: str, start_date: str, end_date: str, driver_ids: list[str]) -> dict:
    normalized_start_date = start_date or end_date or ""
    normalized_end_date = end_date or start_date or ""
    event = {
        "id": f"evt-{uuid4().hex[:8]}",
        "venue": venue,
        "name": name,
        "session_type": session_type,
        "date": normalized_start_date,
        "start_date": normalized_start_date,
        "end_date": normalized_end_date,
    }
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO events (id, venue, name, session_type, date, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (event["id"], event["venue"], event["name"], event["session_type"], event["date"], event["start_date"], event["end_date"]),
        )
        _sync_event_drivers(connection, event["id"], driver_ids)
    return get_event(event["id"])


def update_event(event_id: str, venue: str, name: str, session_type: str, start_date: str, end_date: str, driver_ids: list[str]) -> dict:
    normalized_start_date = start_date or end_date or ""
    normalized_end_date = end_date or start_date or ""
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE events
            SET venue = ?, name = ?, session_type = ?, date = ?, start_date = ?, end_date = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (venue, name, session_type, normalized_start_date, normalized_start_date, normalized_end_date, event_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(event_id)
        _sync_event_drivers(connection, event_id, driver_ids)
        allowed_driver_ids = set(driver_ids)
        if allowed_driver_ids:
            test_session_rows = connection.execute(
                "SELECT id FROM test_sessions WHERE event_id = ?",
                (event_id,),
            ).fetchall()
            for row in test_session_rows:
                connection.execute(
                    "DELETE FROM test_session_drivers WHERE test_session_id = ? AND driver_id NOT IN ({})".format(",".join("?" * len(allowed_driver_ids))),
                    (row["id"], *allowed_driver_ids),
                )
        else:
            test_session_rows = connection.execute(
                "SELECT id FROM test_sessions WHERE event_id = ?",
                (event_id,),
            ).fetchall()
            for row in test_session_rows:
                connection.execute("DELETE FROM test_session_drivers WHERE test_session_id = ?", (row["id"],))
    return get_event(event_id)


def delete_event(event_id: str) -> None:
    with _connect() as connection:
        test_session_rows = connection.execute("SELECT id FROM test_sessions WHERE event_id = ?", (event_id,)).fetchall()
        for row in test_session_rows:
            connection.execute("DELETE FROM test_session_drivers WHERE test_session_id = ?", (row["id"],))
        connection.execute("DELETE FROM test_sessions WHERE event_id = ?", (event_id,))
        connection.execute("DELETE FROM event_drivers WHERE event_id = ?", (event_id,))
        cursor = connection.execute("DELETE FROM events WHERE id = ?", (event_id,))
        if cursor.rowcount == 0:
            raise KeyError(event_id)


def create_test_session(
    name: str,
    venue: str,
    session_type: str,
    date: str,
    start_time: str,
    end_time: str,
    event_id: str,
    status: str,
    weather: str,
    track_condition: str,
    tyre_condition: str,
    mechanic_notes: str,
    coach_notes: str,
    driver_ids: list[str],
    driver_setups: dict[str, dict] | None = None,
) -> dict:
    test_session_id = f"tst-{uuid4().hex[:8]}"
    with _connect() as connection:
        normalized_event_id = event_id or ""
        filtered_driver_ids = _filter_driver_ids_for_event(connection, normalized_event_id, driver_ids)
        normalized_setups = _normalize_driver_setups(driver_setups or {})
        connection.execute(
            """
            INSERT INTO test_sessions (id, name, venue, session_type, date, start_time, end_time, event_id, status, weather, track_condition, tyre_condition, weather_forecast_json, mechanic_notes, coach_notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                test_session_id,
                name,
                venue,
                session_type,
                date,
                start_time.strip(),
                end_time.strip(),
                normalized_event_id,
                _normalize_planned_session_status(status),
                weather.strip(),
                track_condition.strip(),
                tyre_condition.strip(),
                "{}",
                mechanic_notes.strip(),
                coach_notes.strip(),
            ),
        )
        for driver_id in filtered_driver_ids:
            setup = normalized_setups.get(driver_id) or _normalize_driver_setup({})
            connection.execute(
                """
                INSERT OR IGNORE INTO test_session_drivers (
                    test_session_id,
                    driver_id,
                    front_sprocket,
                    rear_sprocket,
                    carb_jet,
                    axle_length,
                    axle_type,
                    tyre_type,
                    front_tyre_pressure,
                    rear_tyre_pressure,
                    torsion_bar_type,
                    caster_type,
                    ride_height
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    test_session_id,
                    driver_id,
                    setup["front_sprocket"],
                    setup["rear_sprocket"],
                    setup["carb_jet"],
                    setup["axle_length"],
                    setup["axle_type"],
                    setup["tyre_type"],
                    setup["front_tyre_pressure"],
                    setup["rear_tyre_pressure"],
                    setup["torsion_bar_type"],
                    setup["caster_type"],
                    setup["ride_height"],
                ),
            )
    return get_test_session(test_session_id)


def update_test_session(
    test_session_id: str,
    name: str,
    venue: str,
    session_type: str,
    date: str,
    start_time: str,
    end_time: str,
    event_id: str,
    status: str,
    weather: str,
    track_condition: str,
    tyre_condition: str,
    mechanic_notes: str,
    coach_notes: str,
    driver_ids: list[str],
    driver_setups: dict[str, dict] | None = None,
) -> dict:
    with _connect() as connection:
        normalized_event_id = event_id or ""
        filtered_driver_ids = _filter_driver_ids_for_event(connection, normalized_event_id, driver_ids)
        normalized_setups = _normalize_driver_setups(driver_setups or {})
        cursor = connection.execute(
            """
            UPDATE test_sessions
            SET name = ?, venue = ?, session_type = ?, date = ?, start_time = ?, end_time = ?, event_id = ?, status = ?, weather = ?, track_condition = ?, tyre_condition = ?, mechanic_notes = ?, coach_notes = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                name,
                venue,
                session_type,
                date,
                start_time.strip(),
                end_time.strip(),
                normalized_event_id,
                _normalize_planned_session_status(status),
                weather.strip(),
                track_condition.strip(),
                tyre_condition.strip(),
                mechanic_notes.strip(),
                coach_notes.strip(),
                test_session_id,
            ),
        )
        if cursor.rowcount == 0:
            raise KeyError(test_session_id)
        connection.execute(
            "DELETE FROM test_session_drivers WHERE test_session_id = ?",
            (test_session_id,),
        )
        for driver_id in filtered_driver_ids:
            setup = normalized_setups.get(driver_id) or _normalize_driver_setup({})
            connection.execute(
                """
                INSERT OR IGNORE INTO test_session_drivers (
                    test_session_id,
                    driver_id,
                    front_sprocket,
                    rear_sprocket,
                    carb_jet,
                    axle_length,
                    axle_type,
                    tyre_type,
                    front_tyre_pressure,
                    rear_tyre_pressure,
                    torsion_bar_type,
                    caster_type,
                    ride_height
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    test_session_id,
                    driver_id,
                    setup["front_sprocket"],
                    setup["rear_sprocket"],
                    setup["carb_jet"],
                    setup["axle_length"],
                    setup["axle_type"],
                    setup["tyre_type"],
                    setup["front_tyre_pressure"],
                    setup["rear_tyre_pressure"],
                    setup["torsion_bar_type"],
                    setup["caster_type"],
                    setup["ride_height"],
                ),
            )
    return get_test_session(test_session_id)


def delete_test_session(test_session_id: str) -> None:
    with _connect() as connection:
        connection.execute(
            "DELETE FROM test_session_drivers WHERE test_session_id = ?",
            (test_session_id,),
        )
        cursor = connection.execute(
            "DELETE FROM test_sessions WHERE id = ?",
            (test_session_id,),
        )
        if cursor.rowcount == 0:
            raise KeyError(test_session_id)


def list_test_sessions() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, name, venue, session_type, date, start_time, end_time, event_id, status, weather, track_condition, tyre_condition, weather_forecast_json, mechanic_notes, coach_notes, created_at
            FROM test_sessions
            ORDER BY date DESC, created_at DESC
            """
        ).fetchall()
    return [get_test_session(row["id"]) for row in rows]


def get_test_session(test_session_id: str) -> dict:
    with _connect() as connection:
        session_row = connection.execute(
            """
            SELECT id, name, venue, session_type, date, start_time, end_time, event_id, status, weather, track_condition, tyre_condition, weather_forecast_json, mechanic_notes, coach_notes, created_at
            FROM test_sessions
            WHERE id = ?
            """,
            (test_session_id,),
        ).fetchone()
        if session_row is None:
            raise KeyError(test_session_id)
        driver_rows = connection.execute(
            """
            SELECT
                d.id,
                d.name,
                d.number,
                d.class_name,
                d.aliases_json,
                d.email,
                tsd.front_sprocket,
                tsd.rear_sprocket,
                tsd.carb_jet,
                tsd.axle_length,
                tsd.axle_type,
                tsd.tyre_type,
                tsd.front_tyre_pressure,
                tsd.rear_tyre_pressure,
                tsd.torsion_bar_type,
                tsd.caster_type,
                tsd.ride_height
            FROM test_session_drivers tsd
            JOIN drivers d ON d.id = tsd.driver_id
            WHERE tsd.test_session_id = ?
            ORDER BY d.name COLLATE NOCASE
            """,
            (test_session_id,),
        ).fetchall()
        upload_rows = connection.execute(
            """
            SELECT id, event_round, session_type, driver_count, status, uploaded_files_json, created_at, analysis_json, planned_session_snapshot_json
            FROM uploaded_sessions
            WHERE test_session_id = ?
            ORDER BY created_at DESC
            """,
            (test_session_id,),
        ).fetchall()
        report_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM generated_reports gr
            JOIN uploaded_sessions us ON us.id = gr.session_id
            WHERE us.test_session_id = ?
            """,
            (test_session_id,),
        ).fetchone()[0]
    drivers = [_driver_row_with_setup(row) for row in driver_rows]
    uploads = [
        {
            "id": row["id"],
            "event_round": row["event_round"],
            "session_type": row["session_type"],
            "driver_count": row["driver_count"],
            "status": row["status"],
            "uploaded_files": _safe_json_load(row["uploaded_files_json"], []),
            "created_at": row["created_at"],
            "analysis_summary": _uploaded_session_analysis_summary(_safe_json_load(row["analysis_json"], {})),
            "planned_session_snapshot": _safe_json_load(row["planned_session_snapshot_json"], {}),
        }
        for row in upload_rows
    ]
    setup_saved = any(_driver_setup_has_values(driver.get("setup", {})) for driver in drivers)
    return {
        "id": session_row["id"],
        "name": session_row["name"],
        "venue": session_row["venue"],
        "session_type": session_row["session_type"],
        "date": session_row["date"],
        "start_time": session_row["start_time"] or "",
        "end_time": session_row["end_time"] or "",
        "event_id": session_row["event_id"] or "",
        "status": _normalize_planned_session_status(session_row["status"]),
        "weather": session_row["weather"] or "",
        "track_condition": session_row["track_condition"] or "",
        "tyre_condition": session_row["tyre_condition"] or "",
        "weather_forecast": _safe_json_load(session_row["weather_forecast_json"], {}),
        "mechanic_notes": session_row["mechanic_notes"] or "",
        "coach_notes": session_row["coach_notes"] or "",
        "created_at": session_row["created_at"],
        "drivers": drivers,
        "uploaded_runs": uploads,
        "upload_count": len(uploads),
        "setup_saved": setup_saved,
        "report_count": report_count,
    }


def get_test_session_snapshot(test_session_id: str) -> dict:
    test_session = get_test_session(test_session_id)
    return {
        "id": test_session["id"],
        "name": test_session["name"],
        "venue": test_session["venue"],
        "session_type": test_session["session_type"],
        "date": test_session["date"],
        "start_time": test_session.get("start_time", ""),
        "end_time": test_session.get("end_time", ""),
        "event_id": test_session.get("event_id", ""),
        "status": test_session.get("status", "planned"),
        "weather": test_session.get("weather", ""),
        "track_condition": test_session.get("track_condition", ""),
        "tyre_condition": test_session.get("tyre_condition", ""),
        "weather_forecast": test_session.get("weather_forecast", {}),
        "mechanic_notes": test_session.get("mechanic_notes", ""),
        "coach_notes": test_session.get("coach_notes", ""),
        "created_at": test_session.get("created_at", ""),
        "drivers": test_session.get("drivers", []),
        "setup_saved": test_session.get("setup_saved", False),
        "report_count": test_session.get("report_count", 0),
    }


def list_setup_database() -> dict:
    test_sessions = list_test_sessions()
    tracks_by_name = {track.get("name"): track for track in list_tracks()}
    entries: list[dict] = []
    track_groups: dict[str, dict] = {}

    for session in test_sessions:
        uploaded_runs = session.get("uploaded_runs") or []
        track_name = (session.get("venue") or "").strip() or "Unassigned track"

        for driver in session.get("drivers") or []:
            setup = _normalize_driver_setup(driver.get("setup") or {})
            if not _driver_setup_has_values(setup):
                continue
            track_group = track_groups.setdefault(
                track_name,
                {
                    "track_name": track_name,
                    "setup_count": 0,
                    "session_ids": set(),
                    "driver_ids": set(),
                    "upload_count": 0,
                    "latest_date": "",
                    "common_values": {},
                    "entries": [],
                },
            )

            linked_runs = []
            for run in uploaded_runs:
                matched_driver = next(
                    (
                        item
                        for item in (run.get("analysis_summary") or {}).get("drivers", [])
                        if item.get("driver_id") == driver.get("id")
                        or _normalize_name(item.get("driver_name")) == _normalize_name(driver.get("name"))
                    ),
                    None,
                )
                if matched_driver:
                    linked_runs.append(
                        {
                            "session_id": run.get("id"),
                            "created_at": run.get("created_at", ""),
                            "event_round": run.get("event_round", ""),
                            "session_type": run.get("session_type", ""),
                            "best_lap": matched_driver.get("best_lap"),
                            "best_sector_sum": matched_driver.get("best_sector_sum"),
                            "lap_delta_to_fastest": matched_driver.get("lap_delta_to_fastest"),
                            "top_speed": matched_driver.get("top_speed"),
                            "sector_summary": (run.get("analysis_summary") or {}).get("sector_summary") or [],
                            "corner_summary": (run.get("analysis_summary") or {}).get("corner_summary") or [],
                        }
                    )

            best_result = next(
                (
                    item
                    for item in sorted(
                        [row for row in linked_runs if row.get("best_lap") is not None],
                        key=lambda row: row.get("best_lap") or 999999,
                    )
                ),
                linked_runs[0] if linked_runs else {},
            )

            entry = {
                "id": f"{session['id']}::{driver['id']}",
                "track_name": track_name,
                "test_session_id": session.get("id"),
                "session_name": session.get("name", ""),
                "session_type": session.get("session_type", ""),
                "session_date": session.get("date", ""),
                "session_status": session.get("status", "planned"),
                "start_time": session.get("start_time", ""),
                "end_time": session.get("end_time", ""),
                "weather": session.get("weather", ""),
                "track_condition": session.get("track_condition", ""),
                "tyre_condition": session.get("tyre_condition", ""),
                "mechanic_notes": session.get("mechanic_notes", ""),
                "coach_notes": session.get("coach_notes", ""),
                "driver_id": driver.get("id"),
                "driver_name": driver.get("name", ""),
                "driver_number": driver.get("number", ""),
                "class_name": driver.get("class_name", ""),
                "setup": setup,
                "setup_field_count": sum(1 for value in setup.values() if value not in ("", None)),
                "upload_count": len(linked_runs),
                "report_count": session.get("report_count", 0),
                "best_result": best_result or {},
                "linked_runs": linked_runs[:5],
            }
            entries.append(entry)

            track_group["setup_count"] += 1
            track_group["session_ids"].add(session["id"])
            track_group["driver_ids"].add(driver["id"])
            track_group["upload_count"] += len(linked_runs)
            track_group["entries"].append(entry)
            session_date = session.get("date", "")
            if session_date and session_date > track_group["latest_date"]:
                track_group["latest_date"] = session_date

    track_payload = []
    for track_name, track_group in track_groups.items():
        entries_for_track = sorted(
            track_group["entries"],
            key=lambda item: (
                item.get("session_date", ""),
                item.get("session_name", ""),
                item.get("driver_name", ""),
            ),
            reverse=True,
        )
        track_payload.append(
            {
                "track_name": track_name,
                "track": tracks_by_name.get(track_name) or {},
                "setup_count": track_group["setup_count"],
                "session_count": len(track_group["session_ids"]),
                "driver_count": len(track_group["driver_ids"]),
                "upload_count": track_group["upload_count"],
                "latest_date": track_group["latest_date"],
                "common_values": _build_setup_common_values(entries_for_track),
                "recommended_baseline": _build_recommended_setup_baseline(entries_for_track, tracks_by_name.get(track_name) or {}),
                "leaders": _build_track_setup_leaders(entries_for_track),
                "entries": entries_for_track,
            }
        )

    track_payload.sort(
        key=lambda item: (
            item.get("latest_date", ""),
            item.get("setup_count", 0),
            item.get("track_name", ""),
        ),
        reverse=True,
    )
    entries.sort(
        key=lambda item: (
            item.get("session_date", ""),
            item.get("track_name", ""),
            item.get("driver_name", ""),
        ),
        reverse=True,
    )
    _apply_track_outcome_scores(track_payload)
    return {
        "tracks": track_payload,
        "entries": entries,
        "total_tracks": len(track_payload),
        "total_entries": len(entries),
    }


def get_event(event_id: str) -> dict:
    with _connect() as connection:
        row = connection.execute(
            "SELECT id, venue, name, session_type, date, start_date, end_date FROM events WHERE id = ?",
            (event_id,),
        ).fetchone()
        if row is None:
            raise KeyError(event_id)
        driver_rows = connection.execute(
            """
            SELECT d.id, d.name, d.number, d.class_name, d.aliases_json, d.email
            FROM event_drivers ed
            JOIN drivers d ON d.id = ed.driver_id
            WHERE ed.event_id = ?
            ORDER BY d.name COLLATE NOCASE
            """,
            (event_id,),
        ).fetchall()
        session_rows = connection.execute(
            """
            SELECT id
            FROM test_sessions
            WHERE event_id = ?
            ORDER BY date DESC, created_at DESC
            """,
            (event_id,),
        ).fetchall()
    payload = _event_row(row)
    payload["drivers"] = [_driver_row(driver_row) for driver_row in driver_rows]
    payload["sessions"] = [get_test_session(session_row["id"]) for session_row in session_rows]
    return payload


def update_test_session_weather_forecast(test_session_id: str, forecast: dict) -> dict:
    with _connect() as connection:
        session_row = connection.execute(
            """
            SELECT weather
            FROM test_sessions
            WHERE id = ?
            """,
            (test_session_id,),
        ).fetchone()
        if session_row is None:
            raise KeyError(test_session_id)
        weather_value = (session_row["weather"] or "").strip() or (forecast.get("summary") or "")
        cursor = connection.execute(
            """
            UPDATE test_sessions
            SET weather = ?, weather_forecast_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                weather_value,
                json.dumps(forecast or {}),
                test_session_id,
            ),
        )
        if cursor.rowcount == 0:
            raise KeyError(test_session_id)
    return get_test_session(test_session_id)


def save_uploaded_session(event_name: str, event_round: str, session_type: str, analysis: dict, test_session_id: str | None = None, validation: dict | None = None, uploaded_files: list[dict] | None = None) -> str:
    session_id = f"ses-{uuid4().hex[:8]}"
    planned_session_snapshot = {}
    if test_session_id:
        try:
            planned_session_snapshot = get_test_session_snapshot(test_session_id)
        except KeyError:
            planned_session_snapshot = {}
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO uploaded_sessions (id, event_name, event_round, session_type, driver_count, analysis_json, test_session_id, planned_session_snapshot_json, validation_json, status, uploaded_files_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                event_name,
                event_round,
                session_type,
                len(analysis.get("drivers", [])),
                json.dumps(analysis),
                test_session_id,
                json.dumps(planned_session_snapshot or {}),
                json.dumps(validation or {}),
                "uploaded",
                json.dumps(uploaded_files or []),
            ),
        )
    return session_id


def list_uploaded_sessions() -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, event_name, event_round, session_type, driver_count, test_session_id, planned_session_snapshot_json, validation_json, analysis_json, status, uploaded_files_json, created_at
            FROM uploaded_sessions
            ORDER BY created_at DESC
            """
        ).fetchall()
    return [
        {
            "id": row["id"],
            "event_name": row["event_name"],
            "event_round": row["event_round"],
            "session_type": row["session_type"],
            "driver_count": row["driver_count"],
            "status": row["status"],
            "test_session_id": row["test_session_id"],
            "planned_session_snapshot": _safe_json_load(row["planned_session_snapshot_json"], {}),
            "validation": _safe_json_load(row["validation_json"], {}),
            "uploaded_files": _safe_json_load(row["uploaded_files_json"], []),
            "drivers": [
                {
                    "driver_name": driver.get("canonical_driver_name") or driver.get("driver_name"),
                    "driver_id": driver.get("driver_id"),
                    "lap_delta_to_fastest": driver.get("lap_delta_to_fastest"),
                    "best_lap": driver.get("best_lap"),
                }
                for driver in _safe_json_load(row["analysis_json"], {}).get("drivers", [])
            ],
            "created_at": row["created_at"],
        }
        for row in rows
    ]


def get_uploaded_session(session_id: str) -> dict:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, event_name, event_round, session_type, driver_count, test_session_id, planned_session_snapshot_json, analysis_json, validation_json, status, uploaded_files_json, created_at
            FROM uploaded_sessions
            WHERE id = ?
            """,
            (session_id,),
        ).fetchone()
    if row is None:
        raise KeyError(session_id)
    analysis = _refresh_uploaded_session_analysis(
        row["id"],
        row["event_name"],
        _safe_json_load(row["analysis_json"], {}),
    )
    validation = _safe_json_load(row["validation_json"], {})
    planned_session_snapshot = _safe_json_load(row["planned_session_snapshot_json"], {})
    analysis["validation"] = validation
    analysis["session_id"] = row["id"]
    return {
        "id": row["id"],
        "event_name": row["event_name"],
        "event_round": row["event_round"],
        "session_type": row["session_type"],
        "driver_count": row["driver_count"],
        "status": row["status"],
        "test_session_id": row["test_session_id"],
        "planned_session_snapshot": planned_session_snapshot,
        "analysis": analysis,
        "validation": validation,
        "uploaded_files": _safe_json_load(row["uploaded_files_json"], []),
        "created_at": row["created_at"],
    }


def _refresh_uploaded_session_analysis(session_id: str, event_name: str, analysis: dict) -> dict:
    if not analysis or not analysis.get("drivers"):
        return analysis
    from .analysis import _build_corner_analysis, _build_overlay_bounds, _build_sector_analysis

    track = find_track_by_name(event_name)
    next_analysis = dict(analysis)
    next_analysis["overlay_bounds"] = _build_overlay_bounds(next_analysis.get("drivers") or [])
    next_analysis["corner_analysis"] = _build_corner_analysis(next_analysis.get("drivers") or [], track)
    next_analysis["sector_analysis"] = _build_sector_analysis(next_analysis.get("drivers") or [], track)
    if next_analysis == analysis:
        return analysis
    with _connect() as connection:
        connection.execute(
            """
            UPDATE uploaded_sessions
            SET analysis_json = ?
            WHERE id = ?
            """,
            (json.dumps(next_analysis), session_id),
        )
    return next_analysis


def delete_uploaded_session(session_id: str) -> None:
    with _connect() as connection:
        connection.execute("DELETE FROM coaching_notes WHERE session_id = ?", (session_id,))
        connection.execute("DELETE FROM session_presets WHERE session_id = ?", (session_id,))
        connection.execute("DELETE FROM generated_reports WHERE session_id = ?", (session_id,))
        cursor = connection.execute("DELETE FROM uploaded_sessions WHERE id = ?", (session_id,))
        if cursor.rowcount == 0:
            raise KeyError(session_id)


def list_session_presets(session_id: str) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, session_id, name, preset_json, created_at, updated_at
            FROM session_presets
            WHERE session_id = ?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (session_id,),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "session_id": row["session_id"],
            "name": row["name"],
            "preset": json.loads(row["preset_json"] or "{}"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def save_session_preset(session_id: str, name: str, preset: dict) -> dict:
    preset_id = f"pre-{uuid4().hex[:8]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO session_presets (id, session_id, name, preset_json)
            VALUES (?, ?, ?, ?)
            """,
            (preset_id, session_id, name.strip(), json.dumps(preset or {})),
        )
    return list_session_presets(session_id)[0]


def delete_session_preset(preset_id: str) -> None:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM session_presets WHERE id = ?", (preset_id,))
        if cursor.rowcount == 0:
            raise KeyError(preset_id)


def list_coaching_notes(session_id: str) -> list[dict]:
    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, session_id, driver_id, title, body, next_actions_json, created_at, updated_at
            FROM coaching_notes
            WHERE session_id = ?
            ORDER BY updated_at DESC, created_at DESC
            """,
            (session_id,),
        ).fetchall()
    driver_names = {driver["id"]: driver["name"] for driver in list_drivers()}
    return [
        {
            "id": row["id"],
            "session_id": row["session_id"],
            "driver_id": row["driver_id"] or "",
            "driver_name": driver_names.get(row["driver_id"], ""),
            "title": row["title"],
            "body": row["body"],
            "next_actions": json.loads(row["next_actions_json"] or "[]"),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }
        for row in rows
    ]


def save_coaching_note(session_id: str, driver_id: str, title: str, body: str, next_actions: list[str]) -> dict:
    note_id = f"note-{uuid4().hex[:8]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO coaching_notes (id, session_id, driver_id, title, body, next_actions_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                note_id,
                session_id,
                driver_id or "",
                title.strip(),
                body.strip(),
                json.dumps([str(item).strip() for item in (next_actions or []) if str(item).strip()]),
            ),
        )
    return list_coaching_notes(session_id)[0]


def delete_coaching_note(note_id: str) -> None:
    with _connect() as connection:
        cursor = connection.execute("DELETE FROM coaching_notes WHERE id = ?", (note_id,))
        if cursor.rowcount == 0:
            raise KeyError(note_id)


def update_uploaded_session_status(session_id: str, status: str) -> dict:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE uploaded_sessions
            SET status = ?
            WHERE id = ?
            """,
            (status, session_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(session_id)
    return get_uploaded_session(session_id)


def save_generated_report(session_id: str | None, audience: str, provider: str, model: str, reports: list[dict]) -> str:
    report_id = f"rep-{uuid4().hex[:8]}"
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO generated_reports (id, session_id, audience, provider, model, reports_json, status, visible_to_driver, visible_to_parent, review_note, reviewed_at, published_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (report_id, session_id, audience, provider, model, json.dumps(reports), "draft", 0, 0, "", None, None),
        )
        if session_id:
            connection.execute(
                """
                UPDATE uploaded_sessions
                SET status = CASE
                    WHEN status IN ('uploaded', 'planned') THEN 'analysed'
                    ELSE status
                END
                WHERE id = ?
                """,
                (session_id,),
            )
    return report_id


def list_generated_reports(session_id: str | None = None, include_reports: bool = False) -> list[dict]:
    params: tuple = ()
    query = """
        SELECT id, session_id, audience, provider, model, reports_json, status, visible_to_driver, visible_to_parent, review_note, reviewed_at, published_at, created_at
        FROM generated_reports
    """
    if session_id:
        query += " WHERE session_id = ?"
        params = (session_id,)
    query += " ORDER BY created_at DESC"
    with _connect() as connection:
        rows = connection.execute(query, params).fetchall()
    return [
        _report_row(row, include_reports=include_reports)
        for row in rows
    ]


def update_generated_report_publish_state(report_id: str, status: str, visible_to_driver: bool, visible_to_parent: bool, review_note: str = "") -> dict:
    with _connect() as connection:
        reviewed_at = None
        published_at = None
        if status in {"reviewed", "published"}:
            reviewed_at = _utcnow_iso()
        if status == "published":
            published_at = _utcnow_iso()
        cursor = connection.execute(
            """
            UPDATE generated_reports
            SET status = ?, visible_to_driver = ?, visible_to_parent = ?, review_note = ?, reviewed_at = COALESCE(?, reviewed_at), published_at = CASE WHEN ? IS NOT NULL THEN ? ELSE published_at END
            WHERE id = ?
            """,
            (status, int(bool(visible_to_driver)), int(bool(visible_to_parent)), (review_note or "").strip(), reviewed_at, published_at, published_at, report_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(report_id)
        row = connection.execute(
            """
            SELECT id, session_id, audience, provider, model, reports_json, status, visible_to_driver, visible_to_parent, review_note, reviewed_at, published_at, created_at
            FROM generated_reports
            WHERE id = ?
            """,
            (report_id,),
        ).fetchone()
    return _report_row(row, include_reports=True)


def get_driver_timeline(driver_id: str) -> dict:
    driver = get_driver(driver_id)
    sessions = []
    reports = []
    for session in list_uploaded_sessions():
        detailed = get_uploaded_session(session["id"])
        matched_driver = next(
            (item for item in detailed["analysis"].get("drivers", []) if item.get("driver_id") == driver_id),
            None,
        )
        if matched_driver:
            sessions.append(
                {
                    "session_id": detailed["id"],
                    "event_name": detailed["event_name"],
                    "event_round": detailed["event_round"],
                    "session_type": detailed["session_type"],
                    "status": detailed.get("status", "uploaded"),
                    "created_at": detailed["created_at"],
                    "best_lap": matched_driver.get("best_lap"),
                    "best_three_average": matched_driver.get("best_three_average"),
                    "consistency": matched_driver.get("consistency"),
                    "session_rank": matched_driver.get("session_rank"),
                    "lap_delta_to_fastest": matched_driver.get("lap_delta_to_fastest"),
                }
            )
    for report_entry in list_generated_reports(include_reports=True):
        for report in report_entry.get("reports", []):
            if report.get("driver_id") == driver_id:
                reports.append(
                    {
                        "report_id": report_entry["id"],
                        "session_id": report_entry["session_id"],
                        "audience": report_entry["audience"],
                        "status": report_entry["status"],
                        "visible_to_driver": report_entry["visible_to_driver"],
                        "visible_to_parent": report_entry["visible_to_parent"],
                        "created_at": report_entry["created_at"],
                        "summary": report.get("overall_summary"),
                    }
                )
    sessions.sort(key=lambda item: item["created_at"], reverse=True)
    reports.sort(key=lambda item: item["created_at"], reverse=True)
    return {
        "driver": driver,
        "timeline": sessions,
        "reports": reports,
        "notes": [
            note for session in sessions
            for note in list_coaching_notes(session["session_id"])
            if note.get("driver_id") == driver_id
        ],
    }


def get_driver_by_credentials(email: str, password: str) -> dict | None:
    normalized_email = _normalize_email(email)
    if not normalized_email or not password:
        return None
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, name, number, class_name, aliases_json, email, password
            FROM drivers
            WHERE lower(email) = ?
            """,
            (normalized_email,),
        ).fetchone()
    if row is None:
        return None
    if not _verify_password(password, row["password"]):
        return None
    if row["password"] and not _password_is_hashed(row["password"]):
        with _connect() as connection:
            connection.execute(
                "UPDATE drivers SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (_hash_password(password), row["id"]),
            )
    return _driver_row(row)


def get_user_account(account_id: str) -> dict:
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT ua.id, ua.name, ua.email, ua.role, ua.access_level_id, ua.linked_driver_id,
                   ua.status, ua.must_change_password, ua.approved_at, ua.temporary_password,
                   al.name AS access_level_name, al.permissions_json
            FROM user_accounts ua
            LEFT JOIN access_levels al ON al.id = ua.access_level_id
            WHERE ua.id = ?
            """,
            (account_id,),
        ).fetchone()
    if row is None:
        raise KeyError(account_id)
    return _user_account_row(row)


def get_user_account_by_credentials(email: str, password: str) -> dict | None:
    normalized_email = _normalize_email(email)
    if not normalized_email or not password:
        return None
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT ua.id, ua.name, ua.email, ua.role, ua.access_level_id, ua.linked_driver_id,
                   ua.status, ua.must_change_password, ua.approved_at, ua.temporary_password, ua.password,
                   al.name AS access_level_name, al.permissions_json
            FROM user_accounts ua
            LEFT JOIN access_levels al ON al.id = ua.access_level_id
            WHERE lower(ua.email) = ?
            """,
            (normalized_email,),
        ).fetchone()
    if row is None:
        return None
    if not _verify_password(password, row["password"]):
        return None
    if row["password"] and not _password_is_hashed(row["password"]):
        with _connect() as connection:
            connection.execute(
                "UPDATE user_accounts SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (_hash_password(password), row["id"]),
            )
    return _user_account_row(row)


def get_user_account_by_email(email: str) -> dict | None:
    normalized_email = _normalize_email(email)
    if not normalized_email:
        return None
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT ua.id, ua.name, ua.email, ua.role, ua.access_level_id, ua.linked_driver_id,
                   ua.status, ua.must_change_password, ua.approved_at, ua.temporary_password,
                   al.name AS access_level_name, al.permissions_json
            FROM user_accounts ua
            LEFT JOIN access_levels al ON al.id = ua.access_level_id
            WHERE lower(ua.email) = ?
            """,
            (normalized_email,),
        ).fetchone()
    if row is None:
        return None
    return _user_account_row(row)


def create_registration_account(
    name: str,
    email: str,
    role: str,
    linked_driver_id: str = "",
    assigned_driver_ids: list[str] | None = None,
) -> dict:
    return create_user_account(
        name=name,
        email=email,
        password="",
        role=role,
        access_level_id="",
        linked_driver_id=linked_driver_id,
        assigned_driver_ids=assigned_driver_ids or [],
        status="pending",
        must_change_password=False,
        temporary_password=False,
    )


def approve_user_account(account_id: str, temporary_password: str) -> dict:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE user_accounts
            SET status = 'approved',
                password = ?,
                must_change_password = 1,
                temporary_password = 1,
                approved_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (_hash_password(temporary_password), account_id),
        )
        if cursor.rowcount == 0:
            raise KeyError(account_id)
    return get_user_account(account_id)


def reject_user_account(account_id: str) -> dict:
    with _connect() as connection:
        cursor = connection.execute(
            """
            UPDATE user_accounts
            SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (account_id,),
        )
        if cursor.rowcount == 0:
            raise KeyError(account_id)
    return get_user_account(account_id)


def create_password_reset_token(email: str) -> dict:
    normalized_email = _normalize_email(email)
    token_payload = {
        "ok": True,
        "message": "If that email exists in the platform, a reset token has been created.",
        "reset_token": None,
        "expires_at": None,
    }
    if not normalized_email:
        return token_payload

    with _connect() as connection:
        user_row = connection.execute(
            """
            SELECT id, email, status
            FROM user_accounts
            WHERE lower(email) = ?
            """,
            (normalized_email,),
        ).fetchone()
        driver_row = connection.execute(
            """
            SELECT id, email
            FROM drivers
            WHERE lower(email) = ?
            """,
            (normalized_email,),
        ).fetchone()

        identity_type = ""
        identity_id = ""
        if user_row is not None and driver_row is not None:
            return token_payload
        if user_row is not None:
            if user_row["status"] != "approved":
                return token_payload
            identity_type = "user_account"
            identity_id = user_row["id"]
        elif driver_row is not None:
            identity_type = "driver"
            identity_id = driver_row["id"]
        else:
            return token_payload

        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = COALESCE(NULLIF(used_at, ''), CURRENT_TIMESTAMP)
            WHERE lower(email) = ? AND used_at = ''
            """,
            (normalized_email,),
        )
        raw_token = secrets.token_urlsafe(24)
        expires_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        connection.execute(
            """
            INSERT INTO password_reset_tokens (id, identity_type, identity_id, email, token, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                f"prt-{uuid4().hex[:8]}",
                identity_type,
                identity_id,
                normalized_email,
                raw_token,
                expires_at,
            ),
        )

    return {
        **token_payload,
        "reset_token": raw_token,
        "expires_at": expires_at,
    }


def reset_password_with_token(token: str, password: str) -> None:
    normalized_token = token.strip()
    if not normalized_token or not password.strip():
        raise KeyError("invalid_reset_token")

    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, identity_type, identity_id, expires_at, used_at
            FROM password_reset_tokens
            WHERE token = ?
            """,
            (normalized_token,),
        ).fetchone()
        if row is None:
            raise KeyError("invalid_reset_token")
        if row["used_at"]:
            raise KeyError("used_reset_token")
        expires_at = datetime.fromisoformat(row["expires_at"])
        if expires_at < datetime.now(timezone.utc):
            raise KeyError("expired_reset_token")

        if row["identity_type"] == "user_account":
            cursor = connection.execute(
                """
                UPDATE user_accounts
                SET password = ?, must_change_password = 0, temporary_password = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (_hash_password(password), row["identity_id"]),
            )
        else:
            cursor = connection.execute(
                """
                UPDATE drivers
                SET password = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (_hash_password(password), row["identity_id"]),
            )
        if cursor.rowcount == 0:
            raise KeyError("invalid_reset_token")

        connection.execute(
            """
            UPDATE password_reset_tokens
            SET used_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (row["id"],),
        )


def change_user_account_password(email: str, current_password: str, password: str) -> dict | None:
    normalized_email = email.strip().lower()
    if not normalized_email or not current_password or not password.strip():
        return None
    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, password
            FROM user_accounts
            WHERE lower(email) = ?
            """,
            (normalized_email,),
        ).fetchone()
        if row is None or not _verify_password(current_password, row["password"]):
            return None
        cursor = connection.execute(
            """
            UPDATE user_accounts
            SET password = ?, must_change_password = 0, temporary_password = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (_hash_password(password.strip()), row["id"]),
        )
        if cursor.rowcount == 0:
            return None
        row = connection.execute(
            """
            SELECT ua.id, ua.name, ua.email, ua.role, ua.access_level_id, ua.linked_driver_id,
                   ua.status, ua.must_change_password, ua.approved_at, ua.temporary_password,
                   al.name AS access_level_name, al.permissions_json
            FROM user_accounts ua
            LEFT JOIN access_levels al ON al.id = ua.access_level_id
            WHERE lower(ua.email) = ?
            """,
            (normalized_email,),
        ).fetchone()
    return _user_account_row(row)


def match_driver_name(driver_name: str) -> dict | None:
    normalized = _normalize_driver_name(driver_name)
    if not normalized:
        return None
    for driver in list_drivers():
        aliases = [driver["name"], *(driver.get("aliases") or [])]
        for alias in aliases:
            if _normalize_driver_name(alias) == normalized:
                return {
                    "driver": driver,
                    "matched_by": "name" if alias == driver["name"] else "alias",
                    "matched_value": alias,
                }
    return None


def get_driver_portal(driver_id: str) -> dict:
    driver = get_driver(driver_id)
    sessions = []
    for session in list_uploaded_sessions():
        for driver_row in session.get("drivers", []):
            if driver_row.get("driver_id") == driver_id:
                detailed = get_uploaded_session(session["id"])
                matched_driver = next(
                    (item for item in detailed["analysis"].get("drivers", []) if item.get("driver_id") == driver_id),
                    None,
                )
                planned_session_snapshot = detailed.get("planned_session_snapshot") or {}
                planned_driver = next(
                    (item for item in planned_session_snapshot.get("drivers", []) if item.get("id") == driver_id),
                    None,
                )
                sessions.append(
                    {
                        "id": detailed["id"],
                        "event_name": detailed["event_name"],
                        "event_round": detailed["event_round"],
                        "session_type": detailed["session_type"],
                        "test_session_id": detailed.get("test_session_id"),
                        "planned_session_snapshot": planned_session_snapshot,
                        "setup": (planned_driver or {}).get("setup", {}),
                        "created_at": detailed["created_at"],
                        "validation": detailed["validation"],
                        "driver_analysis": matched_driver,
                    }
                )
                break
    reports = []
    for report_entry in list_generated_reports(include_reports=True):
        for report in report_entry.get("reports", []):
            if report.get("driver_id") == driver_id and report_entry.get("visible_to_driver"):
                reports.append(
                    {
                        "id": report_entry["id"],
                        "session_id": report_entry["session_id"],
                        "audience": report_entry["audience"],
                        "provider": report_entry["provider"],
                        "model": report_entry["model"],
                        "created_at": report_entry["created_at"],
                        "report": report,
                    }
                )
    sessions.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    reports.sort(key=lambda item: item.get("created_at", ""), reverse=True)
    return {
        "driver": driver,
        "sessions": sessions,
        "reports": reports,
    }


def get_user_account_portal(account_id: str) -> dict:
    account = get_user_account(account_id)
    if account["role"] == "driver":
        driver_id = account.get("linked_driver_id")
        portal = get_driver_portal(driver_id) if driver_id else {"driver": None, "sessions": [], "reports": []}
        return {
            "account": account,
            "portal_type": "driver",
            **portal,
        }
    if account["role"] == "parent":
        drivers = []
        for driver in account.get("assigned_drivers", []):
            portal = get_driver_portal(driver["id"])
            drivers.append(
                {
                    "driver": portal["driver"],
                    "sessions": portal["sessions"],
                    "reports": [
                        {
                            **item,
                            "visible_to_parent": True,
                        }
                        for report_entry in list_generated_reports(include_reports=True)
                        for report in report_entry.get("reports", [])
                        if report.get("driver_id") == driver["id"] and report_entry.get("visible_to_parent")
                        for item in [{
                            "id": report_entry["id"],
                            "session_id": report_entry["session_id"],
                            "audience": report_entry["audience"],
                            "provider": report_entry["provider"],
                            "model": report_entry["model"],
                            "created_at": report_entry["created_at"],
                            "report": report,
                        }]
                    ],
                }
            )
        return {
            "account": account,
            "portal_type": "parent",
            "drivers": drivers,
        }
    return {
        "account": account,
        "portal_type": account["role"],
    }


def _connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def _settings_scope(user_account_id: str = "", email: str = "", role: str = "") -> tuple[str, str]:
    normalized_account_id = (user_account_id or "").strip()
    normalized_email = (email or "").strip().lower()
    normalized_role = (role or "").strip().lower()
    if normalized_account_id:
        return ("user_account", normalized_account_id)
    if normalized_email:
        if normalized_role == "admin":
            return ("system_admin", normalized_email)
        return ("email", normalized_email)
    return ("", "")


def _ensure_column(connection: sqlite3.Connection, table_name: str, column_name: str, column_sql: str) -> None:
    columns = [row["name"] for row in connection.execute(f"PRAGMA table_info({table_name})").fetchall()]
    if column_name not in columns:
        connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_sql}")


def _migrate_legacy_store() -> None:
    if not LEGACY_STORE_PATH.exists():
        return

    with _connect() as connection:
        driver_count = connection.execute("SELECT COUNT(*) FROM drivers").fetchone()[0]
        event_count = connection.execute("SELECT COUNT(*) FROM events").fetchone()[0]
        if driver_count or event_count:
            return

        data = json.loads(LEGACY_STORE_PATH.read_text(encoding="utf-8"))
        for driver in data.get("drivers", []):
            connection.execute(
                """
                INSERT OR IGNORE INTO drivers (id, name, number, class_name, aliases_json, email, password)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    driver.get("id") or f"drv-{uuid4().hex[:8]}",
                    driver.get("name", ""),
                    driver.get("number", ""),
                    driver.get("class_name", ""),
                    json.dumps(_clean_aliases(driver.get("aliases", []))),
                    driver.get("email", ""),
                    driver.get("password", ""),
                ),
            )
        for event in data.get("events", []):
            connection.execute(
                """
                INSERT OR IGNORE INTO events (id, venue, name, session_type, date)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    event.get("id") or f"evt-{uuid4().hex[:8]}",
                    event.get("venue", ""),
                    event.get("name", ""),
                    event.get("session_type", ""),
                    event.get("date", ""),
                ),
            )


def _seed_tracks() -> None:
    with _connect() as connection:
        track_count = connection.execute("SELECT COUNT(*) FROM tracks").fetchone()[0]
        if track_count:
            return
        for track in TRACK_SEED:
            connection.execute(
                """
                INSERT OR IGNORE INTO tracks (
                    id, name, venue, postcode, address_json, google_query, official_url,
                    source_urls_json, layout_notes, coaching_focus_json, corner_notes_json, setup_notes_json, preferred_setup_baseline_json, corner_definitions_json, aliases_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    track["id"],
                    track["name"],
                    track["venue"],
                    track["postcode"],
                    track["address_json"],
                    track["google_query"],
                    track["official_url"],
                    track["source_urls_json"],
                    track["layout_notes"],
                    track["coaching_focus_json"],
                    track["corner_notes_json"],
                    "[]",
                    "{}",
                    track.get("corner_definitions_json") or json.dumps([
                        {
                            "name": f"Corner {index + 1}",
                            "sequence": index + 1,
                            "section_type": "",
                            "note": note,
                        }
                        for index, note in enumerate(json.loads(track["corner_notes_json"]))
                    ]),
                    track["aliases_json"],
                ),
            )


def _seed_kart_classes() -> None:
    with _connect() as connection:
        count = connection.execute("SELECT COUNT(*) FROM kart_classes").fetchone()[0]
        if count:
            return
        for name in CLASS_SEED:
            connection.execute(
                """
                INSERT OR IGNORE INTO kart_classes (id, name)
                VALUES (?, ?)
                """,
                (f"cls-{uuid4().hex[:8]}", name),
            )


def _seed_access_levels() -> None:
    seed_levels = {
        "Driver Standard": {
            "view_sessions": True,
            "view_feedback": True,
            "view_history": True,
        },
        "Driver Limited": {
            "view_sessions": True,
            "view_feedback": False,
            "view_history": False,
        },
        "Parent Viewer": {
            "view_sessions": True,
            "view_feedback": True,
            "view_history": True,
        },
    }
    with _connect() as connection:
        count = connection.execute("SELECT COUNT(*) FROM access_levels").fetchone()[0]
        if count:
            return
        for name, permissions in seed_levels.items():
            connection.execute(
                """
                INSERT OR IGNORE INTO access_levels (id, name, permissions_json)
                VALUES (?, ?, ?)
                """,
                (f"acl-{uuid4().hex[:8]}", name, json.dumps(permissions)),
            )


def _driver_row(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise KeyError("driver")
    return {
        "id": row["id"],
        "name": row["name"],
        "number": row["number"],
        "class_name": row["class_name"],
        "aliases": json.loads(row["aliases_json"] or "[]"),
        "email": row["email"],
    }


def _driver_row_with_setup(row: sqlite3.Row | None) -> dict:
    payload = _driver_row(row)
    payload["setup"] = _normalize_driver_setup(
        {
            "front_sprocket": row["front_sprocket"],
            "rear_sprocket": row["rear_sprocket"],
            "carb_jet": row["carb_jet"],
            "axle_length": row["axle_length"],
            "axle_type": row["axle_type"],
            "tyre_type": row["tyre_type"],
            "front_tyre_pressure": row["front_tyre_pressure"],
            "rear_tyre_pressure": row["rear_tyre_pressure"],
            "torsion_bar_type": row["torsion_bar_type"],
            "caster_type": row["caster_type"],
            "ride_height": row["ride_height"],
        }
    )
    return payload


def _normalize_driver_setups(driver_setups: dict[str, dict]) -> dict[str, dict]:
    return {
        str(driver_id): _normalize_driver_setup(setup or {})
        for driver_id, setup in (driver_setups or {}).items()
    }


def _safe_json_load(value: str | None, fallback):
    try:
        return json.loads(value or "")
    except (TypeError, json.JSONDecodeError):
        return fallback


def _normalize_driver_setup(setup: dict) -> dict:
    return {
        "front_sprocket": str(setup.get("front_sprocket", "") or ""),
        "rear_sprocket": str(setup.get("rear_sprocket", "") or ""),
        "carb_jet": str(setup.get("carb_jet", "") or ""),
        "axle_length": str(setup.get("axle_length", "") or ""),
        "axle_type": str(setup.get("axle_type", "") or ""),
        "tyre_type": str(setup.get("tyre_type", "") or ""),
        "front_tyre_pressure": setup.get("front_tyre_pressure"),
        "rear_tyre_pressure": setup.get("rear_tyre_pressure"),
        "torsion_bar_type": str(setup.get("torsion_bar_type", "") or ""),
        "caster_type": str(setup.get("caster_type", "") or ""),
        "ride_height": str(setup.get("ride_height", "") or ""),
    }


def _normalize_planned_session_status(status: str | None) -> str:
    normalized = str(status or "planned").strip().lower()
    return normalized if normalized in PLANNED_SESSION_STATUS_OPTIONS else "planned"


def _driver_setup_has_values(setup: dict | None) -> bool:
    normalized = _normalize_driver_setup(setup or {})
    return any(
        value not in ("", None)
        for value in normalized.values()
    )


def _build_setup_common_values(entries: list[dict]) -> dict:
    payload = {}
    for field in KART_SETUP_FIELDS:
        counts: dict[str, int] = {}
        for entry in entries:
            value = (entry.get("setup") or {}).get(field)
            if value in ("", None):
                continue
            key = str(value)
            counts[key] = counts.get(key, 0) + 1
        if counts:
            payload[field] = [
                {"value": value, "count": count}
                for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:3]
            ]
    return payload


def _normalize_name(value: str | None) -> str:
    return "".join(char.lower() for char in str(value or "") if char.isalnum())


def _build_track_setup_leaders(entries: list[dict]) -> dict:
    with_best_lap = [entry for entry in entries if (entry.get("best_result") or {}).get("best_lap") is not None]
    with_sector_sum = [entry for entry in entries if (entry.get("best_result") or {}).get("best_sector_sum") is not None]
    with_top_speed = [entry for entry in entries if (entry.get("best_result") or {}).get("top_speed") is not None]
    fastest = min(with_best_lap, key=lambda item: item["best_result"]["best_lap"]) if with_best_lap else None
    strongest_sector = min(with_sector_sum, key=lambda item: item["best_result"]["best_sector_sum"]) if with_sector_sum else None
    strongest_speed = max(with_top_speed, key=lambda item: item["best_result"]["top_speed"]) if with_top_speed else None
    return {
        "best_lap": _build_entry_leader_summary(fastest, "best_lap"),
        "best_sector_sum": _build_entry_leader_summary(strongest_sector, "best_sector_sum"),
        "top_speed": _build_entry_leader_summary(strongest_speed, "top_speed"),
    }


def _build_entry_leader_summary(entry: dict | None, field: str) -> dict:
    if not entry:
        return {}
    return {
        "entry_id": entry.get("id"),
        "driver_name": entry.get("driver_name", ""),
        "session_name": entry.get("session_name", ""),
        "session_date": entry.get("session_date", ""),
        "value": (entry.get("best_result") or {}).get(field),
    }


def _apply_track_outcome_scores(tracks: list[dict]) -> None:
    for track in tracks:
        leaders = track.get("leaders") or {}
        leader_ids = {
            "best_lap": (leaders.get("best_lap") or {}).get("entry_id"),
            "best_sector_sum": (leaders.get("best_sector_sum") or {}).get("entry_id"),
            "top_speed": (leaders.get("top_speed") or {}).get("entry_id"),
        }
        for entry in track.get("entries") or []:
            outcome_score = 0
            badges = []
            if entry.get("id") == leader_ids.get("best_lap"):
                outcome_score += 3
                badges.append("Best lap leader")
            if entry.get("id") == leader_ids.get("best_sector_sum"):
                outcome_score += 2
                badges.append("Best sector sum leader")
            if entry.get("id") == leader_ids.get("top_speed"):
                outcome_score += 1
                badges.append("Top speed leader")
            entry["outcome_score"] = outcome_score
            entry["outcome_badges"] = badges


def _build_recommended_setup_baseline(entries: list[dict], track: dict) -> dict:
    preferred = _normalize_preferred_setup_baseline(track.get("preferredSetupBaseline") or {})
    if _driver_setup_has_values(preferred.get("setup") or {}):
        return {
            "source": "pinned",
            "label": preferred.get("label") or "Pinned baseline",
            "notes": preferred.get("notes", ""),
            "setup": preferred.get("setup", {}),
            "entry_id": preferred.get("entry_id", ""),
        }

    scored_entries = sorted(
        entries,
        key=lambda item: (
            (item.get("best_result") or {}).get("best_lap") is None,
            (item.get("best_result") or {}).get("best_lap") or 999999,
        ),
    )[:3]
    if not scored_entries:
        return {"source": "derived", "label": "No baseline yet", "notes": "", "setup": {}, "entry_id": ""}
    baseline_setup = {}
    for field in KART_SETUP_FIELDS:
        counts: dict[str, int] = {}
        for entry in scored_entries:
            value = (entry.get("setup") or {}).get(field)
            if value in ("", None):
                continue
            key = str(value)
            counts[key] = counts.get(key, 0) + 1
        if counts:
            baseline_setup[field] = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
    return {
        "source": "derived",
        "label": "Recommended baseline",
        "notes": "Built from the strongest recent setup records at this track.",
        "setup": baseline_setup,
        "entry_id": scored_entries[0].get("id", ""),
    }


def _normalize_preferred_setup_baseline(payload: dict) -> dict:
    return {
        "entry_id": str(payload.get("entry_id", "") or ""),
        "label": str(payload.get("label", "") or ""),
        "notes": str(payload.get("notes", "") or ""),
        "setup": _normalize_driver_setup(payload.get("setup") or {}),
    }


def _uploaded_session_analysis_summary(analysis: dict) -> dict:
    drivers = analysis.get("drivers", []) or []
    if not drivers:
        return {
            "fastest_driver": "",
            "best_lap": None,
            "average_best_lap": None,
            "drivers": [],
            "sector_summary": [],
            "corner_summary": [],
        }
    sorted_drivers = sorted(
        [driver for driver in drivers if driver.get("best_lap") is not None],
        key=lambda item: item.get("best_lap", 999999),
    )
    fastest = sorted_drivers[0] if sorted_drivers else {}
    lap_values = [driver.get("best_lap") for driver in sorted_drivers if driver.get("best_lap") is not None]
    average_best = round(sum(lap_values) / len(lap_values), 3) if lap_values else None
    return {
        "fastest_driver": fastest.get("canonical_driver_name") or fastest.get("driver_name") or "",
        "best_lap": fastest.get("best_lap"),
        "average_best_lap": average_best,
        "drivers": [
            {
                "driver_id": driver.get("driver_id"),
                "driver_name": driver.get("canonical_driver_name") or driver.get("driver_name") or "",
                "best_lap": driver.get("best_lap"),
                "best_sector_sum": driver.get("best_sector_sum"),
                "lap_delta_to_fastest": driver.get("lap_delta_to_fastest"),
                "top_speed": driver.get("top_speed"),
            }
            for driver in drivers
        ],
        "sector_summary": _uploaded_session_sector_summary(analysis.get("sector_analysis") or []),
        "corner_summary": _uploaded_session_corner_summary(analysis.get("corner_analysis") or []),
    }


def _uploaded_session_sector_summary(sector_analysis: list[dict]) -> list[dict]:
    summary = []
    for sector in sector_analysis:
        drivers = []
        for item in sector.get("drivers") or []:
            drivers.append(
                {
                    "driver_id": item.get("driver_id"),
                    "driver_name": item.get("driver_name") or "",
                    "time": item.get("time"),
                    "delta_to_fastest": item.get("delta_to_fastest"),
                }
            )
        summary.append(
            {
                "sector_name": sector.get("sector_name") or "Sector",
                "fastest_driver": sector.get("fastest_driver") or "",
                "fastest_time": sector.get("fastest_time"),
                "drivers": drivers,
            }
        )
    return summary


def _uploaded_session_corner_summary(corner_analysis: list[dict]) -> list[dict]:
    summary = []
    for corner in corner_analysis:
        driver_metrics = []
        for item in corner.get("driver_metrics") or []:
            driver_metrics.append(
                {
                    "driver_id": item.get("driver_id"),
                    "driver_name": item.get("driver_name") or "",
                    "corner_time": item.get("corner_time"),
                    "entry_speed": item.get("entry_speed"),
                    "minimum_speed": item.get("minimum_speed"),
                    "exit_speed": item.get("exit_speed"),
                    "speed_drop": item.get("speed_drop"),
                }
            )
        best_corner_time = min(
            [item for item in driver_metrics if isinstance(item.get("corner_time"), (int, float))],
            key=lambda item: item["corner_time"],
            default=None,
        )
        best_minimum_speed = max(
            [item for item in driver_metrics if isinstance(item.get("minimum_speed"), (int, float))],
            key=lambda item: item["minimum_speed"],
            default=None,
        )
        best_exit_speed = max(
            [item for item in driver_metrics if isinstance(item.get("exit_speed"), (int, float))],
            key=lambda item: item["exit_speed"],
            default=None,
        )
        summary.append(
            {
                "corner_number": corner.get("corner_number"),
                "name": corner.get("name") or "Corner",
                "best_corner_time_driver": best_corner_time.get("driver_name") if best_corner_time else "",
                "best_corner_time": best_corner_time.get("corner_time") if best_corner_time else None,
                "best_minimum_speed_driver": best_minimum_speed.get("driver_name") if best_minimum_speed else "",
                "best_minimum_speed": best_minimum_speed.get("minimum_speed") if best_minimum_speed else None,
                "best_exit_speed_driver": best_exit_speed.get("driver_name") if best_exit_speed else "",
                "best_exit_speed": best_exit_speed.get("exit_speed") if best_exit_speed else None,
                "drivers": driver_metrics,
            }
        )
    return summary


def _migrate_test_session_setup_json(connection: sqlite3.Connection) -> None:
    columns = {row["name"] for row in connection.execute("PRAGMA table_info(test_session_drivers)").fetchall()}
    if "setup_json" not in columns:
        return

    rows = connection.execute(
        """
        SELECT test_session_id, driver_id, setup_json
        FROM test_session_drivers
        WHERE setup_json IS NOT NULL AND TRIM(setup_json) != '' AND setup_json != '{}'
        """
    ).fetchall()
    for row in rows:
        try:
            setup_payload = json.loads(row["setup_json"] or "{}")
        except json.JSONDecodeError:
            continue
        setup = _normalize_driver_setup(setup_payload)
        assignments = ", ".join(f"{field} = ?" for field in KART_SETUP_FIELDS)
        connection.execute(
            f"""
            UPDATE test_session_drivers
            SET {assignments}
            WHERE test_session_id = ? AND driver_id = ?
            """,
            (
                setup["front_sprocket"],
                setup["rear_sprocket"],
                setup["carb_jet"],
                setup["axle_length"],
                setup["axle_type"],
                setup["tyre_type"],
                setup["front_tyre_pressure"],
                setup["rear_tyre_pressure"],
                setup["torsion_bar_type"],
                setup["caster_type"],
                setup["ride_height"],
                row["test_session_id"],
                row["driver_id"],
            ),
        )


def _event_row(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise KeyError("event")
    return {
        "id": row["id"],
        "venue": row["venue"],
        "name": row["name"],
        "session_type": row["session_type"],
        "date": row["start_date"] or row["date"],
        "start_date": row["start_date"] or row["date"],
        "end_date": row["end_date"] or row["start_date"] or row["date"],
    }


def _track_row(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise KeyError("track")
    return {
        "id": row["id"],
        "name": row["name"],
        "venue": row["venue"],
        "postcode": row["postcode"],
        "address": json.loads(row["address_json"]),
        "googleQuery": row["google_query"],
        "officialUrl": row["official_url"],
        "sourceUrls": json.loads(row["source_urls_json"]),
        "layoutNotes": row["layout_notes"],
        "coachingFocus": json.loads(row["coaching_focus_json"]),
        "cornerNotes": json.loads(row["corner_notes_json"]),
        "setupNotes": json.loads(row["setup_notes_json"] or "[]"),
        "preferredSetupBaseline": _normalize_preferred_setup_baseline(json.loads(row["preferred_setup_baseline_json"] or "{}")),
        "cornerMarkerOffsets": json.loads(row["corner_marker_offsets_json"] or "{}"),
        "cornerDefinitions": json.loads(row["corner_definitions_json"] or "[]"),
        "aliases": json.loads(row["aliases_json"]),
    }


def _report_row(row: sqlite3.Row, include_reports: bool = False) -> dict:
    payload = {
        "id": row["id"],
        "session_id": row["session_id"],
        "audience": row["audience"],
        "provider": row["provider"],
        "model": row["model"],
        "status": row["status"],
        "visible_to_driver": bool(row["visible_to_driver"]),
        "visible_to_parent": bool(row["visible_to_parent"]),
        "review_note": row["review_note"] or "",
        "reviewed_at": row["reviewed_at"] or "",
        "published_at": row["published_at"] or "",
        "created_at": row["created_at"],
    }
    if include_reports:
        payload["reports"] = json.loads(row["reports_json"] or "[]")
    return payload


def _access_level_row(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise KeyError("access_level")
    return {
        "id": row["id"],
        "name": row["name"],
        "permissions": json.loads(row["permissions_json"] or "{}"),
    }


def _user_account_row(row: sqlite3.Row | None) -> dict:
    if row is None:
        raise KeyError("user_account")
    with _connect() as connection:
        assigned_driver_rows = connection.execute(
            """
            SELECT d.id, d.name, d.number, d.class_name, d.aliases_json, d.email
            FROM user_account_drivers uad
            JOIN drivers d ON d.id = uad.driver_id
            WHERE uad.user_account_id = ?
            ORDER BY d.name COLLATE NOCASE
            """,
            (row["id"],),
        ).fetchall()
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"] if "status" in row.keys() else "approved",
        "must_change_password": bool(row["must_change_password"]) if "must_change_password" in row.keys() else False,
        "approved_at": row["approved_at"] if "approved_at" in row.keys() else "",
        "temporary_password": bool(row["temporary_password"]) if "temporary_password" in row.keys() else False,
        "access_level_id": row["access_level_id"] or "",
        "access_level_name": row["access_level_name"] or "",
        "permissions": json.loads(row["permissions_json"] or "{}"),
        "linked_driver_id": row["linked_driver_id"] or "",
        "assigned_drivers": [_driver_row(driver_row) for driver_row in assigned_driver_rows],
    }


def _clean_aliases(aliases: list[str]) -> list[str]:
    unique_aliases = []
    seen = set()
    for alias in aliases:
        cleaned = str(alias).strip()
        if not cleaned:
            continue
        normalized = _normalize_driver_name(cleaned)
        if normalized in seen:
            continue
        seen.add(normalized)
        unique_aliases.append(cleaned)
    return unique_aliases


def _normalize_driver_name(value: str) -> str:
    return "".join(char for char in str(value).strip().lower() if char.isalnum())


def _sync_user_account_drivers(connection: sqlite3.Connection, account_id: str, driver_ids: list[str]) -> None:
    connection.execute("DELETE FROM user_account_drivers WHERE user_account_id = ?", (account_id,))
    for driver_id in driver_ids:
        connection.execute(
            """
            INSERT OR IGNORE INTO user_account_drivers (user_account_id, driver_id)
            VALUES (?, ?)
            """,
            (account_id, driver_id),
        )


def _sync_event_drivers(connection: sqlite3.Connection, event_id: str, driver_ids: list[str]) -> None:
    connection.execute("DELETE FROM event_drivers WHERE event_id = ?", (event_id,))
    for driver_id in driver_ids:
        connection.execute(
            """
            INSERT OR IGNORE INTO event_drivers (event_id, driver_id)
            VALUES (?, ?)
            """,
            (event_id, driver_id),
        )


def _filter_driver_ids_for_event(connection: sqlite3.Connection, event_id: str, driver_ids: list[str]) -> list[str]:
    if not event_id:
        return list(dict.fromkeys(driver_ids))
    rows = connection.execute(
        "SELECT driver_id FROM event_drivers WHERE event_id = ?",
        (event_id,),
    ).fetchall()
    allowed_driver_ids = {row["driver_id"] for row in rows}
    return [driver_id for driver_id in dict.fromkeys(driver_ids) if driver_id in allowed_driver_ids]
