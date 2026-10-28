from __future__ import annotations

import pathlib
import time

import pytest

from apexstint_evals.runner import minimal_env, run_command


def run(argv, tmp_path, timeout=10.0, max_output=100_000):
    return run_command(argv, cwd=tmp_path, timeout_sec=timeout, max_output_bytes=max_output, env=minimal_env(tmp_path))


def test_captures_stdout_stderr_and_exit_code(tmp_path, python):
    result = run([python, "-c", "import sys; print('out'); print('err', file=sys.stderr); sys.exit(3)"], tmp_path)
    assert (result.exit_code, result.timed_out, result.ok) == (3, False, False)
    assert result.stdout == "out\n"
    assert result.stderr == "err\n"


def test_success(tmp_path, python):
    result = run([python, "-c", "pass"], tmp_path)
    assert result.ok and result.exit_code == 0


def test_arguments_are_not_shell_interpreted(tmp_path, python):
    payload = "$(touch pwned); `touch pwned2` | rm -rf x ; *"
    result = run([python, "-c", "import sys; print(sys.argv[1])", payload], tmp_path)
    assert result.stdout == payload + "\n"
    assert not (tmp_path / "pwned").exists() and not (tmp_path / "pwned2").exists()


@pytest.mark.parametrize("argv", ["python -c pass", b"python", [], ["python", 3]])
def test_rejects_anything_but_an_argument_list(tmp_path, argv):
    with pytest.raises(TypeError):
        run(argv, tmp_path)


def test_timeout_is_reported_and_enforced(tmp_path, python):
    started = time.monotonic()
    result = run([python, "-c", "import time; time.sleep(30)"], tmp_path, timeout=0.5)
    assert result.timed_out and result.exit_code is None and not result.ok
    assert time.monotonic() - started < 10


def test_timeout_kills_descendants_holding_the_pipes(tmp_path, python):
    # The child starts a grandchild that inherits stdout and sleeps, records its pid, then waits.
    # The timeout must kill the whole process group, grandchild included.
    pid_file = tmp_path / "grandchild.pid"
    code = (
        "import subprocess, sys, time\n"
        "p = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])\n"
        f"open({str(pid_file)!r}, 'w').write(str(p.pid))\n"
        "time.sleep(60)\n"
    )
    started = time.monotonic()
    result = run([python, "-c", code], tmp_path, timeout=2.0)
    assert result.timed_out
    assert time.monotonic() - started < 10
    grandchild = int(pid_file.read_text())
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and _alive(grandchild):
        time.sleep(0.05)
    assert not _alive(grandchild), "grandchild survived the timeout"


def _alive(pid: int) -> bool:
    """True while ``pid`` is a live process (zombies awaiting reaping count as dead)."""
    try:
        state = pathlib.Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[0]
    except FileNotFoundError:
        return False
    return state != "Z"


def test_output_is_truncated_at_the_limit(tmp_path, python):
    result = run([python, "-c", "print('x' * 5000)"], tmp_path, max_output=1000)
    assert result.stdout_truncated and len(result.stdout) == 1000
    assert not result.stderr_truncated


def test_missing_executable_is_a_start_error(tmp_path):
    result = run(["/nonexistent/definitely-not-a-binary"], tmp_path)
    assert result.start_error is not None and result.exit_code is None and not result.timed_out


def test_parent_environment_is_not_inherited(tmp_path, python, monkeypatch):
    monkeypatch.setenv("APEXSTINT_CANARY_TOKEN", "secret-value")
    result = run([python, "-c", "import os; print(os.environ.get('APEXSTINT_CANARY_TOKEN'))"], tmp_path)
    assert result.stdout == "None\n"
