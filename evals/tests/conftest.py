from __future__ import annotations

import sys
import textwrap
from pathlib import Path

import pytest

EVALS = Path(__file__).resolve().parents[1]
TASKS = EVALS / "tasks"
MOVE_STOP = TASKS / "move-stop-distance"

VALID_TOML = """\
schema_version = 1
id = "demo-task"
version = "1.0.0"
title = "Demo"
language = "python"
prompt = "prompt.md"
setup = "none"
entry_file = "solution.py"

[limits]
timeout_sec = 10
max_output_bytes = 100000

[acceptance]
criteria = ["it works"]

[verifier]
command = ["{python}", "-I", "{task}/verifier.py", "{workspace}", "{entry_file}"]

[[controls]]
name = "good"
path = "good"
expect = "pass"

[[controls]]
name = "bad"
path = "bad"
expect = "fail"
failing_checks = ["answer"]
"""

# A tiny verifier: the candidate passes when its entry file (argv[2]) contains ANSWER = 42.
VERIFIER = """\
import json, sys, pathlib
text = (pathlib.Path(sys.argv[1]) / sys.argv[2]).read_text()
ok = "ANSWER = 42" in text
print(json.dumps({"protocol": 1, "checks": [{"id": "answer", "passed": ok, "detail": "x"}]}))
"""


@pytest.fixture
def demo_task(tmp_path: Path):
    """Create a minimal valid task; returns a function that rewrites task.toml/verifier."""
    root = tmp_path / "demo-task"
    (root / "good").mkdir(parents=True)
    (root / "bad").mkdir()
    (root / "good" / "solution.py").write_text("ANSWER = 42\n")
    (root / "bad" / "solution.py").write_text("ANSWER = 41\n")
    (root / "prompt.md").write_text("Make ANSWER 42.\n")

    def make(toml: str = VALID_TOML, verifier: str = VERIFIER) -> Path:
        (root / "task.toml").write_text(textwrap.dedent(toml))
        (root / "verifier.py").write_text(verifier)
        return root

    return make


@pytest.fixture
def python() -> str:
    return sys.executable
