from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.app import main, storage


class IsolatedDatabaseTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_root = Path(tempfile.mkdtemp(prefix="der-tests-"))
        self.patches = [
            patch.object(storage, "DATA_DIR", self.temp_root),
            patch.object(storage, "DATABASE_PATH", self.temp_root / "app.db"),
            patch.object(storage, "BACKUP_DIR", self.temp_root / "backups"),
            patch.object(storage, "LEGACY_STORE_PATH", self.temp_root / "store.json"),
        ]
        for item in self.patches:
            item.start()
        storage.init_database()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()


class BackendRegressionTests(IsolatedDatabaseTestCase):
    def test_app_settings_endpoint_masks_openai_key_and_preserves_existing_secret(self):
        storage.save_app_settings(
            {"openAiApiKey": "sk-test-123", "defaultLandingPage": "history"},
            email="dave@example.com",
        )

        with TestClient(main.app) as client:
            show_response = client.get("/settings/app", params={"email": "dave@example.com"})
            update_response = client.put(
                "/settings/app",
                json={
                    "email": "dave@example.com",
                    "settings": {
                        "openAiApiKey": "",
                        "defaultLandingPage": "reports",
                    },
                },
            )

        self.assertEqual(200, show_response.status_code)
        shown = show_response.json()["settings"]
        self.assertEqual("", shown["openAiApiKey"])
        self.assertTrue(shown["openAiApiKeyConfigured"])

        self.assertEqual(200, update_response.status_code)
        updated = update_response.json()["settings"]
        self.assertEqual("", updated["openAiApiKey"])
        self.assertTrue(updated["openAiApiKeyConfigured"])
        self.assertEqual("reports", updated["defaultLandingPage"])

        stored = storage.get_app_settings_with_secrets(email="dave@example.com")
        self.assertEqual("sk-test-123", stored["openAiApiKey"])
        self.assertEqual("reports", stored["defaultLandingPage"])

    def test_setup_database_endpoint_derives_setup_records_and_scoring(self):
        track_name = storage.list_tracks()[0]["name"]
        driver = storage.create_driver("Josh Robinson", "23", "Junior Rotax", ["JROB"], "josh@example.com", "secret123")
        session = storage.create_test_session(
            name="Morning Practice",
            venue=track_name,
            session_type="Practice",
            date="2026-04-08",
            start_time="09:30",
            end_time="09:45",
            event_id="",
            status="planned",
            weather="Cold and dry",
            track_condition="Dry",
            tyre_condition="New",
            mechanic_notes="Rear looked planted",
            coach_notes="Strong Turn 1 exit",
            driver_ids=[driver["id"]],
            driver_setups={
                driver["id"]: {
                    "rear_sprocket": "80",
                    "front_tyre_pressure": "11.0",
                    "rear_tyre_pressure": "10.5",
                }
            },
        )
        storage.save_uploaded_session(
            event_name=track_name,
            event_round="R1",
            session_type="Practice",
            test_session_id=session["id"],
            analysis={
                "sector_summary": [{"sector_name": "Sector 1", "fastest_driver": "Josh Robinson"}],
                "corner_summary": [{"name": "Turn 1", "summary": "Strong exit"}],
                "drivers": [
                    {
                        "driver_id": driver["id"],
                        "driver_name": "Josh Robinson",
                        "best_lap": 58.321,
                        "best_sector_sum": 57.9,
                        "lap_delta_to_fastest": 0.0,
                        "top_speed": 71.4,
                    }
                ],
            },
            validation={"ready": True},
            uploaded_files=[{"name": "josh.tsv"}],
        )

        with TestClient(main.app) as client:
            response = client.get("/setup-database")

        self.assertEqual(200, response.status_code)
        payload = response.json()["setup_database"]
        self.assertEqual(1, payload["total_tracks"])
        self.assertEqual(1, payload["total_entries"])
        track = payload["tracks"][0]
        entry = track["entries"][0]
        self.assertEqual("80", entry["setup"]["rear_sprocket"])
        self.assertIn("Best lap leader", entry["outcome_badges"])
        self.assertEqual("80", track["recommended_baseline"]["setup"]["rear_sprocket"])

    def test_weather_refresh_route_saves_mocked_forecast_snapshot(self):
        track_name = storage.list_tracks()[0]["name"]
        driver = storage.create_driver("Ody Hole", "11", "Junior Rotax", [], "ody@example.com", "secret123")
        session = storage.create_test_session(
            name="Short Session",
            venue=track_name,
            session_type="Practice",
            date="2026-04-08",
            start_time="09:30",
            end_time="09:45",
            event_id="",
            status="planned",
            weather="",
            track_condition="Dry",
            tyre_condition="Used",
            mechanic_notes="",
            coach_notes="",
            driver_ids=[driver["id"]],
            driver_setups={},
        )

        mocked_forecast = {
            "summary": "Rain / 7C to 12C / 76% rain risk / 18 km/h wind",
            "forecast_date": "2026-04-08",
            "hourly_forecast": [{"hour": "09:00", "weather_label": "Rain"}],
            "session_start_time": "09:30",
            "session_end_time": "09:45",
        }

        with patch.object(main, "fetch_weather_forecast", AsyncMock(return_value=mocked_forecast)):
            with TestClient(main.app) as client:
                response = client.post(f"/test-sessions/{session['id']}/weather-refresh")

        self.assertEqual(200, response.status_code)
        payload = response.json()["test_session"]
        self.assertEqual(mocked_forecast["summary"], payload["weather"])
        self.assertEqual("Rain", payload["weather_forecast"]["hourly_forecast"][0]["weather_label"])

    def test_auth_login_accepts_approved_user_account(self):
        storage.create_user_account(
            name="Dave Edwards",
            email="dave@example.com",
            password="supersecret",
            role="admin",
            access_level_id="",
            linked_driver_id="",
            assigned_driver_ids=[],
            status="approved",
            must_change_password=False,
            temporary_password=False,
        )

        with TestClient(main.app) as client:
            response = client.post(
                "/auth/login",
                json={"email": "dave@example.com", "password": "supersecret"},
            )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual("admin", payload["role"])
        self.assertEqual("approved", payload["account_status"])
        self.assertTrue(payload["user_account_id"].startswith("usr-"))

    def test_tracks_update_persists_setup_notes_and_preferred_baseline(self):
        track = storage.list_tracks()[0]

        with TestClient(main.app) as client:
            response = client.put(
                f"/tracks/{track['id']}",
                json={
                    "layout_notes": "Fast and flowing.",
                    "coaching_focus": ["Commit to Turn 1"],
                    "corner_notes": ["Late apex at Turn 1"],
                    "corner_definitions": [],
                    "corner_marker_offsets": {"corner-1": 0.0125},
                    "setup_notes": [
                        {"label": "Wet fallback", "note": "Raise rear pressure slightly."},
                        {"label": "Cold morning", "note": "Let pressures build carefully."},
                    ],
                    "preferred_setup_baseline": {
                        "entry_id": "entry-123",
                        "label": "Pinned PF baseline",
                        "notes": "Use for cool dry starts.",
                        "setup": {"rear_sprocket": "80", "front_tyre_pressure": "11.0"},
                    },
                },
            )

        self.assertEqual(200, response.status_code)
        payload = response.json()
        self.assertEqual("Fast and flowing.", payload["layoutNotes"])
        self.assertEqual(2, len(payload["setupNotes"]))
        self.assertEqual("Wet fallback", payload["setupNotes"][0]["label"])
        self.assertEqual("Pinned PF baseline", payload["preferredSetupBaseline"]["label"])
        self.assertEqual("80", payload["preferredSetupBaseline"]["setup"]["rear_sprocket"])

    def test_report_publish_endpoint_sets_review_and_publish_metadata(self):
        report_id = storage.save_generated_report(
            session_id=None,
            audience="driver",
            provider="openai",
            model="gpt-test",
            reports=[
                {
                    "driver_name": "Josh Robinson",
                    "overall_summary": "Strong session.",
                    "action_points": ["Carry more minimum speed at Turn 1."],
                }
            ],
        )

        with TestClient(main.app) as client:
            reviewed_response = client.put(
                f"/reports/{report_id}/publish",
                json={
                    "status": "reviewed",
                    "visible_to_driver": False,
                    "visible_to_parent": False,
                    "review_note": "Ready to share after one more pass.",
                },
            )
            published_response = client.put(
                f"/reports/{report_id}/publish",
                json={
                    "status": "published",
                    "visible_to_driver": True,
                    "visible_to_parent": False,
                    "review_note": "Approved for driver portal.",
                },
            )

        self.assertEqual(200, reviewed_response.status_code)
        reviewed = reviewed_response.json()["report"]
        self.assertEqual("reviewed", reviewed["status"])
        self.assertEqual("Ready to share after one more pass.", reviewed["review_note"])
        self.assertTrue(reviewed["reviewed_at"])
        self.assertEqual("", reviewed["published_at"])

        self.assertEqual(200, published_response.status_code)
        published = published_response.json()["report"]
        self.assertEqual("published", published["status"])
        self.assertTrue(published["visible_to_driver"])
        self.assertFalse(published["visible_to_parent"])
        self.assertEqual("Approved for driver portal.", published["review_note"])
        self.assertTrue(published["reviewed_at"])
        self.assertTrue(published["published_at"])


if __name__ == "__main__":
    unittest.main()
