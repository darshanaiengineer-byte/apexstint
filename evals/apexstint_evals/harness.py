"""Task execution: evaluate one candidate solution against a task's verifier.

Flow: resolve the candidate (a control named in ``task.toml``, or a directory, never ambiguously) -> copy it into a
fresh temporary workspace -> run the verifier command there with the task's limits -> score the
verifier's output. The candidate's own directory is never written to, and nothing outside the
temporary directory is created by the harness itself.
"""

from __future__ import annotations

import platform
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

from . import __version__
from .runner import minimal_env, run_command
from .scoring import Check, score
from .spec import TaskSpec

# How much of the verifier's stderr to keep when it fails to reach a verdict.
STDERR_TAIL_CHARS = 2000


@dataclass(frozen=True)
class TaskResult:
    task_id: str
    task_version: str
    candidate: str
    outcome: str
    checks: tuple[Check, ...]
    error: str | None
    diagnostics: str
    runtime_sec: float
    tools: dict[str, str]

    @property
    def failed_checks(self) -> tuple[str, ...]:
        return tuple(c.id for c in self.checks if not c.passed)


def tool_versions() -> dict[str, str]:
    return {
        "harness": __version__,
        "python": platform.python_version(),
        "python_implementation": platform.python_implementation(),
    }


def resolve_candidate(spec: TaskSpec, control: str | None = None, directory: str | Path | None = None) -> tuple[str, Path]:
    """Map exactly one of a control name or a candidate directory to (report label, source directory).

    The two are separate arguments so a directory that happens to be called ``reference`` can never
    be mistaken for the task's own reference solution.
    """
    if (control is None) == (directory is None):
        raise ValueError("give exactly one of a control name or a candidate directory")
    if control is not None:
        try:
            found = spec.control(control)
        except KeyError:
            names = ", ".join(c.name for c in spec.controls)
            raise ValueError(f"unknown control {control!r} (controls: {names}); use a candidate directory for your own solution") from None
        return found.name, spec.root / found.path
    path = Path(directory)
    if not path.is_dir():
        raise ValueError(f"candidate directory {str(directory)!r} does not exist")
    # Label by directory name only, so reports do not depend on where the candidate lives.
    return f"dir:{path.resolve().name}", path


def _scrub(text: str, replacements: dict[str, str]) -> str:
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text


def evaluate(
    spec: TaskSpec, control: str | None = None, *, directory: str | Path | None = None, python: str = sys.executable
) -> TaskResult:
    """Evaluate a control (by name) or a candidate directory; exactly one must be given."""
    label, source = resolve_candidate(spec, control, directory)
    with tempfile.TemporaryDirectory(prefix="apexstint-eval-") as tmp:
        tmp_path = Path(tmp)
        workspace = tmp_path / "workspace"
        # symlinks=True copies links as links instead of following them out of the candidate.
        shutil.copytree(source, workspace, symlinks=True, ignore=shutil.ignore_patterns("__pycache__"))
        home = tmp_path / "home"
        home.mkdir()
        values = {"python": python, "task": str(spec.root), "workspace": str(workspace), "entry_file": spec.entry_file}
        argv = [arg.format(**values) for arg in spec.verifier_command]
        run = run_command(
            argv,
            cwd=workspace,
            timeout_sec=spec.limits.timeout_sec,
            max_output_bytes=spec.limits.max_output_bytes,
            env=minimal_env(home),
        )
        scored = score(run)
        # Keep machine-specific paths out of the report, so it is comparable across machines.
        paths = {str(workspace): "<workspace>", str(spec.root): "<task>", tmp: "<tmp>"}
        checks = tuple(Check(c.id, c.passed, _scrub(c.detail, paths)) for c in scored.checks)
        diagnostics = ""
        if scored.outcome in ("error", "timeout") and run.stderr:
            diagnostics = _scrub(run.stderr[-STDERR_TAIL_CHARS:], paths)
    return TaskResult(
        task_id=spec.id,
        task_version=spec.version,
        candidate=label,
        outcome=scored.outcome,
        checks=checks,
        error=scored.error,
        diagnostics=diagnostics,
        runtime_sec=run.duration_sec,
        tools=tool_versions(),
    )
