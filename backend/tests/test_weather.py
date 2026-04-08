from __future__ import annotations

import unittest

from backend.app import weather


class WeatherFormattingTests(unittest.TestCase):
    def test_build_hourly_snapshot_filters_to_requested_day_and_formats_fields(self):
        hourly = {
            "time": ["2026-04-08T09:00", "2026-04-08T10:00", "2026-04-09T09:00"],
            "temperature_2m": [9.5, 11.2, 15.0],
            "precipitation_probability": [20, 40, 10],
            "precipitation": [0.1, 0.6, 0.0],
            "windspeed_10m": [14.0, 18.5, 12.0],
            "weathercode": [1, 63, 0],
        }

        snapshot = weather._build_hourly_snapshot(hourly, "2026-04-08")

        self.assertEqual(2, len(snapshot))
        self.assertEqual("09:00", snapshot[0]["hour"])
        self.assertEqual("Mostly clear", snapshot[0]["weather_label"])
        self.assertEqual("Rain", snapshot[1]["weather_label"])

    def test_format_summary_includes_temperature_rain_and_wind(self):
        summary = weather._format_summary(
            {
                "weather_label": "Rain",
                "temperature_min_c": 7.1,
                "temperature_max_c": 11.9,
                "rain_probability_pct": 76,
                "wind_kph": 18.2,
            }
        )

        self.assertEqual("Rain / 7C to 12C / 76% rain risk / 18 km/h wind", summary)


if __name__ == "__main__":
    unittest.main()
