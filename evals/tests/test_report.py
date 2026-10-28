from __future__ import annotations

import json

from apexstint_evals.harness import TaskResult
from apexstint_evals.report import digest, stable_view, to_dict, to_json
from apexstint_evals.scoring import Check


def make(runtime=1.234567, outcome="fail", detail="d"):
    return TaskResult(
        task_id="t-1",
        task_version="1.0.0",
        candidate="starter",
        outcome=outcome,
        checks=(Check("b", True, detail), Check("a", False, "x")),
        error=None,
        diagnostics="",
        runtime_sec=runtime,
        tools={"python": "3.12.0", "harness": "0.1.0"},
    )


def test_report_contains_the_required_fields():
    report = to_dict(make())
    assert report["task"] == {"id": "t-1", "version": "1.0.0"}
    assert report["outcome"] == "fail"
    assert report["failed_checks"] == ["a"]
    assert report["runtime"] == {"seconds": 1.235}
    assert report["tools"] == {"python": "3.12.0", "harness": "0.1.0"}
    assert report["digest"].startswith("sha256:")


def test_serialisation_is_byte_stable_and_sorted():
    text = to_json(make())
    assert text == to_json(make())
    assert text.endswith("\n")
    assert list(json.loads(text)) == sorted(json.loads(text))
    # Check order is the verifier's order, not re-sorted.
    assert [c["id"] for c in json.loads(text)["checks"]] == ["b", "a"]


def test_digest_ignores_runtime_only():
    assert digest(to_dict(make(runtime=0.1))) == digest(to_dict(make(runtime=99.0)))
    assert digest(to_dict(make())) != digest(to_dict(make(detail="other")))
    assert digest(to_dict(make())) != digest(to_dict(make(outcome="pass")))


def test_stable_view_drops_volatile_fields():
    view = stable_view(to_dict(make()))
    assert "runtime" not in view and "digest" not in view and view["outcome"] == "fail"
