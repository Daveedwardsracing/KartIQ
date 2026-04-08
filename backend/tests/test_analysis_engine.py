from __future__ import annotations

import unittest

from backend.app import analysis
from backend.app.parser import ParsedSession


class AnalysisEngineTests(unittest.TestCase):
    def test_classify_lap_records_recovers_only_least_bad_lap_when_every_lap_is_flagged(self):
        classified = analysis._classify_lap_records(
            [
                {"lap_number": 1, "lap_time": 51.2, "sample_count": 12, "invalid_true_count": 1},
                {"lap_number": 2, "lap_time": 49.8, "sample_count": 12, "invalid_true_count": 1},
                {"lap_number": 3, "lap_time": 52.6, "sample_count": 12, "invalid_true_count": 1},
            ]
        )

        valid_laps = [item for item in classified if item["is_valid_for_analysis"]]
        self.assertEqual(1, len(valid_laps))
        self.assertEqual(2, valid_laps[0]["lap_number"])

    def test_extract_lap_traces_drops_stale_speed_samples_instead_of_smearing_old_values(self):
        rows = []
        for index in range(30):
            row = {
                "Session Time": round(index * 0.1, 3),
                "Lap Number": 1,
                "GPS Latitude": 52.0 + (index * 0.00012),
                "GPS Longitude": -0.1 + (index * 0.00012),
            }
            if index < 12:
                row["Speed"] = 90 + index
            rows.append(row)

        session = ParsedSession(
            file_name="trace.tsv",
            driver_name="Test Driver",
            rows=rows,
            headers=["Session Time", "Lap Number", "GPS Latitude", "GPS Longitude", "Speed"],
            numeric_headers=["Session Time", "Lap Number", "GPS Latitude", "GPS Longitude", "Speed"],
            metadata={},
        )

        traces = analysis._extract_lap_traces(session, [{"lap_number": 1, "lap_time": 52.1}])

        self.assertEqual(1, len(traces))
        trace = traces[0]["trace"]
        self.assertIsNotNone(trace[2]["speed"])
        stale_point = next(point for point in trace if point["time"] >= 1.8)
        self.assertIsNone(stale_point["speed"])

    def test_infer_brake_start_prefers_sustained_deceleration_point(self):
        points = [
            {"normalized_distance": 0.10, "speed": 100.0},
            {"normalized_distance": 0.18, "speed": 100.0},
            {"normalized_distance": 0.26, "speed": 99.0},
            {"normalized_distance": 0.34, "speed": 98.0},
            {"normalized_distance": 0.42, "speed": 96.0},
            {"normalized_distance": 0.50, "speed": 93.0},
            {"normalized_distance": 0.58, "speed": 90.0},
            {"normalized_distance": 0.66, "speed": 88.0},
            {"normalized_distance": 0.74, "speed": 86.0},
            {"normalized_distance": 0.82, "speed": 85.0},
        ]

        brake_start = analysis._infer_brake_start(points, points[-1])

        self.assertEqual(0.5, brake_start)

    def test_classify_lap_records_flags_obvious_first_and_last_laps_as_out_and_in_laps(self):
        classified = analysis._classify_lap_records(
            [
                {"lap_number": 1, "lap_time": 75.0, "sample_count": 4, "invalid_true_count": 0},
                {"lap_number": 2, "lap_time": 58.4, "sample_count": 16, "invalid_true_count": 0},
                {"lap_number": 3, "lap_time": 58.1, "sample_count": 16, "invalid_true_count": 0},
                {"lap_number": 4, "lap_time": 58.7, "sample_count": 15, "invalid_true_count": 0},
                {"lap_number": 5, "lap_time": 73.5, "sample_count": 4, "invalid_true_count": 0},
            ]
        )

        by_lap = {item["lap_number"]: item for item in classified}
        self.assertIn("out_lap", by_lap[1]["quality_flags"])
        self.assertIn("in_lap", by_lap[5]["quality_flags"])
        self.assertFalse(by_lap[1]["is_valid_for_analysis"])
        self.assertFalse(by_lap[5]["is_valid_for_analysis"])
        self.assertTrue(by_lap[2]["is_valid_for_analysis"])
        self.assertTrue(by_lap[3]["is_valid_for_analysis"])


if __name__ == "__main__":
    unittest.main()
