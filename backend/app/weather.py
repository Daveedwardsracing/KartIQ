from __future__ import annotations

from datetime import datetime, timezone

import httpx

from .storage import find_track_by_name


WEATHER_CODE_LABELS = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Light freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Light snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail",
}


def _weather_code_label(code: int | None) -> str:
    return WEATHER_CODE_LABELS.get(int(code or 0), "Forecast available")


def _build_location_query(venue: str) -> str:
    track = find_track_by_name(venue)
    if track:
        postcode = track.get("postcode") or ""
        if postcode:
            return postcode
        address = track.get("address") or []
        return ", ".join([track.get("venue", ""), *address]).strip(", ")
    return venue


def _build_track_context(venue: str) -> dict | None:
    return find_track_by_name(venue)


def _format_summary(snapshot: dict) -> str:
    parts = [snapshot.get("weather_label") or "Forecast"]
    temp_min = snapshot.get("temperature_min_c")
    temp_max = snapshot.get("temperature_max_c")
    if temp_min is not None and temp_max is not None:
        parts.append(f"{temp_min:.0f}C to {temp_max:.0f}C")
    rain_probability = snapshot.get("rain_probability_pct")
    if rain_probability is not None:
        parts.append(f"{rain_probability:.0f}% rain risk")
    wind_kph = snapshot.get("wind_kph")
    if wind_kph is not None:
        parts.append(f"{wind_kph:.0f} km/h wind")
    return " / ".join(parts)


def _build_hourly_snapshot(hourly: dict, normalized_date: str) -> list[dict]:
    times = hourly.get("time") or []
    temperatures = hourly.get("temperature_2m") or []
    rain_probabilities = hourly.get("precipitation_probability") or []
    precipitation = hourly.get("precipitation") or []
    wind_speeds = hourly.get("windspeed_10m") or []
    weather_codes = hourly.get("weathercode") or []

    points = []
    for index, time_key in enumerate(times):
        if not str(time_key).startswith(f"{normalized_date}T"):
            continue
        hour_label = str(time_key).split("T", 1)[1][:5]
        points.append(
            {
                "time": time_key,
                "hour": hour_label,
                "temperature_c": temperatures[index] if index < len(temperatures) else None,
                "rain_probability_pct": rain_probabilities[index] if index < len(rain_probabilities) else None,
                "precipitation_mm": precipitation[index] if index < len(precipitation) else None,
                "wind_kph": wind_speeds[index] if index < len(wind_speeds) else None,
                "weather_code": weather_codes[index] if index < len(weather_codes) else None,
                "weather_label": _weather_code_label(weather_codes[index] if index < len(weather_codes) else None),
            }
        )
    return points


async def fetch_weather_forecast(venue: str, session_date: str) -> dict:
    normalized_venue = (venue or "").strip()
    normalized_date = (session_date or "").strip()
    if not normalized_venue:
        raise RuntimeError("A venue is required before a forecast can be loaded.")
    if not normalized_date:
        raise RuntimeError("A planned session date is required before a forecast can be loaded.")

    datetime.strptime(normalized_date, "%Y-%m-%d")
    location_query = _build_location_query(normalized_venue)
    track = _build_track_context(normalized_venue)

    async with httpx.AsyncClient(timeout=20.0) as client:
        geo_response = await client.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": location_query,
                "count": 1,
                "format": "jsonv2",
                "limit": 1,
            },
            headers={"User-Agent": "DER-Telemetry-Analysis-Software/1.0"},
        )
        geo_response.raise_for_status()
        geo_payload = geo_response.json()
        results = geo_payload if isinstance(geo_payload, list) else []
        if not results:
            raise RuntimeError(f"No forecast location match was found for {normalized_venue}.")
        location = results[0]

        forecast_response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": float(location.get("lat")),
                "longitude": float(location.get("lon")),
                "daily": ",".join(
                    [
                        "weathercode",
                        "temperature_2m_max",
                        "temperature_2m_min",
                        "precipitation_probability_max",
                        "precipitation_sum",
                        "windspeed_10m_max",
                    ]
                ),
                "hourly": ",".join(
                    [
                        "temperature_2m",
                        "precipitation_probability",
                        "precipitation",
                        "windspeed_10m",
                        "weathercode",
                    ]
                ),
                "timezone": "auto",
                "start_date": normalized_date,
                "end_date": normalized_date,
            },
        )
        forecast_response.raise_for_status()
        forecast_payload = forecast_response.json()

    daily = forecast_payload.get("daily") or {}
    hourly = forecast_payload.get("hourly") or {}
    dates = daily.get("time") or []
    if normalized_date not in dates:
        raise RuntimeError("The weather provider does not have a forecast for that date yet.")
    index = dates.index(normalized_date)
    snapshot = {
        "provider": "open-meteo",
        "lookup_query": location_query,
        "forecast_date": normalized_date,
        "location_name": location.get("display_name") or normalized_venue,
        "location_admin": ", ".join(
            [part for part in [location.get("display_name"), location.get("type")] if part]
        ),
        "latitude": float(location.get("lat")),
        "longitude": float(location.get("lon")),
        "weather_code": (daily.get("weathercode") or [None])[index],
        "temperature_max_c": (daily.get("temperature_2m_max") or [None])[index],
        "temperature_min_c": (daily.get("temperature_2m_min") or [None])[index],
        "rain_probability_pct": (daily.get("precipitation_probability_max") or [None])[index],
        "precipitation_mm": (daily.get("precipitation_sum") or [None])[index],
        "wind_kph": (daily.get("windspeed_10m_max") or [None])[index],
        "hourly_forecast": _build_hourly_snapshot(hourly, normalized_date),
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "track_name": track.get("name") if track else normalized_venue,
        "track_venue": track.get("venue") if track else normalized_venue,
    }
    snapshot["weather_label"] = _weather_code_label(snapshot["weather_code"])
    snapshot["summary"] = _format_summary(snapshot)
    return snapshot
