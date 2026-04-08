from __future__ import annotations

from .storage import find_track_by_name


def find_track_context(track_name: str | None) -> dict | None:
    return find_track_by_name(track_name)
