"""The seeded move-stop-distance task: reference, starter, negative controls and verifier properties."""

from __future__ import annotations

import importlib.util
import itertools
import json
import shutil
import subprocess
import sys

import pytest

from apexstint_evals.cli import main
from apexstint_evals.harness import evaluate
from apexstint_evals.report import stable_view, to_dict
from apexstint_evals.runner import minimal_env, run_command
from apexstint_evals.spec import load_task

from .conftest import MOVE_STOP

SPEC = load_task(MOVE_STOP)
VERIFIER = MOVE_STOP / "verifier" / "verify.py"


def verify(candidate_dir, *extra, env=None, cwd=None):
    """Run the verifier directly and return its parsed output."""
    proc = subprocess.run(
        [sys.executable, "-I", str(VERIFIER), str(candidate_dir), *extra],
        capture_output=True,
        text=True,
        check=True,
        env=env,
        cwd=cwd,
    )
    return proc.stdout


def failed(stdout):
    return sorted(c["id"] for c in json.loads(stdout)["checks"] if not c["passed"])


@pytest.mark.parametrize("control", SPEC.controls, ids=lambda c: c.name)
def test_every_control_gets_exactly_its_declared_verdict(control):
    result = evaluate(SPEC, control.name)
    assert result.outcome == control.expect
    assert tuple(sorted(result.failed_checks)) == control.failing_checks


def test_starter_fails_for_the_reported_reason_and_keeps_distance():
    result = {c.id: c for c in evaluate(SPEC, "starter").checks}
    assert not result["min-one-lap"].passed
    assert "-> [0, 2]" in result["min-one-lap"].detail  # an empty stint, as in the bug report
    assert result["distance-preserved"].passed  # the seeded bug is the clamp, not the arithmetic


def test_at_least_two_plausible_fixes_are_declared_as_failing_controls():
    # Their verdicts are checked by test_every_control_gets_exactly_its_declared_verdict.
    mutants = [c for c in SPEC.controls if c.path.startswith("mutants/")]
    assert len(mutants) >= 2 and all(c.expect == "fail" for c in mutants)


def test_selftest_command_succeeds(capsys):
    assert main(["selftest", str(MOVE_STOP)]) == 0
    assert "7/7 controls as declared" in capsys.readouterr().out


def test_run_command_exit_codes():
    assert main(["run", str(MOVE_STOP), "--control", "reference", "--out", "/dev/null"]) == 0
    assert main(["run", str(MOVE_STOP), "--control", "starter", "--out", "/dev/null"]) == 1


# --- M2: a directory named like a control is never mistaken for the control ---------------


@pytest.fixture
def buggy_dir_named_reference(tmp_path, monkeypatch):
    """A working directory containing ./reference/ that holds the *buggy* starter."""
    (tmp_path / "reference").mkdir()
    shutil.copy(MOVE_STOP / "starter" / "stints.py", tmp_path / "reference" / "stints.py")
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.mark.parametrize("path", ["reference", "./reference"])
def test_a_candidate_directory_named_reference_is_evaluated_as_a_directory(buggy_dir_named_reference, path, capsys):
    out = buggy_dir_named_reference / "report.json"
    assert main(["run", str(MOVE_STOP), "--candidate-dir", path, "--out", str(out)]) == 1
    report = json.loads(out.read_text())
    assert (report["candidate"], report["outcome"]) == ("dir:reference", "fail")


def test_control_selection_never_reads_the_working_directory(buggy_dir_named_reference, capsys):
    assert main(["run", str(MOVE_STOP), "--control", "reference", "--out", "/dev/null"]) == 0
    assert main(["run", str(MOVE_STOP), "--control", "./reference", "--out", "/dev/null"]) == 2
    assert "unknown control './reference'" in capsys.readouterr().err


@pytest.mark.parametrize(
    "args",
    [
        ["--control", "reference", "--candidate-dir", "reference"],  # ambiguous: both
        [],  # neither
        ["--candidate", "reference"],  # the old, ambiguous option no longer exists
    ],
)
def test_ambiguous_run_arguments_are_rejected(buggy_dir_named_reference, args, capsys):
    with pytest.raises(SystemExit) as exit_info:
        main(["run", str(MOVE_STOP), *args])
    assert exit_info.value.code == 2


# --- The reference solution, tested independently of the verifier -----------------------


def load_module(path):
    spec = importlib.util.spec_from_file_location(f"m_{abs(hash(path))}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def brute_force(laps, index, lap):
    """Specification by search: among all legal edits of the two neighbouring stints, the one whose
    stop is closest to the requested lap. Shares no code or arithmetic with the reference."""
    if not 0 <= index < len(laps) - 1:
        return laps
    pair = laps[index] + laps[index + 1]
    options = [laps[:index] + [a, pair - a] + laps[index + 2 :] for a in range(1, pair)]
    return min(options, key=lambda o: abs(sum(o[: index + 1]) - lap))


def test_reference_matches_a_brute_force_specification():
    reference = load_module(MOVE_STOP / "reference" / "stints.py")
    checked = 0
    for count in range(1, 5):
        for laps in itertools.product(range(1, 6), repeat=count):
            for index in range(-2, count + 1):
                for lap in range(-2, sum(laps) + 3):
                    stints = [{"compound": "SOFT", "laps": n} for n in laps]
                    got = [s["laps"] for s in reference.move_stop(stints, index, lap)]
                    assert got == brute_force(list(laps), index, lap), (laps, index, lap)
                    checked += 1
    assert checked > 50_000


@pytest.mark.parametrize(("control", "ok"), [("reference", True), ("starter", False)])
def test_visible_tests_pass_on_reference_and_fail_on_starter(control, ok, tmp_path):
    result = run_command(
        [sys.executable, "-m", "unittest", "discover", "-s", str(MOVE_STOP / "tests"), "-t", str(MOVE_STOP)],
        cwd=MOVE_STOP / control,
        timeout_sec=30,
        max_output_bytes=100_000,
        env=minimal_env(tmp_path),
    )
    assert (result.exit_code == 0) is ok, result.stderr


# --- Verifier robustness and determinism -------------------------------------------------


def test_results_are_reproducible():
    for candidate in ("reference", "starter"):
        first, second = (stable_view(to_dict(evaluate(SPEC, candidate))) for _ in range(2))
        assert first == second


def test_python_isolated_mode_randomises_hashes_regardless_of_pythonhashseed():
    """The fact the next test relies on: `-I` ignores PYTHONHASHSEED, so each verifier run gets a
    fresh random hash seed (the harness does not, and cannot via the environment, pin it)."""
    code = [sys.executable, "-I", "-c", "print(hash('apexstint'))"]
    env = {"PYTHONHASHSEED": "0", "PATH": "/usr/bin:/bin"}
    hashes = {subprocess.run(code, capture_output=True, text=True, check=True, env=env).stdout for _ in range(3)}
    assert len(hashes) > 1


def test_verifier_output_is_independent_of_hash_randomisation_location_and_cwd(tmp_path):
    # Each run below has its own random hash seed (see the test above), so identical output shows
    # the verdict does not depend on hash order, where the candidate lives, or the working directory.
    a = tmp_path / "a" / "deeply" / "nested"
    b = tmp_path / "b"
    shutil.copytree(MOVE_STOP / "starter", a)
    shutil.copytree(MOVE_STOP / "starter", b)
    outputs = {
        verify(a, cwd=tmp_path),
        verify(b, cwd=a),
        verify(b.relative_to(tmp_path), cwd=tmp_path),
    }
    assert len(outputs) == 1
    assert str(tmp_path) not in outputs.pop()


def test_verifier_uses_no_network():
    # Run the verifier process under an audit hook that aborts on any socket activity.
    code = (
        "import sys, runpy\n"
        "def hook(event, args):\n"
        "    if event.startswith('socket.'):\n"
        "        raise RuntimeError('network access: ' + event)\n"
        "sys.addaudithook(hook)\n"
        f"sys.argv = [{str(VERIFIER)!r}, {str(MOVE_STOP / 'reference')!r}]\n"
        f"runpy.run_path({str(VERIFIER)!r}, run_name='__main__')\n"
    )
    proc = subprocess.run([sys.executable, "-I", "-c", code], capture_output=True, text=True, check=False)
    assert proc.returncode == 0, proc.stderr
    assert failed(proc.stdout) == []


def write_candidate(tmp_path, source):
    (tmp_path / "stints.py").write_text(source)
    return tmp_path


def test_candidate_output_cannot_corrupt_the_protocol(tmp_path):
    source = (MOVE_STOP / "reference" / "stints.py").read_text()
    source = source.replace("from typing import Any\n", "from typing import Any\nprint('{\"protocol\": 1}')\n")
    source = source.replace("    stops = stop_laps(stints)\n", "    print('noise')\n    stops = stop_laps(stints)\n")
    assert failed(verify(write_candidate(tmp_path, source))) == []


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("raise ImportError('broken on purpose')\n", "ImportError: broken on purpose"),
        ("def other():\n    pass\n", "does not define a callable move_stop"),
        ("import sys\nsys.exit(0)\n", "SystemExit"),
    ],
)
def test_a_candidate_that_does_not_load_fails_every_check(tmp_path, source, expected):
    out = json.loads(verify(write_candidate(tmp_path, source)))
    assert all(not c["passed"] for c in out["checks"])
    assert expected in out["checks"][0]["detail"]


def test_a_hanging_candidate_fails_within_the_verifier_limit(tmp_path):
    out = json.loads(verify(write_candidate(tmp_path, "def move_stop(s, i, lap):\n    while True:\n        pass\n"), "--timeout", "1"))
    assert out["checks"][0] == {"id": "loads", "passed": False, "detail": "candidate did not finish within 1 s"}


def test_a_missing_entry_file_fails_cleanly(tmp_path):
    out = json.loads(verify(tmp_path))
    assert out["checks"][0]["detail"] == "stints.py not found in the candidate directory"


def test_an_alternative_correct_implementation_passes(tmp_path):
    """Behavioural checks accept any correct solution, not just the reference's code."""
    source = """
import copy

def move_stop(stints, index, lap):
    out = copy.deepcopy(stints)
    if index < 0 or index + 1 >= len(out):
        return out
    start = sum(s["laps"] for s in out[:index])          # lap before stint `index`
    pair = out[index]["laps"] + out[index + 1]["laps"]
    first = lap - start
    first = 1 if first < 1 else pair - 1 if first > pair - 1 else first
    out[index]["laps"], out[index + 1]["laps"] = first, pair - first
    return out
"""
    assert failed(verify(write_candidate(tmp_path, source))) == []


# --- M1: return type and identity, which JSON alone cannot see ------------------------------


def reference_variant(tmp_path, old, new):
    source = (MOVE_STOP / "reference" / "stints.py").read_text()
    assert source.count(old) == 1
    return write_candidate(tmp_path, source.replace(old, new))


CHANGED_RETURN = '"laps": stints[index + 1]["laps"] - delta}\n    return out\n'


def test_a_tuple_result_is_rejected(tmp_path):
    candidate = reference_variant(tmp_path, CHANGED_RETURN, CHANGED_RETURN.replace("return out", "return tuple(out)"))
    out = json.loads(verify(candidate))
    assert sorted(c["id"] for c in out["checks"] if not c["passed"]) == ["returns-stints"]
    detail = next(c["detail"] for c in out["checks"] if c["id"] == "returns-stints")
    assert "a non-list sequence" in detail


def test_a_tuple_result_on_a_no_op_is_rejected_too(tmp_path):
    candidate = reference_variant(tmp_path, "        return list(stints)\n", "        return tuple(stints)\n")
    assert failed(verify(candidate)) == ["returns-stints"]


def test_returning_the_callers_list_after_changing_it_is_rejected(tmp_path):
    # Edits the caller's list in place and returns it: the contract requires a new list on a change.
    in_place = (
        '    stints[index] = {**stints[index], "laps": stints[index]["laps"] + delta}\n'
        '    stints[index + 1] = {**stints[index + 1], "laps": stints[index + 1]["laps"] - delta}\n'
        "    return stints\n"
    )
    old = (
        "    out = list(stints)\n"
        '    out[index] = {**stints[index], "laps": stints[index]["laps"] + delta}\n'
        '    out[index + 1] = {**stints[index + 1], "laps": stints[index + 1]["laps"] - delta}\n'
        "    return out\n"
    )
    assert failed(verify(reference_variant(tmp_path, old, in_place))) == ["input-unchanged", "new-list-when-changed"]


def test_returning_the_callers_list_on_a_no_op_is_allowed(tmp_path):
    # Mirrors the TypeScript moveStop, which returns the same array when nothing changes.
    candidate = reference_variant(tmp_path, "        return list(stints)\n", "        return stints\n")
    assert failed(verify(candidate)) == []


# --- L3: the declared entry_file is the file that is verified -------------------------------


def test_entry_file_from_task_toml_is_honoured(tmp_path):
    task = tmp_path / "move-stop-distance"
    shutil.copytree(MOVE_STOP, task, ignore=shutil.ignore_patterns("__pycache__", ".ruff_cache"))
    toml = task / "task.toml"
    toml.write_text(toml.read_text().replace('entry_file = "stints.py"', 'entry_file = "solution.py"'))
    for control in ("reference", "starter"):
        (task / control / "stints.py").rename(task / control / "solution.py")
    spec = load_task(task)
    assert spec.entry_file == "solution.py"
    assert evaluate(spec, "reference").outcome == "pass"
    starter = evaluate(spec, "starter")
    assert (starter.outcome, tuple(sorted(starter.failed_checks))) == ("fail", spec.control("starter").failing_checks)
    # A candidate that only has the old file name is not silently verified under it.
    other = tmp_path / "old-name"
    other.mkdir()
    shutil.copy(MOVE_STOP / "reference" / "stints.py", other / "stints.py")
    result = evaluate(spec, directory=other)
    assert result.outcome == "fail" and result.checks[0].detail == "solution.py not found in the candidate directory"


@pytest.mark.parametrize("entry", ["../stints.py", "sub/stints.py", ""])
def test_verifier_rejects_an_entry_that_is_not_a_plain_file_name(tmp_path, entry):
    proc = subprocess.run(
        [sys.executable, "-I", str(VERIFIER), str(tmp_path), "--entry", entry], capture_output=True, text=True, check=False
    )
    assert proc.returncode == 2 and "plain file name" in proc.stderr


# --- L1: the prompt's visible-test commands work where the prompt says they do --------------


def test_prompt_visible_test_commands_work_from_an_external_copy_and_from_starter(tmp_path):
    task = tmp_path / "task-copy" / "move-stop-distance"  # a clean copy of the task, outside the repo
    shutil.copytree(MOVE_STOP, task, ignore=shutil.ignore_patterns("__pycache__", ".ruff_cache"))
    work = tmp_path / "my-attempt"  # the solver's working copy, elsewhere
    work.mkdir()
    shutil.copy(task / "reference" / "stints.py", work / "stints.py")
    prompt = (task / "prompt.md").read_text()
    general = "python -m unittest discover -s TASK/tests -t TASK"
    shorthand = "python -m unittest discover -s ../tests -t .."
    assert general in prompt and shorthand in prompt

    def run_tests(command, cwd):
        argv = [sys.executable if a == "python" else a for a in command.replace("TASK", str(task)).split()]
        return run_command(argv, cwd=cwd, timeout_sec=30, max_output_bytes=100_000, env=minimal_env(tmp_path))

    assert run_tests(general, work).exit_code == 0  # reference copy passes from an external directory
    shutil.copy(task / "starter" / "stints.py", work / "stints.py")
    general_starter = run_tests(general, work)
    assert general_starter.exit_code == 1 and "failures=2" in general_starter.stderr
    shorthand_starter = run_tests(shorthand, task / "starter")
    assert shorthand_starter.exit_code == 1 and "failures=2" in shorthand_starter.stderr
