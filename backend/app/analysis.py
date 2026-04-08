from __future__ import annotations

import math
from statistics import mean, pstdev

from .parser import ParsedSession
from .storage import find_track_by_name


def build_analysis(sessions: list[ParsedSession], event_name: str, event_round: str, session_type: str) -> dict:
    driver_rows = [analyse_session(session) for session in sessions]
    ranked = sorted(driver_rows, key=lambda item: item["best_lap_seconds"] or float("inf"))
    track = find_track_by_name(event_name)

    for index, driver in enumerate(ranked, start=1):
        driver["session_rank"] = index
        if ranked[0]["best_lap_seconds"] and driver["best_lap_seconds"]:
            driver["lap_delta_to_fastest"] = round(driver["best_lap_seconds"] - ranked[0]["best_lap_seconds"], 3)
        else:
            driver["lap_delta_to_fastest"] = None

    return {
        "event_name": event_name,
        "event_round": event_round,
        "session_type": session_type,
        "telemetry_readiness": _build_telemetry_readiness(ranked),
        "overlay_bounds": _build_overlay_bounds(ranked),
        "corner_analysis": _build_corner_analysis(ranked, track),
        "sector_analysis": _build_sector_analysis(ranked, track),
        "track_context": {
            "track_id": track.get("id") if track else "",
            "track_name": track.get("name") if track else event_name,
            "corner_definitions": track.get("cornerDefinitions", []) if track else [],
        },
        "summary": {
            "fastest_driver": ranked[0]["driver_name"] if ranked else "N/A",
            "best_lap_time": ranked[0]["best_lap"] if ranked else "N/A",
            "driver_count": len(ranked),
            "session_type": session_type,
        },
        "drivers": ranked,
    }


def analyse_session(session: ParsedSession) -> dict:
    raw_lap_records = _extract_lap_records(session)
    lap_records = _merge_lap_channel_metrics(
        [record for record in raw_lap_records if record.get("is_valid_for_analysis")],
        _extract_lap_channel_metrics(session),
    )
    lap_times = [item["lap_time"] for item in lap_records]
    lap_traces = _extract_lap_traces(session, lap_records)
    trace_analysis = _extract_best_lap_trace(lap_traces, lap_records)
    best_lap_seconds = min(lap_times) if lap_times else None
    best_three_average = round(mean(sorted(lap_times)[:3]), 3) if len(lap_times) >= 3 else round(mean(lap_times), 3) if lap_times else None
    consistency = round(pstdev(lap_times), 3) if len(lap_times) > 1 else 0.0
    sectors = _sector_summary(session.rows, session.headers)
    channel_summary = _channel_summary(session.rows, session.headers)
    best_sector_sum = round(sum(sector["best"] for sector in sectors), 3) if sectors else None
    average_of_best_3_speed = _average_best_values(session.rows, session.headers, ["speed"], take=3)
    average_of_best_3_throttle = _average_best_values(session.rows, session.headers, ["throttle"], take=3)
    average_of_best_3_brake = _average_best_values(session.rows, session.headers, ["brake"], take=3)
    rpm_extremes = _min_max_for_selected_headers(session.rows, [_preferred_rpm_header(session.headers)])
    gear_extremes = _min_max_for(session.rows, session.headers, ["gear"])
    top_speed = _max_lap_metric(lap_records, "top_speed")
    max_rpm = _max_lap_metric(lap_records, "max_rpm")
    minimum_corner_speed = channel_summary.get("minimum_corner_speed")
    throttle_brake_overlap = _throttle_brake_overlap(channel_summary)
    valid_lap_count = _count_truthy_flags(session.rows, session.headers, ["valid", "lap valid"])
    invalid_lap_count = _count_truthy_flags(session.rows, session.headers, ["invalid"])
    excluded_laps = [
        {
            "lap_number": item.get("lap_number"),
            "lap_time": item.get("lap_time"),
            "quality_flags": item.get("quality_flags", []),
        }
        for item in raw_lap_records
        if not item.get("is_valid_for_analysis")
    ]

    return {
        "driver_name": session.driver_name,
        "file_name": session.file_name,
        "detected_track": session.metadata["track"],
        "session_date": session.metadata["session_date"],
        "detected_session_type": session.metadata["session_type"],
        "lap_count": len(lap_records) or session.metadata["lap_count"],
        "raw_lap_count": len(raw_lap_records) or session.metadata["lap_count"],
        "excluded_lap_count": len(excluded_laps),
        "excluded_laps": excluded_laps,
        "telemetry_channels": session.metadata.get("telemetry_channels", {}),
        "trace_preview": session.metadata.get("trace_preview", {}),
        "lap_traces": lap_traces,
        "best_lap_trace": trace_analysis["trace"],
        "best_lap_trace_meta": trace_analysis["meta"],
        "trace_bounds": _trace_bounds(trace_analysis["trace"]),
        "uploaded_for_driver_id": session.metadata.get("uploaded_driver_id"),
        "best_lap": best_lap_seconds,
        "best_lap_seconds": best_lap_seconds,
        "best_three_average": best_three_average,
        "best_sector_sum": best_sector_sum,
        "consistency": consistency,
        "top_speed": top_speed,
        "max_rpm": max_rpm,
        "sector_comparison": sectors,
        "lap_table": lap_records[:20] if lap_records else _lap_table(session.rows, lap_times),
        "lap_table_all": raw_lap_records[:30],
        "channel_summary": channel_summary,
        "average_best_3_speed": average_of_best_3_speed,
        "average_best_3_throttle": average_of_best_3_throttle,
        "average_best_3_brake": average_of_best_3_brake,
        "rpm_extremes": rpm_extremes,
        "gear_extremes": gear_extremes,
        "minimum_corner_speed": minimum_corner_speed,
        "throttle_brake_overlap": throttle_brake_overlap,
        "valid_lap_count": valid_lap_count,
        "invalid_lap_count": invalid_lap_count,
        "time_loss_hint": _time_loss_hint(sectors, channel_summary),
        "session_rank": None,
}


def _build_sector_analysis(drivers: list[dict], track: dict | None) -> list[dict]:
    if not drivers:
        return []
    sector_windows = _sector_windows(track)
    rows = []
    for sector in sector_windows:
        driver_rows = []
        for driver in drivers:
            sector_time = _trace_window_time(driver.get("best_lap_trace") or [], sector["start_pct"], sector["end_pct"])
            driver_rows.append(
                {
                    "driver_id": driver.get("driver_id"),
                    "driver_name": driver.get("canonical_driver_name") or driver.get("driver_name"),
                    "time": sector_time,
                }
            )
        valid = [item for item in driver_rows if item["time"] is not None]
        fastest = min(valid, key=lambda item: item["time"]) if valid else None
        for item in driver_rows:
            item["delta_to_fastest"] = round(item["time"] - fastest["time"], 3) if fastest and item["time"] is not None else None
        rows.append(
            {
                "sector_name": sector["name"],
                "start_pct": sector["start_pct"],
                "end_pct": sector["end_pct"],
                "fastest_driver": fastest["driver_name"] if fastest else "",
                "fastest_time": round(fastest["time"], 3) if fastest and fastest["time"] is not None else None,
                "drivers": driver_rows,
            }
        )
    return rows


def _build_corner_analysis(drivers: list[dict], track: dict | None) -> list[dict]:
    definitions = _corner_definitions(track)
    if definitions:
        corners = []
        for index, definition in enumerate(definitions, start=1):
            apex_pct = definition.get("apex_pct")
            if apex_pct is None:
                start_pct = definition.get("start_pct")
                end_pct = definition.get("end_pct")
                apex_pct = round(((start_pct or 0) + (end_pct or 0)) / 2, 6) if start_pct is not None and end_pct is not None else None
            if apex_pct is None:
                continue
            reference_driver = min(
                [driver for driver in drivers if driver.get("best_lap_seconds") is not None],
                key=lambda item: item["best_lap_seconds"],
                default=None,
            )
            reference_metric = _extract_corner_metric_from_pct(reference_driver, apex_pct) if reference_driver else None
            driver_metrics = [
                item for item in (
                    _extract_corner_metric_from_pct(driver, apex_pct)
                    for driver in drivers
                ) if item
            ]
            summary = _corner_summary_text(driver_metrics)
            corners.append(
                {
                    "corner_number": index,
                    "name": definition.get("name") or f"Corner {index}",
                    "sector_name": definition.get("sector_name", ""),
                    "section_type": definition.get("section_type", ""),
                    "start_pct": definition.get("start_pct"),
                    "end_pct": definition.get("end_pct"),
                    "reference_distance": apex_pct,
                    "reference_minimum_speed": reference_metric.get("minimum_speed") if reference_metric else None,
                    "driver_metrics": driver_metrics,
                    "summary": summary,
                }
            )
        if corners:
            return corners
    return _infer_corner_analysis(drivers)


def _corner_summary_text(driver_metrics: list[dict]) -> str:
    if not driver_metrics:
        return ""
    brake_leader = max(
        [item for item in driver_metrics if item.get("brake_start_distance") is not None],
        key=lambda item: item["brake_start_distance"],
        default=None,
    )
    min_speed_leader = max(
        [item for item in driver_metrics if item.get("minimum_speed") is not None],
        key=lambda item: item["minimum_speed"],
        default=None,
    )
    parts = []
    if brake_leader:
        parts.append(f"{brake_leader['driver_name']} brakes latest")
    if min_speed_leader:
        parts.append(f"{min_speed_leader['driver_name']} carries the best minimum speed")
    return ". ".join(parts) + "." if parts else ""


def _sector_windows(track: dict | None) -> list[dict]:
    definitions = _corner_definitions(track)
    if definitions:
        grouped: dict[str, dict] = {}
        for definition in definitions:
            sector_name = definition.get("sector_name") or "Sector"
            start_pct = definition.get("start_pct")
            end_pct = definition.get("end_pct")
            if start_pct is None or end_pct is None:
                continue
            group = grouped.setdefault(sector_name, {"name": sector_name, "start_pct": start_pct, "end_pct": end_pct})
            group["start_pct"] = min(group["start_pct"], start_pct)
            group["end_pct"] = max(group["end_pct"], end_pct)
        if grouped:
            ordered = sorted(grouped.values(), key=lambda item: item["start_pct"])
            normalized = []
            for index, item in enumerate(ordered):
                previous = ordered[index - 1] if index > 0 else None
                following = ordered[index + 1] if index < len(ordered) - 1 else None
                start_pct = float(item["start_pct"])
                end_pct = float(item["end_pct"])
                if previous is None:
                    start_pct = 0.0
                else:
                    gap_start = float(previous["end_pct"])
                    if start_pct > gap_start:
                        start_pct = round((gap_start + start_pct) / 2, 6)
                if following is None:
                    end_pct = 1.0
                else:
                    gap_end = float(following["start_pct"])
                    if end_pct < gap_end:
                        end_pct = round((end_pct + gap_end) / 2, 6)
                if normalized:
                    start_pct = max(start_pct, normalized[-1]["end_pct"])
                end_pct = max(end_pct, start_pct)
                normalized.append(
                    {
                        "name": item["name"],
                        "start_pct": round(max(0.0, start_pct), 6),
                        "end_pct": round(min(1.0, end_pct), 6),
                    }
                )
            if normalized:
                normalized[0]["start_pct"] = 0.0
                normalized[-1]["end_pct"] = 1.0
            return normalized
    return [
        {"name": "Sector 1", "start_pct": 0.0, "end_pct": 0.333333},
        {"name": "Sector 2", "start_pct": 0.333333, "end_pct": 0.666667},
        {"name": "Sector 3", "start_pct": 0.666667, "end_pct": 1.0},
    ]


def _corner_definitions(track: dict | None) -> list[dict]:
    return sorted(track.get("cornerDefinitions", []), key=lambda item: item.get("sequence", 0)) if track else []


def _trace_window_time(trace: list[dict], start_pct: float, end_pct: float) -> float | None:
    start_elapsed = _interpolate_trace_elapsed(trace, start_pct)
    end_elapsed = _interpolate_trace_elapsed(trace, end_pct)
    if start_elapsed is None or end_elapsed is None:
        return None
    return round(max(0.0, end_elapsed - start_elapsed), 3)


def _interpolate_trace_elapsed(trace: list[dict], target_pct: float) -> float | None:
    points = [point for point in trace if point.get("normalized_distance") is not None and point.get("elapsed") is not None]
    if not points:
        return None
    if target_pct <= points[0]["normalized_distance"]:
        return float(points[0]["elapsed"])
    for index in range(1, len(points)):
        left = points[index - 1]
        right = points[index]
        left_pct = left["normalized_distance"]
        right_pct = right["normalized_distance"]
        if left_pct <= target_pct <= right_pct:
            if math.isclose(right_pct, left_pct):
                return float(right["elapsed"])
            ratio = (target_pct - left_pct) / (right_pct - left_pct)
            return round(float(left["elapsed"]) + ((float(right["elapsed"]) - float(left["elapsed"])) * ratio), 4)
    return float(points[-1]["elapsed"])


def _build_telemetry_readiness(drivers: list[dict]) -> dict:
    def channel_ready(channel: str) -> bool:
        return any(driver.get("telemetry_channels", {}).get(channel) for driver in drivers)

    gps_ready = any(driver.get("telemetry_channels", {}).get("gps") for driver in drivers)
    return {
        "gps": gps_ready,
        "speed": channel_ready("speed"),
        "brake": channel_ready("brake"),
        "throttle": channel_ready("throttle"),
        "rpm": channel_ready("rpm"),
        "gear": channel_ready("gear"),
        "inferred_braking": channel_ready("speed"),
    }


def _extract_numeric_times(rows: list[dict], headers: list[str], candidate_names: list[str]) -> list[float]:
    header = next((h for h in headers if any(name in h.lower() for name in candidate_names)), None)
    if not header:
        return []
    values = []
    for row in rows:
        parsed = _parse_time(row.get(header))
        if parsed is not None:
            values.append(parsed)
    return values


def _extract_lap_records(session: ParsedSession) -> list[dict]:
    lap_header = next((header for header in session.headers if "lap number" in header.lower()), None)
    lap_time_header = next((header for header in session.headers if header.lower() == "lap time" or "lap time" in header.lower()), None)
    if not lap_header or not lap_time_header:
        fallback_times = _extract_numeric_times(session.rows, session.headers, ["best lap", "lap time", "laptime"])
        return _classify_lap_records(
            [{"lap_number": index + 1, "lap_time": round(lap_time, 3)} for index, lap_time in enumerate(fallback_times)]
        )

    lap_time_map: dict[int, dict] = {}
    valid_header = _match_header(session.headers, ["lap valid", "valid lap", "valid"])
    invalid_header = _match_header(session.headers, ["lap invalid", "invalid"])
    session_time_header = _match_header(session.headers, ["session time"]) or _match_header(session.headers, ["time"])
    for row in session.rows:
        lap_value = row.get(lap_header)
        raw_lap_time = row.get(lap_time_header)
        if not isinstance(lap_value, (int, float)) or int(lap_value) <= 0:
            continue
        normalized_lap_time = _normalize_time_seconds(raw_lap_time)
        if normalized_lap_time is None:
            continue
        lap_number = int(lap_value)
        metric = lap_time_map.setdefault(
            lap_number,
            {
                "lap_number": lap_number,
                "lap_time": None,
                "sample_count": 0,
                "timed_sample_count": 0,
                "valid_true_count": 0,
                "invalid_true_count": 0,
                "start_time": None,
                "end_time": None,
            },
        )
        metric["sample_count"] += 1
        metric["timed_sample_count"] += 1
        if metric["lap_time"] is None or normalized_lap_time > metric["lap_time"]:
            metric["lap_time"] = normalized_lap_time

        if valid_header and _is_truthy_flag(row.get(valid_header)):
            metric["valid_true_count"] += 1
        if invalid_header and _is_truthy_flag(row.get(invalid_header)):
            metric["invalid_true_count"] += 1
        if session_time_header:
            session_time = _normalize_time_seconds(row.get(session_time_header))
            if session_time is not None:
                metric["start_time"] = session_time if metric["start_time"] is None else min(metric["start_time"], session_time)
                metric["end_time"] = session_time if metric["end_time"] is None else max(metric["end_time"], session_time)

    lap_records = [
        {
            "lap_number": lap_number,
            "lap_time": round(metric["lap_time"], 3),
            "sample_count": metric["sample_count"],
            "timed_sample_count": metric["timed_sample_count"],
            "valid_true_count": metric["valid_true_count"],
            "invalid_true_count": metric["invalid_true_count"],
            "elapsed_window": round(metric["end_time"] - metric["start_time"], 3)
            if metric["start_time"] is not None and metric["end_time"] is not None and metric["end_time"] >= metric["start_time"]
            else None,
        }
        for lap_number, metric in sorted(lap_time_map.items())
        if metric["lap_time"] is not None
    ]
    return _classify_lap_records(lap_records)


def _extract_lap_channel_metrics(session: ParsedSession) -> dict[int, dict]:
    lap_header = _match_header(session.headers, ["lap number"])
    speed_header = _preferred_speed_header(session.headers)
    rpm_header = _preferred_rpm_header(session.headers)
    if not lap_header:
        return {}

    metrics_by_lap: dict[int, dict] = {}
    for row in session.rows:
        lap_value = row.get(lap_header)
        if not isinstance(lap_value, (int, float)):
            continue
        lap_number = int(lap_value)
        if lap_number <= 0:
            continue
        metric = metrics_by_lap.setdefault(lap_number, {"top_speed": None, "max_rpm": None, "speed_samples": 0, "rpm_samples": 0})
        if speed_header and isinstance(row.get(speed_header), (int, float)):
            speed_value = float(row[speed_header])
            metric["speed_samples"] += 1
            if metric["top_speed"] is None or speed_value > metric["top_speed"]:
                metric["top_speed"] = speed_value
        if rpm_header and isinstance(row.get(rpm_header), (int, float)):
            rpm_value = float(row[rpm_header])
            metric["rpm_samples"] += 1
            if metric["max_rpm"] is None or rpm_value > metric["max_rpm"]:
                metric["max_rpm"] = rpm_value

    return {
        lap_number: {
            "top_speed": round(metric["top_speed"], 3) if metric["top_speed"] is not None else None,
            "max_rpm": round(metric["max_rpm"], 3) if metric["max_rpm"] is not None else None,
            "speed_samples": metric["speed_samples"],
            "rpm_samples": metric["rpm_samples"],
        }
        for lap_number, metric in metrics_by_lap.items()
    }


def _merge_lap_channel_metrics(lap_records: list[dict], lap_metrics: dict[int, dict]) -> list[dict]:
    merged = []
    for record in lap_records:
        lap_number = record.get("lap_number")
        metric = lap_metrics.get(lap_number, {})
        merged.append(
            {
                **record,
                "top_speed": metric.get("top_speed"),
                "max_rpm": metric.get("max_rpm"),
                "speed_samples": metric.get("speed_samples"),
                "rpm_samples": metric.get("rpm_samples"),
            }
        )
    return merged


def _max_lap_metric(lap_records: list[dict], field: str) -> float | None:
    values = [float(item[field]) for item in lap_records if isinstance(item.get(field), (int, float))]
    return round(max(values), 3) if values else None


def _classify_lap_records(lap_records: list[dict]) -> list[dict]:
    if not lap_records:
        return []

    thresholds = _lap_quality_thresholds(lap_records)
    sample_threshold = _lap_sample_threshold(lap_records)
    sorted_times = sorted(item["lap_time"] for item in lap_records if isinstance(item.get("lap_time"), (int, float)) and item["lap_time"] > 0)
    unique_fastest_gap = None
    unique_slowest_gap = None
    if len(sorted_times) >= 4:
        if sorted_times[1] - sorted_times[0] > max(1.5, sorted_times[1] * 0.03):
            unique_fastest_gap = sorted_times[0]
        if sorted_times[-1] - sorted_times[-2] > max(2.5, sorted_times[-2] * 0.05):
            unique_slowest_gap = sorted_times[-1]

    classified = []
    valid_count = 0
    for item in lap_records:
        lap_time = item.get("lap_time")
        flags = []
        if not isinstance(lap_time, (int, float)) or lap_time <= 0:
            flags.append("missing_lap_time")
        else:
            if thresholds and lap_time < thresholds["lower_bound"]:
                flags.append("too_fast_outlier")
            if thresholds and lap_time > thresholds["upper_bound"]:
                flags.append("too_slow_outlier")
            if unique_fastest_gap is not None and lap_time == unique_fastest_gap:
                flags.append("isolated_fast_gap")
            if unique_slowest_gap is not None and lap_time == unique_slowest_gap:
                flags.append("isolated_slow_gap")
        if item.get("invalid_true_count", 0) > 0:
            flags.append("flagged_invalid")
        if sample_threshold is not None and int(item.get("sample_count", 0) or 0) < sample_threshold:
            flags.append("insufficient_samples")

        normalized = {
            **item,
            "quality_flags": list(dict.fromkeys(flags)),
        }
        normalized["is_valid_for_analysis"] = len(normalized["quality_flags"]) == 0
        if normalized["is_valid_for_analysis"]:
            valid_count += 1
        classified.append(normalized)

    if valid_count == 0:
        relaxable_flags = {"too_fast_outlier", "too_slow_outlier", "isolated_fast_gap", "isolated_slow_gap"}
        recovered = 0
        for item in classified:
            preserved_flags = [flag for flag in item["quality_flags"] if flag not in relaxable_flags]
            item["quality_flags"] = preserved_flags
            item["is_valid_for_analysis"] = len(preserved_flags) == 0
            if item["is_valid_for_analysis"]:
                recovered += 1
        if recovered == 0:
            fallback_index = min(
                range(len(classified)),
                key=lambda index: (
                    len(classified[index]["quality_flags"]),
                    classified[index].get("lap_time") if isinstance(classified[index].get("lap_time"), (int, float)) else float("inf"),
                ),
            )
            classified[fallback_index]["quality_flags"] = []
            classified[fallback_index]["is_valid_for_analysis"] = True
    return classified


def _lap_quality_thresholds(lap_records: list[dict]) -> dict | None:
    clean_times = sorted(item["lap_time"] for item in lap_records if isinstance(item.get("lap_time"), (int, float)) and item["lap_time"] > 0)
    if len(clean_times) < 3:
        return None

    q1 = _percentile(clean_times, 0.25)
    median = _percentile(clean_times, 0.5)
    q3 = _percentile(clean_times, 0.75)
    iqr = max(q3 - q1, 0.0)

    if len(clean_times) >= 5:
        lower_bound = max(5.0, q1 - max(iqr * 1.5, 1.5))
        upper_bound = q3 + max(iqr * 1.5, 3.0)
    else:
        lower_bound = max(5.0, median - 4.0)
        upper_bound = max(median + 8.0, median * 1.35)

    return {
        "median": median,
        "lower_bound": round(lower_bound, 3),
        "upper_bound": round(upper_bound, 3),
    }


def _lap_sample_threshold(lap_records: list[dict]) -> int | None:
    sample_counts = sorted(
        int(item.get("sample_count", 0) or 0)
        for item in lap_records
        if int(item.get("sample_count", 0) or 0) > 0
    )
    if len(sample_counts) < 3:
        return None
    median_samples = _percentile(sample_counts, 0.5)
    return max(3, int(round(median_samples * 0.35)))


def _percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0.0
    if len(values) == 1:
        return float(values[0])
    position = (len(values) - 1) * ratio
    lower_index = math.floor(position)
    upper_index = math.ceil(position)
    lower = float(values[lower_index])
    upper = float(values[upper_index])
    if lower_index == upper_index:
        return lower
    return lower + (upper - lower) * (position - lower_index)


def _extract_lap_traces(session: ParsedSession, lap_records: list[dict]) -> list[dict]:
    lap_header = _match_header(session.headers, ["lap number"])
    time_header = _preferred_time_header(session.headers)
    lat_header = _preferred_latitude_header(session.headers)
    lon_header = _preferred_longitude_header(session.headers)
    speed_header = _preferred_speed_header(session.headers)
    rpm_header = _preferred_rpm_header(session.headers)
    distance_header = _preferred_distance_header(session.headers)
    steering_header = _preferred_steering_header(session.headers)
    lateral_g_header = _preferred_lateral_g_header(session.headers)
    longitudinal_g_header = _preferred_longitudinal_g_header(session.headers)

    if not lap_header or not time_header or not lat_header or not lon_header:
        return []

    allowed_laps = {item["lap_number"] for item in lap_records}
    traces_by_lap: dict[int, list[dict]] = {}
    current_by_lap: dict[int, dict] = {}
    for row in session.rows:
        time_seconds = _normalize_time_seconds(row.get(time_header))
        if time_seconds is None:
            continue

        lap_value = row.get(lap_header)
        if not isinstance(lap_value, (int, float)):
            continue
        lap_number = int(lap_value)
        if lap_number <= 0:
            continue
        if allowed_laps and lap_number not in allowed_laps:
            continue

        current = current_by_lap.setdefault(
            lap_number,
            {
                "lat": {"value": None, "time": None},
                "lon": {"value": None, "time": None},
                "speed": {"value": None, "time": None},
                "rpm": {"value": None, "time": None},
                "distance": {"value": None, "time": None},
                "steering": {"value": None, "time": None},
                "lateral_g": {"value": None, "time": None},
                "longitudinal_g": {"value": None, "time": None},
            },
        )
        for key, header in {
            "lat": lat_header,
            "lon": lon_header,
            "speed": speed_header,
            "rpm": rpm_header,
            "distance": distance_header,
            "steering": steering_header,
            "lateral_g": lateral_g_header,
            "longitudinal_g": longitudinal_g_header,
        }.items():
            if header and isinstance(row.get(header), (int, float)):
                current[key]["value"] = float(row[header])
                current[key]["time"] = time_seconds

        lat = _fresh_channel_value(current["lat"], time_seconds, max_age=0.35)
        lon = _fresh_channel_value(current["lon"], time_seconds, max_age=0.35)
        if lat is None or lon is None:
            continue

        traces_by_lap.setdefault(lap_number, []).append(
            {
                "lap_number": lap_number,
                "time": round(time_seconds, 4),
                "lat": round(lat, 7),
                "lon": round(lon, 7),
                "speed": _rounded_if_present(_fresh_channel_value(current["speed"], time_seconds, max_age=0.45), 3),
                "rpm": _rounded_if_present(_fresh_channel_value(current["rpm"], time_seconds, max_age=0.75), 3),
                "distance": _rounded_if_present(_fresh_channel_value(current["distance"], time_seconds, max_age=0.75), 3),
                "steering": _rounded_if_present(_fresh_channel_value(current["steering"], time_seconds, max_age=0.45), 3),
                "lateral_g": _rounded_if_present(_fresh_channel_value(current["lateral_g"], time_seconds, max_age=0.45), 4),
                "longitudinal_g": _rounded_if_present(_fresh_channel_value(current["longitudinal_g"], time_seconds, max_age=0.45), 4),
            }
        )

    lap_record_map = {item["lap_number"]: item for item in lap_records}
    traces = []
    for lap_number, trace in sorted(traces_by_lap.items()):
        normalized_trace = _finalize_trace(trace, max_points=700)
        if not normalized_trace:
            continue
        quality = _trace_quality_summary(normalized_trace)
        if not quality["is_valid"]:
            continue
        traces.append(
            {
                "lap_number": lap_number,
                "lap_time": lap_record_map.get(lap_number, {}).get("lap_time"),
                "point_count": len(normalized_trace),
                "trace": normalized_trace,
                "bounds": _trace_bounds(normalized_trace),
                "quality": quality,
            }
        )
    return traces


def _extract_best_lap_trace(lap_traces: list[dict], lap_records: list[dict]) -> dict:
    if not lap_traces:
        return {"trace": [], "meta": {"lap_number": None, "point_count": 0}}

    best_lap_number = None
    if lap_records:
        best_lap_number = min(lap_records, key=lambda item: item["lap_time"])["lap_number"]
    best_trace_entry = next((item for item in lap_traces if item["lap_number"] == best_lap_number), None)
    if best_trace_entry is None:
        traces_with_speed = [
            item for item in lap_traces
            if any(point.get("speed") is not None for point in item.get("trace", []))
        ]
        candidate_traces = traces_with_speed or lap_traces
        best_trace_entry = min(
            candidate_traces,
            key=lambda item: (
                item.get("lap_time") if isinstance(item.get("lap_time"), (int, float)) else float("inf"),
                item.get("lap_number") if isinstance(item.get("lap_number"), int) else float("inf"),
            ),
        )
    normalized_trace = best_trace_entry.get("trace", [])
    return {
        "trace": normalized_trace,
        "meta": {
            "lap_number": best_trace_entry.get("lap_number"),
            "point_count": len(normalized_trace),
            "bounds": _trace_bounds(normalized_trace),
        },
    }


def _fresh_channel_value(channel_state: dict | None, current_time: float, max_age: float) -> float | None:
    if not channel_state:
        return None
    value = channel_state.get("value")
    sample_time = channel_state.get("time")
    if value is None or sample_time is None:
        return None
    if current_time - sample_time > max_age:
        return None
    return float(value)


def _rounded_if_present(value: float | None, digits: int) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _trace_bounds(trace: list[dict]) -> dict:
    if not trace:
        return {}
    latitudes = [point["lat"] for point in trace if point.get("lat") is not None]
    longitudes = [point["lon"] for point in trace if point.get("lon") is not None]
    distances = [point["normalized_distance"] for point in trace if point.get("normalized_distance") is not None]
    if not latitudes or not longitudes:
        return {}
    return {
        "min_lat": min(latitudes),
        "max_lat": max(latitudes),
        "min_lon": min(longitudes),
        "max_lon": max(longitudes),
        "min_distance": min(distances) if distances else 0.0,
        "max_distance": max(distances) if distances else 1.0,
    }


def _build_overlay_bounds(drivers: list[dict]) -> dict:
    traces = [driver.get("best_lap_trace") or [] for driver in drivers]
    latitudes = [point["lat"] for trace in traces for point in trace if point.get("lat") is not None]
    longitudes = [point["lon"] for trace in traces for point in trace if point.get("lon") is not None]
    if not latitudes or not longitudes:
        return {}
    return {
        "min_lat": min(latitudes),
        "max_lat": max(latitudes),
        "min_lon": min(longitudes),
        "max_lon": max(longitudes),
        "center_lat": round((min(latitudes) + max(latitudes)) / 2, 7),
        "center_lon": round((min(longitudes) + max(longitudes)) / 2, 7),
    }


def _infer_corner_analysis(drivers: list[dict]) -> list[dict]:
    reference_driver = next(
        (
            driver
            for driver in drivers
            if driver.get("best_lap_seconds") is not None
            and len(driver.get("best_lap_trace") or []) >= 40
            and sum(1 for point in driver.get("best_lap_trace") or [] if point.get("speed") is not None) >= 20
        ),
        None,
    )
    if reference_driver is None:
        return []

    reference_trace = reference_driver.get("best_lap_trace") or []
    reference_corners = _detect_reference_corners(reference_trace)
    if not reference_corners:
        return []

    corners = []
    for index, reference_corner in enumerate(reference_corners, start=1):
        driver_metrics = []
        for driver in drivers:
            metric = _extract_corner_metric(driver, reference_corner)
            if metric:
                driver_metrics.append(metric)
        if not driver_metrics:
            continue

        later_braker = max(
            [item for item in driver_metrics if item.get("brake_start_distance") is not None],
            key=lambda item: item["brake_start_distance"],
            default=None,
        )
        higher_min_speed = max(
            [item for item in driver_metrics if item.get("minimum_speed") is not None],
            key=lambda item: item["minimum_speed"],
            default=None,
        )
        stronger_exit = max(
            [item for item in driver_metrics if item.get("exit_speed") is not None],
            key=lambda item: item["exit_speed"],
            default=None,
        )
        summary_parts = []
        if later_braker:
            summary_parts.append(f"{later_braker['driver_name']} brakes latest")
        if higher_min_speed:
            summary_parts.append(f"{higher_min_speed['driver_name']} carries the highest minimum speed")
        if stronger_exit and stronger_exit is not higher_min_speed:
            summary_parts.append(f"{stronger_exit['driver_name']} has the strongest exit speed")

        corners.append(
            {
                "corner_number": index,
                "reference_driver": reference_driver.get("canonical_driver_name") or reference_driver.get("driver_name"),
                "reference_distance": reference_corner["normalized_distance"],
                "reference_minimum_speed": reference_corner.get("speed"),
                "reference_entry_speed": reference_corner.get("entry_speed"),
                "reference_exit_speed": reference_corner.get("exit_speed"),
                "driver_metrics": driver_metrics,
                "summary": ". ".join(summary_parts) + "." if summary_parts else "",
            }
        )
    return corners


def _detect_reference_corners(trace: list[dict]) -> list[dict]:
    speed_points = [
        {"index": index, **point}
        for index, point in enumerate(trace)
        if point.get("speed") is not None and point.get("normalized_distance") is not None
    ]
    if len(speed_points) < 20:
        return []

    smoothed = []
    smoothing_window = 4
    for index, point in enumerate(speed_points):
        left = max(0, index - smoothing_window)
        right = min(len(speed_points), index + smoothing_window + 1)
        window_points = speed_points[left:right]
        smoothed.append({**point, "smoothed_speed": mean(item["speed"] for item in window_points)})

    ordered_smoothed = sorted(item["smoothed_speed"] for item in smoothed)
    threshold_index = max(0, min(len(ordered_smoothed) - 1, int(len(ordered_smoothed) * 0.38)))
    threshold = max(min(ordered_smoothed) + 3.0, ordered_smoothed[threshold_index])
    candidates = []
    min_gap = 0.045
    active_segment = []
    for point in smoothed:
        if point["smoothed_speed"] <= threshold:
            active_segment.append(point)
            continue
        if active_segment:
            candidate = min(active_segment, key=lambda item: item["smoothed_speed"])
            candidates.append(candidate)
            active_segment = []
    if active_segment:
        candidates.append(min(active_segment, key=lambda item: item["smoothed_speed"]))

    filtered = []
    for candidate in candidates:
        if candidate["normalized_distance"] <= 0.03 or candidate["normalized_distance"] >= 0.97:
            continue
        if not filtered:
            filtered.append(candidate)
            continue
        previous = filtered[-1]
        if candidate["normalized_distance"] - previous["normalized_distance"] < min_gap:
            if candidate["speed"] < previous["speed"]:
                filtered[-1] = candidate
            continue
        filtered.append(candidate)
    for candidate in filtered:
        phase_window = _infer_corner_phase_window(speed_points, candidate)
        candidate.update(phase_window)
    return filtered[:20]


def _extract_corner_metric(driver: dict, reference_corner: dict) -> dict | None:
    trace = driver.get("best_lap_trace") or []
    if len(trace) < 20:
        return None

    points = [point for point in trace if point.get("speed") is not None and point.get("normalized_distance") is not None]
    if not points:
        return None

    window = 0.035
    nearby = [
        {"index": index, **point}
        for index, point in enumerate(points)
        if abs(point["normalized_distance"] - reference_corner["normalized_distance"]) <= window
    ]
    if not nearby:
        return None

    apex = min(nearby, key=lambda item: item["speed"])
    phase_window = _infer_corner_phase_window(points, apex)
    brake_start = phase_window.get("brake_start_distance")
    relative = None
    reference_brake_start = reference_corner.get("brake_start_distance")
    if brake_start is not None and reference_brake_start is not None:
        if abs(brake_start - reference_brake_start) <= 0.004:
            relative = "similar"
        else:
            relative = "later" if brake_start > reference_brake_start else "earlier"

    return {
        "driver_id": driver.get("driver_id"),
        "driver_name": driver.get("canonical_driver_name") or driver.get("driver_name"),
        "colour_index": driver.get("session_rank"),
        "apex_distance": apex["normalized_distance"],
        "minimum_speed": round(apex["speed"], 3),
        "brake_start_distance": brake_start,
        "brake_phase_length": round(apex["normalized_distance"] - brake_start, 4) if brake_start is not None else None,
        "entry_distance": phase_window.get("entry_distance"),
        "entry_speed": phase_window.get("entry_speed"),
        "exit_distance": phase_window.get("exit_distance"),
        "exit_speed": phase_window.get("exit_speed"),
        "corner_time": phase_window.get("corner_time"),
        "speed_drop": phase_window.get("speed_drop"),
        "speed_recovery": phase_window.get("speed_recovery"),
        "braking_relative": relative,
    }


def _extract_corner_metric_from_pct(driver: dict | None, apex_pct: float) -> dict | None:
    if not driver:
        return None
    trace = driver.get("best_lap_trace") or []
    if len(trace) < 20:
        return None
    points = [point for point in trace if point.get("speed") is not None and point.get("normalized_distance") is not None]
    if not points:
        return None
    nearby = [
        {"index": index, **point}
        for index, point in enumerate(points)
        if abs(point["normalized_distance"] - apex_pct) <= 0.035
    ]
    if not nearby:
        return None
    apex = min(nearby, key=lambda item: item["speed"])
    phase_window = _infer_corner_phase_window(points, apex)
    brake_start = phase_window.get("brake_start_distance")
    return {
        "driver_id": driver.get("driver_id"),
        "driver_name": driver.get("canonical_driver_name") or driver.get("driver_name"),
        "colour_index": driver.get("session_rank"),
        "apex_distance": apex["normalized_distance"],
        "minimum_speed": round(apex["speed"], 3),
        "brake_start_distance": brake_start,
        "brake_phase_length": round(apex["normalized_distance"] - brake_start, 4) if brake_start is not None else None,
        "entry_distance": phase_window.get("entry_distance"),
        "entry_speed": phase_window.get("entry_speed"),
        "exit_distance": phase_window.get("exit_distance"),
        "exit_speed": phase_window.get("exit_speed"),
        "corner_time": phase_window.get("corner_time"),
        "speed_drop": phase_window.get("speed_drop"),
        "speed_recovery": phase_window.get("speed_recovery"),
        "braking_relative": None,
    }


def _infer_brake_start(points: list[dict], apex: dict) -> float | None:
    try:
        apex_index = next(index for index, item in enumerate(points) if item["normalized_distance"] == apex["normalized_distance"] and item["speed"] == apex["speed"])
    except StopIteration:
        return None
    if apex_index < 3:
        return None

    lookback = points[max(0, apex_index - 18):apex_index + 1]
    if len(lookback) < 4:
        return None

    peak_index = max(range(len(lookback)), key=lambda index: (lookback[index]["speed"], index))
    braking_segment = lookback[peak_index:]
    if len(braking_segment) < 4:
        return None

    peak_speed = braking_segment[0]["speed"]
    total_drop = peak_speed - braking_segment[-1]["speed"]
    if total_drop < max(2.5, peak_speed * 0.035):
        return None

    onset_drop = max(1.5, total_drop * 0.32)
    continuation_drop = max(0.8, total_drop * 0.12)
    for index in range(1, len(braking_segment) - 2):
        point = braking_segment[index]
        next_point = braking_segment[index + 1]
        later_point = braking_segment[index + 2]
        cumulative_drop = peak_speed - point["speed"]
        sustained_decel = (
            point["speed"] >= next_point["speed"] - 0.25
            and next_point["speed"] >= later_point["speed"] - 0.25
            and point["speed"] - later_point["speed"] >= continuation_drop
        )
        if cumulative_drop >= onset_drop and sustained_decel:
            return round(point["normalized_distance"], 6)

    fallback_index = max(1, min(len(braking_segment) - 1, int(round((len(braking_segment) - 1) * 0.35))))
    return round(braking_segment[fallback_index]["normalized_distance"], 6)


def _infer_corner_phase_window(points: list[dict], apex: dict) -> dict:
    try:
        apex_index = next(index for index, item in enumerate(points) if item["normalized_distance"] == apex["normalized_distance"] and item["speed"] == apex["speed"])
    except StopIteration:
        return {}

    entry_slice = points[max(0, apex_index - 22):apex_index + 1]
    exit_slice = points[apex_index:min(len(points), apex_index + 23)]
    if not entry_slice or not exit_slice:
        return {}

    entry_point = max(entry_slice, key=lambda item: item["speed"])
    exit_threshold = apex["speed"] + max(3.0, (entry_point["speed"] - apex["speed"]) * 0.45)
    exit_point = None
    for point in exit_slice[1:]:
        if point["speed"] >= exit_threshold:
            exit_point = point
            break
    if exit_point is None:
        exit_point = max(exit_slice, key=lambda item: item["speed"])

    brake_start = _infer_brake_start(points, apex)
    corner_time = None
    if entry_point.get("elapsed") is not None and exit_point.get("elapsed") is not None and exit_point["elapsed"] >= entry_point["elapsed"]:
        corner_time = round(exit_point["elapsed"] - entry_point["elapsed"], 4)

    return {
        "entry_distance": round(entry_point["normalized_distance"], 6) if entry_point.get("normalized_distance") is not None else None,
        "entry_speed": round(entry_point["speed"], 3) if entry_point.get("speed") is not None else None,
        "brake_start_distance": brake_start,
        "exit_distance": round(exit_point["normalized_distance"], 6) if exit_point.get("normalized_distance") is not None else None,
        "exit_speed": round(exit_point["speed"], 3) if exit_point.get("speed") is not None else None,
        "corner_time": corner_time,
        "speed_drop": round(entry_point["speed"] - apex["speed"], 3) if entry_point.get("speed") is not None and apex.get("speed") is not None else None,
        "speed_recovery": round(exit_point["speed"] - apex["speed"], 3) if exit_point.get("speed") is not None and apex.get("speed") is not None else None,
    }


def _trim_trace(trace: list[dict], max_points: int = 1400) -> list[dict]:
    if len(trace) <= max_points:
        return trace
    step = max(1, math.ceil(len(trace) / max_points))
    return [point for index, point in enumerate(trace) if index % step == 0]


def _dedupe_trace(trace: list[dict]) -> list[dict]:
    deduped = []
    last_key = None
    for point in trace:
        key = (point["time"], point["lat"], point["lon"])
        if key == last_key:
            continue
        deduped.append(point)
        last_key = key
    return deduped


def _finalize_trace(trace: list[dict], max_points: int = 1400) -> list[dict]:
    cleaned_trace = _dedupe_trace(_trim_trace(trace, max_points=max_points))
    normalized_trace = _normalize_trace_distance(cleaned_trace)
    if not normalized_trace:
        return []
    start_time = normalized_trace[0].get("time") or 0.0
    for point in normalized_trace:
        point["elapsed"] = round(point["time"] - start_time, 4)
    return normalized_trace


def _trace_quality_summary(trace: list[dict]) -> dict:
    if not trace:
        return {"is_valid": False, "flags": ["empty_trace"], "point_count": 0}

    flags = []
    point_count = len(trace)
    speed_samples = sum(1 for point in trace if point.get("speed") is not None)
    rpm_samples = sum(1 for point in trace if point.get("rpm") is not None)
    steering_samples = sum(1 for point in trace if point.get("steering") is not None)
    distance_points = [point.get("distance") for point in trace if isinstance(point.get("distance"), (int, float))]
    elapsed_points = [point.get("elapsed") for point in trace if isinstance(point.get("elapsed"), (int, float))]
    latitudes = [point.get("lat") for point in trace if isinstance(point.get("lat"), (int, float))]
    longitudes = [point.get("lon") for point in trace if isinstance(point.get("lon"), (int, float))]

    if point_count < 25:
        flags.append("too_few_trace_points")
    if speed_samples == 0:
        flags.append("missing_speed_channel")
    elif speed_samples < max(10, int(point_count * 0.2)):
        flags.append("sparse_speed_channel")
    if elapsed_points and any(right <= left for left, right in zip(elapsed_points, elapsed_points[1:])):
        flags.append("non_monotonic_time")

    distance_span = None
    if distance_points:
        distance_span = max(distance_points) - min(distance_points)
        if distance_span < 100:
            flags.append("short_distance_span")

    lat_span = (max(latitudes) - min(latitudes)) if latitudes else 0.0
    lon_span = (max(longitudes) - min(longitudes)) if longitudes else 0.0
    if latitudes and longitudes and lat_span < 0.0001 and lon_span < 0.0001:
        flags.append("minimal_gps_movement")

    return {
        "is_valid": len(flags) == 0,
        "flags": flags,
        "point_count": point_count,
        "speed_samples": speed_samples,
        "rpm_samples": rpm_samples,
        "steering_samples": steering_samples,
        "distance_span": round(distance_span, 3) if distance_span is not None else None,
    }


def _normalize_trace_distance(trace: list[dict]) -> list[dict]:
    if not trace:
        return []

    has_distance = all(point.get("distance") is not None for point in trace)
    if has_distance:
        start = min(point["distance"] for point in trace)
        end = max(point["distance"] for point in trace)
        span = max(end - start, 1e-9)
        for point in trace:
            point["normalized_distance"] = round((point["distance"] - start) / span, 6)
        return trace

    cumulative = 0.0
    trace[0]["distance"] = 0.0
    trace[0]["normalized_distance"] = 0.0
    for index in range(1, len(trace)):
        previous = trace[index - 1]
        point = trace[index]
        cumulative += _haversine_m(previous["lat"], previous["lon"], point["lat"], point["lon"])
        point["distance"] = round(cumulative, 3)
    span = max(cumulative, 1e-9)
    for point in trace:
        point["normalized_distance"] = round(point["distance"] / span, 6)
    return trace


def _haversine_m(lat1, lon1, lat2, lon2):
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _match_header(headers: list[str], fragments: list[str]) -> str | None:
    lowered_headers = [(header.lower(), header) for header in headers]
    for fragment in fragments:
        fragment = fragment.lower()
        exact = next((original for lower_header, original in lowered_headers if lower_header == fragment), None)
        if exact:
            return exact
        starts_with = next((original for lower_header, original in lowered_headers if lower_header.startswith(fragment)), None)
        if starts_with:
            return starts_with
        contains = next((original for lower_header, original in lowered_headers if fragment in lower_header), None)
        if contains:
            return contains
    return None


def _preferred_time_header(headers: list[str]) -> str | None:
    return _match_header(
        headers,
        [
            "session time",
            "time of day",
            "time",
            "timestamp",
        ],
    )


def _preferred_latitude_header(headers: list[str]) -> str | None:
    exact = next((header for header in headers if header.lower() in {"gps latitude", "latitude"}), None)
    return exact or _match_header(headers, ["gps latitude", "latitude", "lat"])


def _preferred_longitude_header(headers: list[str]) -> str | None:
    exact = next((header for header in headers if header.lower() in {"gps longitude", "longitude"}), None)
    return exact or _match_header(headers, ["gps longitude", "longitude", "lon", "lng"])


def _preferred_speed_header(headers: list[str]) -> str | None:
    exact = next((header for header in headers if header.lower() == "gps speed"), None)
    return exact or _match_header(headers, ["gps speed", "vehicle speed", "speed", "km/h", "kph"])


def _preferred_rpm_header(headers: list[str]) -> str | None:
    exact = next((header for header in headers if header.lower() == "rpm"), None)
    return exact or _match_header(headers, ["engine rpm", "rpm", "engine speed"])


def _preferred_distance_header(headers: list[str]) -> str | None:
    return _match_header(headers, ["gps distance", "lap distance", "distance"])


def _preferred_steering_header(headers: list[str]) -> str | None:
    return _match_header(headers, ["steering angle", "steering"])


def _preferred_lateral_g_header(headers: list[str]) -> str | None:
    return _match_header(
        headers,
        [
            "gps lateral acceleration",
            "lateral acceleration",
            "lateral g",
            "lat accel",
        ],
    )


def _preferred_longitudinal_g_header(headers: list[str]) -> str | None:
    return _match_header(
        headers,
        [
            "gps longitudinal acceleration",
            "longitudinal acceleration",
            "longitudinal g",
            "long accel",
        ],
    )


def _sector_summary(rows: list[dict], headers: list[str]) -> list[dict]:
    sector_headers = [header for header in headers if "sector" in header.lower() or header.lower() in {"s1", "s2", "s3"}]
    summary = []
    for header in sector_headers:
        values = [_parse_time(row.get(header)) for row in rows]
        clean = [value for value in values if value is not None]
        if clean:
            summary.append({"name": header, "average": round(mean(clean), 3), "best": round(min(clean), 3)})
    return summary


def _channel_summary(rows: list[dict], headers: list[str]) -> dict:
    return {
        "minimum_corner_speed": _average_for(rows, headers, ["minimum speed", "min speed", "minspd"]),
        "speed_trace_average": _average_for(rows, headers, ["speed"]),
        "max_speed_average": _average_for(rows, headers, ["max speed", "top speed", "vmax"]),
        "throttle_average": _average_for(rows, headers, ["throttle", "tps"]),
        "brake_average": _average_for(rows, headers, ["brake", "brk"]),
        "rpm_average": _average_for(rows, headers, ["rpm"]),
        "gear_average": _average_for(rows, headers, ["gear"]),
        "water_temp_average": _average_for(rows, headers, ["water temp", "coolant", "water"]),
        "engine_temp_average": _average_for(rows, headers, ["engine temp", "cht", "head temp"]),
    }


def _average_for(rows: list[dict], headers: list[str], fragments: list[str]):
    matched = [header for header in headers if any(fragment in header.lower() for fragment in fragments)]
    values = []
    for header in matched:
        for row in rows:
            if isinstance(row.get(header), (int, float)):
                values.append(float(row[header]))
    return round(mean(values), 3) if values else None


def _lap_table(rows: list[dict], lap_times: list[float]) -> list[dict]:
    return [{"lap_number": index + 1, "lap_time": lap_time} for index, lap_time in enumerate(lap_times[:20])]


def _normalize_time_seconds(value):
    parsed = _parse_time(value)
    if parsed is None:
        return None
    if parsed > 1_000_000:
        return parsed / 1_000_000_000
    if parsed > 10_000:
        return parsed / 1000
    return parsed


def _time_loss_hint(sectors: list[dict], channel_summary: dict) -> str:
    throttle = channel_summary.get("throttle_average")
    brake = channel_summary.get("brake_average")
    minimum_corner_speed = channel_summary.get("minimum_corner_speed")
    max_speed = channel_summary.get("max_speed_average")
    if brake and throttle and brake > throttle:
        return "Losing most time on corner entry with too much braking overlap."
    if minimum_corner_speed and minimum_corner_speed < 50:
        return "Time loss is likely mid-corner due to low minimum speed."
    if throttle and throttle < 55:
        return "Time loss is likely on corner exit due to delayed throttle application."
    if max_speed and max_speed < 68:
        return "Straight-line speed looks lower than expected, so exit momentum may be compromised."
    if sectors:
        return f"Biggest opportunity appears in {max(sectors, key=lambda sector: sector['average'])['name']}."
    return "Time loss is spread across the lap rather than one specific phase."


def _average_best_values(rows: list[dict], headers: list[str], fragments: list[str], take: int = 3):
    matched = [header for header in headers if any(fragment in header.lower() for fragment in fragments)]
    values = []
    for header in matched:
        values.extend(float(row[header]) for row in rows if isinstance(row.get(header), (int, float)))
    if not values:
        return None
    return round(mean(sorted(values, reverse=True)[:take]), 3)


def _min_max_for(rows: list[dict], headers: list[str], fragments: list[str]) -> dict | None:
    matched = [header for header in headers if any(fragment in header.lower() for fragment in fragments)]
    values = []
    for header in matched:
        values.extend(float(row[header]) for row in rows if isinstance(row.get(header), (int, float)))
    if not values:
        return None
    return {"min": round(min(values), 3), "max": round(max(values), 3)}


def _min_max_for_selected_headers(rows: list[dict], headers: list[str | None]) -> dict | None:
    selected_headers = [header for header in headers if header]
    values = []
    for header in selected_headers:
        values.extend(float(row[header]) for row in rows if isinstance(row.get(header), (int, float)))
    if not values:
        return None
    return {"min": round(min(values), 3), "max": round(max(values), 3)}


def _throttle_brake_overlap(channel_summary: dict) -> float | None:
    throttle = channel_summary.get("throttle_average")
    brake = channel_summary.get("brake_average")
    if throttle is None or brake is None:
        return None
    return round(min(throttle, brake), 3)


def _count_truthy_flags(rows: list[dict], headers: list[str], fragments: list[str]) -> int | None:
    matched = [header for header in headers if any(fragment in header.lower() for fragment in fragments)]
    if not matched:
        return None
    total = 0
    for header in matched:
        for row in rows:
            if _is_truthy_flag(row.get(header)):
                total += 1
    return total


def _is_truthy_flag(value) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value).strip().lower()
    return text in {"1", "true", "yes", "y"}


def _parse_time(value):
    if isinstance(value, (int, float)):
        return float(value)
    if not value:
        return None
    text = str(value).strip().lower().replace("s", "")
    if ":" in text:
        minutes, seconds = text.split(":", 1)
        try:
            return int(minutes) * 60 + float(seconds)
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None
