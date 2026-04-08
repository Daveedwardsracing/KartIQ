from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from datetime import datetime


@dataclass
class ParsedSession:
    file_name: str
    driver_name: str
    rows: list[dict]
    headers: list[str]
    numeric_headers: list[str]
    metadata: dict


TELEMETRY_CHANNEL_ALIASES = {
    "gps_latitude": ["gps latitude", "latitude", "lat", "gps lat"],
    "gps_longitude": ["gps longitude", "longitude", "lon", "lng", "gps lon"],
    "speed": ["speed", "vehicle speed", "mph", "kph", "km/h"],
    "brake": ["brake", "brk", "brake pressure"],
    "throttle": ["throttle", "tps", "accelerator"],
    "rpm": ["rpm", "engine rpm"],
    "gear": ["gear"],
}


def parse_tsv_file(file_name: str, content: bytes) -> ParsedSession:
    raw_text = content.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(raw_text), delimiter="\t")
    headers = reader.fieldnames or []
    rows = [_typed_row(row) for row in reader if any((value or "").strip() for value in row.values())]
    numeric_headers = [header for header in headers if any(isinstance(row.get(header), (int, float)) for row in rows)]
    driver_name = _infer_driver_name(file_name, rows, headers)

    return ParsedSession(
        file_name=file_name,
        driver_name=driver_name,
        rows=rows,
        headers=headers,
        numeric_headers=numeric_headers,
        metadata={
            "session_type": _infer_session_type(file_name, rows, headers),
            "session_date": _infer_session_date(rows, headers),
            "track": _infer_track(file_name, rows, headers),
            "lap_count": _infer_lap_count(rows, headers),
            "telemetry_channels": _detect_telemetry_channels(headers),
            "trace_preview": _build_trace_preview(rows, headers),
        },
    )


def _typed_row(row: dict) -> dict:
    typed = {}
    for key, value in row.items():
      typed[key] = _typed_value(value)
    return typed


def _typed_value(value: str | None):
    if value is None:
        return ""
    text = value.strip()
    if not text:
        return ""
    normalized = text.replace(",", "")
    lowered = normalized.lower()
    if lowered in {"true", "yes", "y"}:
        return True
    if lowered in {"false", "no", "n"}:
        return False
    if normalized.replace(".", "", 1).replace("-", "", 1).isdigit():
        return float(normalized) if "." in normalized else int(normalized)
    return text


def _infer_driver_name(file_name: str, rows: list[dict], headers: list[str]) -> str:
    candidate = next((header for header in headers if any(fragment in header.lower() for fragment in ["driver", "competitor", "entrant"]) or header.lower() == "name"), None)
    if candidate and rows and rows[0].get(candidate):
        return str(rows[0][candidate])
    return file_name.rsplit(".", 1)[0]


def _infer_session_type(file_name: str, rows: list[dict], headers: list[str]) -> str:
    candidate = next((header for header in headers if any(fragment in header.lower() for fragment in ["session", "type", "run", "heat"])), None)
    if candidate and rows and rows[0].get(candidate):
        return str(rows[0][candidate])
    lower = file_name.lower()
    if "qual" in lower:
        return "Qualifying"
    if "race" in lower:
        return "Race"
    return "Practice"


def _infer_track(file_name: str, rows: list[dict], headers: list[str]) -> str:
    candidate = next((header for header in headers if any(fragment in header.lower() for fragment in ["track", "circuit", "venue"])), None)
    if candidate and rows and rows[0].get(candidate):
        return str(rows[0][candidate])
    parts = file_name.rsplit(".", 1)[0].replace("_", "-").split("-")
    return parts[1].strip() if len(parts) > 1 else "Unknown track"


def _infer_session_date(rows: list[dict], headers: list[str]) -> str:
    candidate = next((header for header in headers if any(fragment in header.lower() for fragment in ["date", "day"])), None)
    if not candidate or not rows:
        return ""
    value = str(rows[0].get(candidate, "")).strip()
    if not value:
        return ""
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            continue
    return value


def _infer_lap_count(rows: list[dict], headers: list[str]) -> int:
    lap_header = next((header for header in headers if header.lower() == "lap number" or "lap number" in header.lower()), None)
    if not lap_header:
        return len(rows)
    lap_numbers = {
        int(row[lap_header])
        for row in rows
        if isinstance(row.get(lap_header), (int, float)) and int(row[lap_header]) > 0
    }
    return len(lap_numbers) if lap_numbers else len(rows)


def _detect_telemetry_channels(headers: list[str]) -> dict:
    normalized_headers = [header.lower() for header in headers]
    detected = {}
    for channel, aliases in TELEMETRY_CHANNEL_ALIASES.items():
        detected[channel] = any(any(alias in header for alias in aliases) for header in normalized_headers)
    detected["gps"] = detected["gps_latitude"] and detected["gps_longitude"]
    return detected


def _build_trace_preview(rows: list[dict], headers: list[str]) -> dict:
    column_map = {}
    lower_headers = {header.lower(): header for header in headers}
    for channel, aliases in TELEMETRY_CHANNEL_ALIASES.items():
        matched = next((lower_headers[header] for header in lower_headers if any(alias in header for alias in aliases)), None)
        if matched:
            column_map[channel] = matched

    preview = {
        "sample_count": 0,
        "gps_points": [],
        "speed_points": [],
        "brake_points": [],
        "throttle_points": [],
    }
    if not rows:
        return preview

    sampled_rows = rows[: min(len(rows), 120)]
    for index, row in enumerate(sampled_rows):
        lat = row.get(column_map.get("gps_latitude", ""))
        lon = row.get(column_map.get("gps_longitude", ""))
        speed = row.get(column_map.get("speed", ""))
        brake = row.get(column_map.get("brake", ""))
        throttle = row.get(column_map.get("throttle", ""))
        if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
            preview["gps_points"].append({"index": index, "lat": float(lat), "lon": float(lon)})
        if isinstance(speed, (int, float)):
            preview["speed_points"].append({"index": index, "value": float(speed)})
        if isinstance(brake, (int, float)):
            preview["brake_points"].append({"index": index, "value": float(brake)})
        if isinstance(throttle, (int, float)):
            preview["throttle_points"].append({"index": index, "value": float(throttle)})

    preview["sample_count"] = len(sampled_rows)
    return preview
