"""Run a candidate's ``move_stop`` on cases read from stdin and report what it returned.

Usage: driver.py <path to candidate stints.py>   (cases as JSON on stdin)

This runs in its own process, started by ``verify.py``, so candidate code never executes in the
process that decides the verdict. Anything the candidate prints is discarded: file descriptor 1
is pointed at /dev/null before the candidate is imported, and the protocol is written to a
duplicate of the original stdout.

Facts that JSON would erase are recorded here, at return time: whether the result is a ``list``
(a tuple serialises as a JSON array too), whether it is the very list passed in, and whether the
input was modified. Each result is snapshotted immediately, so a candidate that keeps and later
changes an object it returned cannot alter what is judged. These flags are measured inside the
candidate's process, so a deliberately adversarial candidate could falsify them; every other
property is checked by the verifier from the returned data.
"""

from __future__ import annotations

import copy
import importlib.util
import json
import os
import sys


def describe(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"


def main() -> int:
    candidate_path = sys.argv[1]
    cases = json.load(sys.stdin)

    protocol_fd = os.dup(1)
    devnull = os.open(os.devnull, os.O_WRONLY)
    os.dup2(devnull, 1)

    report: dict[str, object]
    try:
        spec = importlib.util.spec_from_file_location("candidate_stints", candidate_path)
        if spec is None or spec.loader is None:
            raise ImportError("not a loadable Python file")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        move_stop = getattr(module, "move_stop", None)
        if not callable(move_stop):
            raise AttributeError("module does not define a callable move_stop")
    except (Exception, SystemExit) as exc:
        report = {"load_error": describe(exc)}
    else:
        results = []
        for case in cases:
            stints = copy.deepcopy(case["stints"])
            try:
                returned = move_stop(stints, case["index"], case["lap"])
                results.append(
                    {
                        "result": json.loads(json.dumps(returned)),  # snapshot; must be plain data
                        "is_list": isinstance(returned, list),
                        "is_input": returned is stints,
                        "mutated": stints != case["stints"],
                    }
                )
            except (Exception, SystemExit) as exc:
                results.append({"error": describe(exc)})
        report = {"results": results}

    with os.fdopen(protocol_fd, "w", encoding="utf-8") as out:
        json.dump(report, out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
