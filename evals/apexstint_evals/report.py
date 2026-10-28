"""Machine-readable result reports.

A report is a JSON object with sorted keys. Every field except ``runtime`` is a function of the
task, the candidate and the tool versions, so two runs with the same inputs produce the same
``digest``. The digest is the SHA-256 of the canonical JSON of the report without ``runtime``
and without the digest itself.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .harness import TaskResult

REPORT_VERSION = 1
VOLATILE_FIELDS = ("runtime",)


def to_dict(result: TaskResult) -> dict[str, Any]:
    report: dict[str, Any] = {
        "report_version": REPORT_VERSION,
        "task": {"id": result.task_id, "version": result.task_version},
        "candidate": result.candidate,
        "outcome": result.outcome,
        "failed_checks": list(result.failed_checks),
        "checks": [{"id": c.id, "passed": c.passed, "detail": c.detail} for c in result.checks],
        "error": result.error,
        "diagnostics": result.diagnostics,
        "tools": dict(result.tools),
        "runtime": {"seconds": round(result.runtime_sec, 3)},
    }
    report["digest"] = digest(report)
    return report


def stable_view(report: dict[str, Any]) -> dict[str, Any]:
    """The report without fields that legitimately vary between identical runs."""
    return {k: v for k, v in report.items() if k not in VOLATILE_FIELDS and k != "digest"}


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def digest(report: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(canonical_json(stable_view(report)).encode("utf-8")).hexdigest()


def to_json(result: TaskResult) -> str:
    return json.dumps(to_dict(result), sort_keys=True, indent=2, ensure_ascii=False) + "\n"
