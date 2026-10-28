"""Run one command as a subprocess and describe what happened.

Commands are argument lists executed directly (never through a shell), in their own process
group with a minimal environment. On timeout the whole process group is killed, so a child that
spawned helpers cannot keep the run alive by holding the output pipes open. After a normal exit
nothing is killed: descendants left running in the group, or that left it, survive (killing the
group then could hit a reused process id once the leader has been reaped).

This is process isolation for *well-behaved* code, not a security sandbox: the command runs as
the current user with full filesystem and network access. See evals/README.md.
"""

from __future__ import annotations

import contextlib
import os
import signal
import subprocess
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

# After the group is killed, wait at most this long for the pipes to drain.
DRAIN_SEC = 2.0


@dataclass(frozen=True)
class CommandResult:
    argv: tuple[str, ...]
    exit_code: int | None  # None when the command timed out or could not start
    timed_out: bool
    start_error: str | None
    stdout: str
    stderr: str
    stdout_truncated: bool
    stderr_truncated: bool
    duration_sec: float

    @property
    def ok(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


def minimal_env(home: Path) -> dict[str, str]:
    """A small, predictable environment: the caller's variables are not copied into it.

    This is hygiene, not secrecy: a child running as the same user can still read its ancestors'
    environments through /proc (see evals/README.md). The PYTHON* entries only affect commands
    run without ``-I``; verifiers run with ``-I``, which ignores them. Hash randomisation is
    therefore not controlled, and verifiers must not depend on it.
    """
    return {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": str(home),
        "LANG": "C.UTF-8",
        "LC_ALL": "C.UTF-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "PYTHONIOENCODING": "utf-8",
        "TZ": "UTC",
    }


def _clip(data: bytes, limit: int) -> tuple[str, bool]:
    text = data[:limit].decode("utf-8", errors="replace")
    return text, len(data) > limit


def run_command(
    argv: Sequence[str],
    *,
    cwd: Path,
    timeout_sec: float,
    max_output_bytes: int,
    env: Mapping[str, str],
) -> CommandResult:
    """Run ``argv`` and capture its output. Never raises for a failing or hanging command."""
    if isinstance(argv, (str, bytes)) or not argv or not all(isinstance(a, str) for a in argv):
        raise TypeError("argv must be a non-empty sequence of strings (no shell command lines)")
    argv = tuple(argv)
    started = time.monotonic()
    try:
        proc = subprocess.Popen(
            argv,
            cwd=cwd,
            env=dict(env),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            start_new_session=True,  # own process group, so a timeout can kill every descendant
        )
    except OSError as exc:
        return CommandResult(argv, None, False, f"{type(exc).__name__}: {exc.strerror or exc}", "", "", False, False, 0.0)

    timed_out = False
    try:
        out, err = proc.communicate(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        timed_out = True
        # The leader has not been reaped yet, so its pid still names this process group.
        with contextlib.suppress(ProcessLookupError):
            os.killpg(proc.pid, signal.SIGKILL)
        try:
            out, err = proc.communicate(timeout=DRAIN_SEC)
        except subprocess.TimeoutExpired:
            # A descendant left the process group and still holds a pipe: stop reading.
            for pipe in (proc.stdout, proc.stderr):
                if pipe is not None:
                    pipe.close()
            proc.wait()
            out, err = b"", b""
    duration = time.monotonic() - started

    stdout, stdout_truncated = _clip(out or b"", max_output_bytes)
    stderr, stderr_truncated = _clip(err or b"", max_output_bytes)
    return CommandResult(
        argv=argv,
        exit_code=None if timed_out else proc.returncode,
        timed_out=timed_out,
        start_error=None,
        stdout=stdout,
        stderr=stderr,
        stdout_truncated=stdout_truncated,
        stderr_truncated=stderr_truncated,
        duration_sec=duration,
    )
