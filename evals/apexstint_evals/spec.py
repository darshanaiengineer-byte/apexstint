"""Task specification: loading and validating ``task.toml``.

A task directory looks like::

    <task-id>/
      task.toml        metadata, limits, acceptance criteria, verifier command, controls
      prompt.md        what the solver is told
      starter/         the code handed to the solver (contains the seeded bug)
      reference/       a known-good solution
      tests/           tests the solver may see and run
      verifier/        hidden behavioural checks; prints the verifier protocol on stdout
      mutants/<name>/  plausible incorrect solutions the verifier must reject

Validation is strict: unknown keys, wrong types, paths that leave the task directory and
unknown command placeholders are all errors, so a typo cannot silently weaken a task.
"""

from __future__ import annotations

import re
import string
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
TASK_FILE = "task.toml"
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{2,63}$")
VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")
CHECK_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
LANGUAGES = frozenset({"python"})
# Placeholders a verifier command may use; they are substituted per argument, never via a shell.
# The command must pass {entry_file} to the verifier, so the declared entry file is the one checked.
PLACEHOLDERS = frozenset({"python", "task", "workspace", "entry_file"})
MAX_TIMEOUT_SEC = 600
TOP_LEVEL_KEYS = frozenset(
    {
        "schema_version",
        "id",
        "version",
        "title",
        "language",
        "prompt",
        "setup",
        "entry_file",
        "limits",
        "acceptance",
        "verifier",
        "controls",
    }
)


class SpecError(ValueError):
    """The task specification is malformed."""


@dataclass(frozen=True)
class Limits:
    timeout_sec: float
    max_output_bytes: int


@dataclass(frozen=True)
class Control:
    """A solution with a known verdict, used to prove the verifier discriminates."""

    name: str
    path: str
    expect: str  # "pass" or "fail"
    failing_checks: tuple[str, ...]


@dataclass(frozen=True)
class TaskSpec:
    root: Path
    schema_version: int
    id: str
    version: str
    title: str
    language: str
    prompt: str
    setup: str
    entry_file: str
    limits: Limits
    acceptance: tuple[str, ...]
    verifier_command: tuple[str, ...]
    controls: tuple[Control, ...]

    def control(self, name: str) -> Control:
        for control in self.controls:
            if control.name == name:
                return control
        raise KeyError(name)


def _table(data: dict[str, Any], key: str, where: str) -> dict[str, Any]:
    value = data.get(key)
    if not isinstance(value, dict):
        raise SpecError(f"{where}: [{key}] must be a table")
    return value


def _require(data: dict[str, Any], key: str, kind: type | tuple[type, ...], where: str) -> Any:
    if key not in data:
        raise SpecError(f"{where}: missing required key {key!r}")
    value = data[key]
    # bool is a subclass of int; never accept it where a number is expected.
    if isinstance(value, bool) and bool not in (kind if isinstance(kind, tuple) else (kind,)):
        raise SpecError(f"{where}: {key!r} must be {_kind_name(kind)}, got a boolean")
    if not isinstance(value, kind):
        raise SpecError(f"{where}: {key!r} must be {_kind_name(kind)}, got {type(value).__name__}")
    return value


def _kind_name(kind: type | tuple[type, ...]) -> str:
    kinds = kind if isinstance(kind, tuple) else (kind,)
    return " or ".join(k.__name__ for k in kinds)


def _no_extra(data: dict[str, Any], allowed: set[str] | frozenset[str], where: str) -> None:
    extra = sorted(set(data) - allowed)
    if extra:
        raise SpecError(f"{where}: unknown key(s) {', '.join(map(repr, extra))}")


def _string_list(value: Any, key: str, where: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not all(isinstance(v, str) and v for v in value):
        raise SpecError(f"{where}: {key!r} must be a list of non-empty strings")
    return tuple(value)


def _inside(root: Path, rel: str, key: str, *, directory: bool) -> Path:
    if not rel or Path(rel).is_absolute():
        raise SpecError(f"{key}: {rel!r} must be a relative path inside the task directory")
    path = (root / rel).resolve()
    if not path.is_relative_to(root):
        raise SpecError(f"{key}: {rel!r} escapes the task directory")
    if not (path.is_dir() if directory else path.is_file()):
        raise SpecError(f"{key}: {rel!r} does not exist (expected a {'directory' if directory else 'file'})")
    return path


def _placeholders(arg: str) -> set[str]:
    try:
        return {name for _, name, _, _ in string.Formatter().parse(arg) if name is not None}
    except ValueError as exc:
        raise SpecError(f"[verifier] command: malformed placeholder in {arg!r}: {exc}") from exc


def parse_task(data: dict[str, Any], root: Path) -> TaskSpec:
    """Validate parsed ``task.toml`` content. ``root`` is the task directory."""
    root = root.resolve()
    where = TASK_FILE
    _no_extra(data, TOP_LEVEL_KEYS, where)
    schema_version = _require(data, "schema_version", int, where)
    if schema_version != SCHEMA_VERSION:
        raise SpecError(f"{where}: unsupported schema_version {schema_version} (expected {SCHEMA_VERSION})")
    task_id = _require(data, "id", str, where)
    if not ID_PATTERN.match(task_id):
        raise SpecError(f"{where}: id {task_id!r} must be 3-64 lowercase letters, digits or hyphens")
    if task_id != root.name:
        raise SpecError(f"{where}: id {task_id!r} must match the task directory name {root.name!r}")
    version = _require(data, "version", str, where)
    if not VERSION_PATTERN.match(version):
        raise SpecError(f"{where}: version {version!r} must be MAJOR.MINOR.PATCH")
    title = _require(data, "title", str, where).strip()
    if not title:
        raise SpecError(f"{where}: title must not be empty")
    language = _require(data, "language", str, where)
    if language not in LANGUAGES:
        raise SpecError(f"{where}: language {language!r} is not supported (supported: {', '.join(sorted(LANGUAGES))})")
    prompt = _require(data, "prompt", str, where)
    _inside(root, prompt, "prompt", directory=False)
    setup = _require(data, "setup", str, where)
    entry_file = _require(data, "entry_file", str, where)
    if not entry_file or "/" in entry_file or "\\" in entry_file or entry_file in (".", ".."):
        raise SpecError(f"{where}: entry_file must be a plain file name")

    limits_data = _table(data, "limits", where)
    _no_extra(limits_data, {"timeout_sec", "max_output_bytes"}, "[limits]")
    timeout = _require(limits_data, "timeout_sec", (int, float), "[limits]")
    if not 0 < timeout <= MAX_TIMEOUT_SEC:
        raise SpecError(f"[limits]: timeout_sec must be > 0 and <= {MAX_TIMEOUT_SEC}")
    max_output = _require(limits_data, "max_output_bytes", int, "[limits]")
    if max_output < 1024:
        raise SpecError("[limits]: max_output_bytes must be at least 1024")

    acceptance_data = _table(data, "acceptance", where)
    _no_extra(acceptance_data, {"criteria"}, "[acceptance]")
    acceptance = _string_list(_require(acceptance_data, "criteria", list, "[acceptance]"), "criteria", "[acceptance]")
    if not acceptance:
        raise SpecError("[acceptance]: criteria must not be empty")

    verifier_data = _table(data, "verifier", where)
    _no_extra(verifier_data, {"command"}, "[verifier]")
    command = verifier_data.get("command")
    if isinstance(command, str):
        raise SpecError("[verifier]: command must be a list of arguments, not a shell string")
    command = _string_list(_require(verifier_data, "command", list, "[verifier]"), "command", "[verifier]")
    if not command:
        raise SpecError("[verifier]: command must not be empty")
    used: set[str] = set()
    for arg in command:
        names = _placeholders(arg)
        unknown = names - PLACEHOLDERS
        if unknown:
            raise SpecError(f"[verifier]: unknown placeholder(s) {sorted(unknown)} in {arg!r}")
        used |= names
    if "entry_file" not in used:
        raise SpecError("[verifier]: command must pass {entry_file} to the verifier, so the declared entry file is the one checked")

    controls_data = data.get("controls")
    if not isinstance(controls_data, list) or not controls_data:
        raise SpecError(f"{where}: [[controls]] must list at least one passing and one failing solution")
    controls: list[Control] = []
    for i, item in enumerate(controls_data):
        cw = f"[[controls]] #{i + 1}"
        if not isinstance(item, dict):
            raise SpecError(f"{cw}: must be a table")
        _no_extra(item, {"name", "path", "expect", "failing_checks"}, cw)
        name = _require(item, "name", str, cw)
        if not CHECK_ID_PATTERN.match(name):
            raise SpecError(f"{cw}: name {name!r} must be lowercase letters, digits or hyphens")
        path = _require(item, "path", str, cw)
        _inside(root, path, f"{cw} path", directory=True)
        expect = _require(item, "expect", str, cw)
        if expect not in ("pass", "fail"):
            raise SpecError(f"{cw}: expect must be 'pass' or 'fail'")
        failing = _string_list(item.get("failing_checks", []), "failing_checks", cw)
        if expect == "pass" and failing:
            raise SpecError(f"{cw}: a passing control cannot list failing_checks")
        if expect == "fail" and not failing:
            raise SpecError(f"{cw}: a failing control must list the checks it is expected to fail")
        if len(set(failing)) != len(failing) or not all(CHECK_ID_PATTERN.match(c) for c in failing):
            raise SpecError(f"{cw}: failing_checks must be unique check ids")
        controls.append(Control(name, path, expect, tuple(sorted(failing))))
    names = [c.name for c in controls]
    if len(set(names)) != len(names):
        raise SpecError(f"{where}: control names must be unique")
    if not any(c.expect == "pass" for c in controls) or not any(c.expect == "fail" for c in controls):
        raise SpecError(f"{where}: [[controls]] must include at least one passing and one failing solution")

    return TaskSpec(
        root=root,
        schema_version=schema_version,
        id=task_id,
        version=version,
        title=title,
        language=language,
        prompt=prompt,
        setup=setup,
        entry_file=entry_file,
        limits=Limits(float(timeout), max_output),
        acceptance=acceptance,
        verifier_command=command,
        controls=tuple(controls),
    )


def load_task(task_dir: str | Path) -> TaskSpec:
    """Load and validate ``<task_dir>/task.toml``."""
    root = Path(task_dir)
    path = root / TASK_FILE
    try:
        with path.open("rb") as fh:
            data = tomllib.load(fh)
    except FileNotFoundError as exc:
        raise SpecError(f"{TASK_FILE} not found in {root}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise SpecError(f"{TASK_FILE}: invalid TOML: {exc}") from exc
    return parse_task(data, root)
