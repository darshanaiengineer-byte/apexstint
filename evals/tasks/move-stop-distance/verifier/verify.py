"""Hidden verifier for the move-stop-distance task.

Usage: verify.py <candidate directory> [--entry FILE] [--timeout SECONDS]

``--entry`` names the candidate's file (the task's ``entry_file``; default ``stints.py``).

Prints one JSON object, ``{"protocol": 1, "checks": [{"id", "passed", "detail"}, ...]}``, and
exits 0 whenever it reached a verdict (a failing candidate is still a successful verification).
A non-zero exit means the verifier itself could not run.

The candidate is executed by ``driver.py`` in a separate process; this process only generates
cases and judges the returned data. Checks are properties of the contract in ``prompt.md``, not
a comparison with one expected patch: any implementation with the documented behaviour passes.
The case set is an exhaustive enumeration of small strategies (1-4 stints of 1-4 laps, every
index from -2 to the stint count, every target lap from -1 to distance + 2), so the verdict
needs no randomness, network, clock or machine-specific path.
"""

from __future__ import annotations

import itertools
import json
import subprocess
import sys
from pathlib import Path

PROTOCOL = 1
DEFAULT_ENTRY_FILE = "stints.py"
COMPOUNDS = ("SOFT", "MEDIUM", "HARD")

# (stint laps, index, lap, expected laps): the examples given in prompt.md, which mirror
# ApexStint's TypeScript test for moveStop.
EXAMPLES = [
    ([10, 20, 27], 0, 15, [15, 15, 27]),
    ([10, 20, 27], 1, 100, [10, 46, 1]),
    ([10, 20, 27], 0, -4, [1, 29, 27]),
]

CHECKS = {
    "loads": "the candidate file imports and defines move_stop",
    "no-exceptions": "move_stop returns normally for every case",
    "returns-stints": "the result is a list (not a tuple or other sequence) of stints, each with an integer lap count",
    "new-list-when-changed": "a move that changes the strategy returns a new list, not the caller's list",
    "examples": "the documented examples give the documented results",
    "distance-preserved": "the total number of laps never changes",
    "min-one-lap": "every stint keeps at least one lap",
    "stint-count-preserved": "no stint is added or removed",
    "other-fields-preserved": "keys other than laps are carried through unchanged, in order",
    "only-neighbours-change": "a valid move changes only the two stints either side of the stop",
    "stop-placement": "the moved stop lands on the requested lap, clamped to keep both stints >= 1 lap",
    "invalid-index-unchanged": "an index that names no stop (including a negative one) changes nothing",
    "input-unchanged": "the caller's list and stints are not modified",
}


def make_stints(laps: list[int]) -> list[dict]:
    return [{"compound": COMPOUNDS[i % len(COMPOUNDS)], "laps": n} for i, n in enumerate(laps)]


def build_cases() -> list[dict]:
    cases = [{"stints": make_stints(laps), "index": i, "lap": lap, "example": expected} for laps, i, lap, expected in EXAMPLES]
    for count in range(1, 5):
        for laps in itertools.product(range(1, 5), repeat=count):
            for index in range(-2, count + 1):
                for lap in range(-1, sum(laps) + 3):
                    cases.append({"stints": make_stints(list(laps)), "index": index, "lap": lap})
    return cases


def stop_laps(laps: list[int]) -> list[int]:
    return list(itertools.accumulate(laps))[:-1]


def show(case: dict, outcome: object) -> str:
    laps = [s["laps"] for s in case["stints"]]
    if isinstance(outcome, list) and all(isinstance(s, dict) and "laps" in s for s in outcome):
        outcome = [s["laps"] for s in outcome]
    return f"move_stop(laps={laps}, index={case['index']}, lap={case['lap']}) -> {outcome}"


def is_stint_list(value: object) -> bool:
    return isinstance(value, list) and all(isinstance(s, dict) and type(s.get("laps")) is int for s in value)


def judge(cases: list[dict], results: list[dict]) -> dict[str, str | None]:
    """Return, per check, None when it passed or a description of the first counterexample."""
    failures: dict[str, str | None] = dict.fromkeys(CHECKS)

    def fail(check: str, message: str) -> None:
        if failures[check] is None:
            failures[check] = message

    for case, outcome in zip(cases, results, strict=True):
        if "error" in outcome:
            fail("no-exceptions", show(case, f"raised {outcome['error']}"))
            continue
        result = outcome["result"]
        if not outcome["is_list"] or not is_stint_list(result):
            kind = "" if outcome["is_list"] else "a non-list sequence: "
            fail("returns-stints", show(case, kind + repr(result)))
            continue
        if outcome["mutated"]:
            fail("input-unchanged", show(case, "modified the input"))
        # Like the TypeScript moveStop, a no-op may return the caller's list itself; a change may not.
        if outcome["is_input"] and result != case["stints"]:
            fail("new-list-when-changed", show(case, "returned the caller's list, changed"))

        before = [s["laps"] for s in case["stints"]]
        after = [s["laps"] for s in result]
        if "example" in case:
            if after != case["example"]:
                fail("examples", show(case, after) + f", expected {case['example']}")
            continue

        if sum(after) != sum(before):
            fail("distance-preserved", show(case, after) + f": {sum(after)} laps, expected {sum(before)}")
        if any(n < 1 for n in after):
            fail("min-one-lap", show(case, after))
        if len(after) != len(before):
            fail("stint-count-preserved", show(case, after))
            continue
        strip = lambda stints: [{k: v for k, v in s.items() if k != "laps"} for s in stints]  # noqa: E731
        if strip(result) != strip(case["stints"]):
            fail("other-fields-preserved", show(case, strip(result)))

        index, count = case["index"], len(before)
        if not 0 <= index < count - 1:
            if after != before:
                fail("invalid-index-unchanged", show(case, after))
            continue
        if any(after[i] != before[i] for i in range(count) if i not in (index, index + 1)):
            fail("only-neighbours-change", show(case, after))
        stops = stop_laps(before)
        low = stops[index - 1] + 1 if index > 0 else 1
        high = (stops[index + 1] if index + 1 < len(stops) else sum(before)) - 1
        wanted = min(max(case["lap"], low), high)
        if stop_laps(after)[index] != wanted:
            fail("stop-placement", show(case, after) + f", expected stop {index} on lap {wanted}")
    return failures


def verdict(failures: dict[str, str | None], evaluated: int) -> list[dict]:
    return [
        {
            "id": check,
            "passed": failures[check] is None,
            "detail": f"{CHECKS[check]} ({evaluated} cases)" if failures[check] is None else failures[check],
        }
        for check in CHECKS
    ]


def option(argv: list[str], name: str, default: str) -> str:
    return argv[argv.index(name) + 1] if name in argv else default


def main(argv: list[str]) -> int:
    entry = option(argv, "--entry", DEFAULT_ENTRY_FILE)
    if not entry or Path(entry).name != entry:
        print(f"verify.py: --entry must be a plain file name, got {entry!r}", file=sys.stderr)
        return 2
    candidate = Path(argv[1]).resolve() / entry
    timeout = float(option(argv, "--timeout", "20"))
    cases = build_cases()

    if not candidate.is_file():
        load_error: str | None = f"{entry} not found in the candidate directory"
    else:
        driver = Path(__file__).with_name("driver.py")
        try:
            proc = subprocess.run(
                [sys.executable, "-I", str(driver), str(candidate)],
                input=json.dumps(cases),
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=candidate.parent,
                check=False,
            )
            report = json.loads(proc.stdout) if proc.returncode == 0 else {"load_error": f"driver exited with {proc.returncode}"}
        except subprocess.TimeoutExpired:
            report = {"load_error": f"candidate did not finish within {timeout:g} s"}
        except json.JSONDecodeError:
            report = {"load_error": "driver produced no readable result"}
        load_error = report.get("load_error")
        if load_error is not None:  # keep machine-specific paths out of the verdict
            load_error = load_error.replace(str(candidate), entry)

    if load_error is not None:
        checks = [{"id": "loads", "passed": False, "detail": load_error}]
        checks += [{"id": c, "passed": False, "detail": "not evaluated: the candidate did not load"} for c in CHECKS if c != "loads"]
    else:
        checks = verdict(judge(cases, report["results"]), len(cases))
    json.dump({"protocol": PROTOCOL, "checks": checks}, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
