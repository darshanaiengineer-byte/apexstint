"""Turn a verifier run into an outcome.

Verifier protocol (version 1): the verifier exits 0 and prints one JSON object on stdout,
``{"protocol": 1, "checks": [{"id": str, "passed": bool, "detail": str}, ...]}``.
A failing candidate is still a successful verifier run; a non-zero exit, a timeout or
unreadable output means the verifier could not reach a verdict.

Outcomes: ``pass`` (every check passed), ``fail`` (at least one check failed), ``timeout``
(the verifier exceeded the task's time limit) and ``error`` (no trustworthy verdict).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from .runner import CommandResult
from .spec import CHECK_ID_PATTERN

PROTOCOL = 1
OUTCOMES = ("pass", "fail", "timeout", "error")


class ProtocolError(ValueError):
    """The verifier's output does not follow the protocol."""


@dataclass(frozen=True)
class Check:
    id: str
    passed: bool
    detail: str


@dataclass(frozen=True)
class Score:
    outcome: str
    checks: tuple[Check, ...]
    error: str | None = None

    @property
    def failed_checks(self) -> tuple[str, ...]:
        return tuple(c.id for c in self.checks if not c.passed)


def parse_verifier_output(stdout: str) -> tuple[Check, ...]:
    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        raise ProtocolError(f"verifier output is not JSON ({exc.msg} at line {exc.lineno})") from exc
    if not isinstance(data, dict) or data.get("protocol") != PROTOCOL:
        raise ProtocolError(f'verifier output must be an object with "protocol": {PROTOCOL}')
    raw = data.get("checks")
    if not isinstance(raw, list) or not raw:
        raise ProtocolError('verifier output must contain a non-empty "checks" list')
    checks: list[Check] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            raise ProtocolError(f"check #{i + 1} is not an object")
        check_id, passed, detail = item.get("id"), item.get("passed"), item.get("detail", "")
        if not isinstance(check_id, str) or not CHECK_ID_PATTERN.match(check_id):
            raise ProtocolError(f"check #{i + 1} has an invalid id {check_id!r}")
        if not isinstance(passed, bool):
            raise ProtocolError(f'check {check_id!r}: "passed" must be true or false')
        if not isinstance(detail, str):
            raise ProtocolError(f'check {check_id!r}: "detail" must be a string')
        checks.append(Check(check_id, passed, detail))
    ids = [c.id for c in checks]
    if len(set(ids)) != len(ids):
        raise ProtocolError("check ids must be unique")
    return tuple(checks)


def score(run: CommandResult) -> Score:
    if run.start_error is not None:
        return Score("error", (), f"verifier could not start: {run.start_error}")
    if run.timed_out:
        return Score("timeout", (), "verifier exceeded the task time limit")
    if run.exit_code != 0:
        return Score("error", (), f"verifier exited with status {run.exit_code}")
    if run.stdout_truncated:
        return Score("error", (), "verifier output exceeded the task output limit")
    try:
        checks = parse_verifier_output(run.stdout)
    except ProtocolError as exc:
        return Score("error", (), str(exc))
    return Score("pass" if all(c.passed for c in checks) else "fail", checks)
