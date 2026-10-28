from __future__ import annotations

import json

import pytest

from apexstint_evals.harness import evaluate
from apexstint_evals.runner import CommandResult
from apexstint_evals.scoring import ProtocolError, parse_verifier_output, score
from apexstint_evals.spec import load_task

from .conftest import VALID_TOML


def result(stdout="", exit_code=0, timed_out=False, start_error=None, truncated=False):
    return CommandResult(("v",), exit_code, timed_out, start_error, stdout, "", truncated, False, 0.1)


def protocol(*checks):
    return json.dumps({"protocol": 1, "checks": [{"id": i, "passed": p, "detail": ""} for i, p in checks]})


def test_all_checks_passing_is_a_pass():
    assert score(result(protocol(("a", True), ("b", True)))).outcome == "pass"


def test_any_failing_check_is_a_fail():
    scored = score(result(protocol(("a", True), ("b", False))))
    assert scored.outcome == "fail" and scored.failed_checks == ("b",)


@pytest.mark.parametrize(
    ("run", "outcome", "message"),
    [
        (result(timed_out=True, exit_code=None), "timeout", "time limit"),
        (result(protocol(("a", True)), exit_code=1), "error", "exited with status 1"),
        (result(protocol(("a", True)), exit_code=-9), "error", "exited with status -9"),
        (result(start_error="FileNotFoundError: nope", exit_code=None), "error", "could not start"),
        (result(protocol(("a", True)), truncated=True), "error", "output limit"),
        (result("not json"), "error", "not JSON"),
    ],
)
def test_a_verifier_that_reaches_no_verdict_is_never_a_pass(run, outcome, message):
    scored = score(run)
    assert scored.outcome == outcome and message in scored.error and scored.checks == ()


@pytest.mark.parametrize(
    "payload",
    [
        {"checks": [{"id": "a", "passed": True}]},
        {"protocol": 2, "checks": [{"id": "a", "passed": True}]},
        {"protocol": 1, "checks": []},
        {"protocol": 1, "checks": [{"id": "a", "passed": "yes"}]},
        {"protocol": 1, "checks": [{"id": "A B", "passed": True}]},
        {"protocol": 1, "checks": [{"id": "a", "passed": True}, {"id": "a", "passed": False}]},
        {"protocol": 1, "checks": [{"id": "a", "passed": True, "detail": 3}]},
        [1, 2],
    ],
)
def test_protocol_violations_are_rejected(payload):
    with pytest.raises(ProtocolError):
        parse_verifier_output(json.dumps(payload))


# End to end through the harness: nonzero exits and timeouts of a real verifier process.


def test_harness_reports_a_crashing_verifier_as_error_with_diagnostics(demo_task):
    spec = load_task(demo_task(verifier="import sys\nprint('boom from ' + sys.argv[1], file=sys.stderr)\nsys.exit(4)\n"))
    res = evaluate(spec, "good")
    assert res.outcome == "error" and res.error == "verifier exited with status 4"
    assert res.diagnostics == "boom from <workspace>\n"  # temporary path scrubbed


def test_harness_reports_a_hanging_verifier_as_timeout(demo_task):
    toml = VALID_TOML.replace("timeout_sec = 10", "timeout_sec = 0.5")
    spec = load_task(demo_task(toml, verifier="import time\ntime.sleep(30)\n"))
    assert evaluate(spec, "good").outcome == "timeout"


def test_harness_pass_and_fail(demo_task):
    spec = load_task(demo_task())
    assert evaluate(spec, "good").outcome == "pass"
    bad = evaluate(spec, "bad")
    assert bad.outcome == "fail" and bad.failed_checks == ("answer",)


def test_harness_accepts_a_candidate_directory_and_never_writes_to_it(demo_task, tmp_path):
    writes_into_workspace = (
        "import json, pathlib, sys\n"
        "(pathlib.Path(sys.argv[1]) / 'junk').write_text('x')\n"
        "print(json.dumps({'protocol': 1, 'checks': [{'id': 'a', 'passed': True}]}))\n"
    )
    spec = load_task(demo_task(verifier=writes_into_workspace))
    candidate = tmp_path / "my-solution"
    candidate.mkdir()
    (candidate / "solution.py").write_text("ANSWER = 42\n")
    res = evaluate(spec, directory=candidate)
    assert res.candidate == "dir:my-solution" and res.outcome == "pass"
    assert sorted(p.name for p in candidate.iterdir()) == ["solution.py"]


def test_unknown_control_and_missing_directory_are_rejected(demo_task, tmp_path):
    spec = load_task(demo_task())
    with pytest.raises(ValueError, match="unknown control 'no-such-control'"):
        evaluate(spec, "no-such-control")
    with pytest.raises(ValueError, match="does not exist"):
        evaluate(spec, directory=tmp_path / "missing")


@pytest.mark.parametrize("kwargs", [{}, {"control": "good", "directory": "."}])
def test_exactly_one_of_control_or_directory(demo_task, kwargs):
    with pytest.raises(ValueError, match="exactly one"):
        evaluate(load_task(demo_task()), **kwargs)
