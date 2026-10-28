from __future__ import annotations

import pytest

from apexstint_evals.spec import SpecError, load_task

from .conftest import MOVE_STOP, VALID_TOML


def test_valid_task_loads(demo_task):
    spec = load_task(demo_task())
    assert spec.id == "demo-task"
    assert spec.limits.timeout_sec == 10.0
    assert [c.name for c in spec.controls] == ["good", "bad"]
    assert spec.control("bad").failing_checks == ("answer",)


def test_bundled_task_is_valid():
    spec = load_task(MOVE_STOP)
    assert (spec.id, spec.version, spec.entry_file) == ("move-stop-distance", "1.1.0", "stints.py")


@pytest.mark.parametrize(
    ("edit", "message"),
    [
        (lambda t: t.replace('version = "1.0.0"', 'version = "1.0"'), "MAJOR.MINOR.PATCH"),
        (lambda t: t.replace('id = "demo-task"', 'id = "Demo Task"'), "lowercase"),
        (lambda t: t.replace('id = "demo-task"', 'id = "other-task"'), "must match the task directory"),
        (lambda t: t.replace("schema_version = 1", "schema_version = 2"), "unsupported schema_version"),
        (lambda t: t.replace('title = "Demo"\n', ""), "missing required key 'title'"),
        (lambda t: t.replace('language = "python"', 'language = "cobol"'), "not supported"),
        (lambda t: t.replace("timeout_sec = 10", "timeout_sec = 0"), "timeout_sec"),
        (lambda t: t.replace("timeout_sec = 10", "timeout_sec = true"), "got a boolean"),
        (lambda t: t.replace("timeout_sec = 10", 'timeout_sec = "10"'), "must be int or float"),
        (lambda t: t.replace("max_output_bytes = 100000", "max_output_bytes = 10"), "at least 1024"),
        (lambda t: t.replace('criteria = ["it works"]', "criteria = []"), "criteria must not be empty"),
        (lambda t: t + "timeuot_sec = 5\n", "unknown key"),
        (lambda t: t.replace('prompt = "prompt.md"', 'prompt = "../prompt.md"'), "escapes the task directory"),
        (lambda t: t.replace('prompt = "prompt.md"', 'prompt = "/etc/passwd"'), "relative path"),
        (lambda t: t.replace('prompt = "prompt.md"', 'prompt = "missing.md"'), "does not exist"),
        (lambda t: t.replace('entry_file = "solution.py"', 'entry_file = "../x.py"'), "plain file name"),
        (
            lambda t: t.replace(
                'command = ["{python}", "-I", "{task}/verifier.py", "{workspace}", "{entry_file}"]', 'command = "python verifier.py"'
            ),
            "not a shell string",
        ),
        (lambda t: t.replace('"{workspace}",', '"{home}",'), "unknown placeholder"),
        (lambda t: t.replace('"{workspace}",', '"{workspace",'), "malformed placeholder"),
        # L3: the declared entry file must reach the verifier, or entry_file would be dead config.
        (lambda t: t.replace(', "{entry_file}"]', "]"), "must pass {entry_file}"),
        (lambda t: t.replace('path = "bad"', 'path = "nowhere"'), "does not exist"),
        (lambda t: t.replace('expect = "fail"', 'expect = "maybe"'), "'pass' or 'fail'"),
        (lambda t: t.replace('failing_checks = ["answer"]', "failing_checks = []"), "must list the checks"),
        (lambda t: t.replace('name = "bad"', 'name = "good"'), "unique"),
        (
            lambda t: t.split("[[controls]]")[0] + '[[controls]]\nname = "good"\npath = "good"\nexpect = "pass"\n',
            "at least one passing and one failing",
        ),
    ],
)
def test_malformed_metadata_is_rejected(demo_task, edit, message):
    root = demo_task(edit(VALID_TOML))
    with pytest.raises(SpecError, match=message):
        load_task(root)


def test_invalid_toml_is_rejected(demo_task):
    with pytest.raises(SpecError, match="invalid TOML"):
        load_task(demo_task("id = \n"))


def test_missing_task_file_is_rejected(tmp_path):
    with pytest.raises(SpecError, match="not found"):
        load_task(tmp_path)
