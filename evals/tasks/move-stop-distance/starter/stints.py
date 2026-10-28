"""Stint editing for a race strategy.

A strategy is a list of stints; each stint is a dict with at least an integer ``"laps"`` key
(other keys such as ``"compound"`` are carried through untouched). A pit stop happens at the
end of every stint except the last, so stop ``i`` is on lap ``laps[0] + ... + laps[i]``.
"""

from __future__ import annotations

from typing import Any

Stint = dict[str, Any]


def stop_laps(stints: list[Stint]) -> list[int]:
    """The lap of every pit stop (the in-lap), in order."""
    out: list[int] = []
    total = 0
    for stint in stints[:-1]:
        total += stint["laps"]
        out.append(total)
    return out


def move_stop(stints: list[Stint], index: int, lap: int) -> list[Stint]:
    """Move pit stop ``index`` to ``lap`` and return the new stints.

    Only the two stints either side of the stop change, so the race distance is preserved.
    The stop is clamped so that both of those stints keep at least one lap. An index that does
    not name a stop (including a negative one) leaves the strategy unchanged. The input list and
    its stints are never modified.
    """
    if not 0 <= index < len(stints) - 1:
        return list(stints)
    stops = stop_laps(stints)
    prev = stops[index - 1] if index > 0 else 0
    nxt = stops[index + 1] if index + 1 < len(stops) else sum(s["laps"] for s in stints)
    target = min(max(lap, prev), nxt)
    delta = target - stops[index]
    out = list(stints)
    out[index] = {**stints[index], "laps": stints[index]["laps"] + delta}
    out[index + 1] = {**stints[index + 1], "laps": stints[index + 1]["laps"] - delta}
    return out
