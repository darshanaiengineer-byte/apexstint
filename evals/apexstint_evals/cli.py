"""Command line: ``python -m apexstint_evals {validate,run,selftest} ...``.

Exit status: ``run`` -> 0 pass, 1 fail, 2 timeout/error; ``selftest`` -> 0 when every control
behaves as declared, 1 otherwise; ``validate`` -> 0 valid. Any usage or specification error -> 2.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .harness import evaluate
from .report import to_json
from .spec import SpecError, load_task

EXIT = {"pass": 0, "fail": 1, "timeout": 2, "error": 2}


def cmd_validate(args: argparse.Namespace) -> int:
    for task_dir in args.tasks:
        spec = load_task(task_dir)
        print(f"ok  {spec.id} {spec.version}  ({len(spec.controls)} controls)")
    return 0


def cmd_run(args: argparse.Namespace) -> int:
    spec = load_task(args.task)
    result = evaluate(spec, args.control, directory=args.candidate_dir)
    text = to_json(result)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(
            f"{spec.id} {spec.version} [{result.candidate}]: {result.outcome}"
            + (f" (failed: {', '.join(result.failed_checks)})" if result.failed_checks else "")
        )
    else:
        sys.stdout.write(text)
    return EXIT[result.outcome]


def cmd_selftest(args: argparse.Namespace) -> int:
    """Prove the verifier discriminates: every control must get exactly its declared verdict."""
    spec = load_task(args.task)
    problems = 0
    for control in spec.controls:
        result = evaluate(spec, control.name)
        failed = tuple(sorted(result.failed_checks))
        ok = result.outcome == control.expect and failed == control.failing_checks
        problems += not ok
        line = f"{'ok  ' if ok else 'FAIL'} {control.name:<20} expected {control.expect}"
        if control.failing_checks:
            line += f" on {', '.join(control.failing_checks)}"
        if not ok:
            line += f"; got {result.outcome}" + (f" on {', '.join(failed)}" if failed else "")
            if result.error:
                line += f" ({result.error})"
        print(line)
    print(f"{spec.id} {spec.version}: {len(spec.controls) - problems}/{len(spec.controls)} controls as declared")
    return 1 if problems else 0


def main(argv: list[str] | None = None) -> int:
    # allow_abbrev=False: an abbreviated option (e.g. --candidate for --candidate-dir) is an error, not a guess.
    parser = argparse.ArgumentParser(prog="python -m apexstint_evals", description=__doc__.splitlines()[0], allow_abbrev=False)
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("validate", help="validate task specifications", allow_abbrev=False)
    p.add_argument("tasks", nargs="+", metavar="TASK_DIR")
    p.set_defaults(func=cmd_validate)
    p = sub.add_parser("run", help="evaluate one candidate and print a JSON report", allow_abbrev=False)
    p.add_argument("task", metavar="TASK_DIR")
    which = p.add_mutually_exclusive_group(required=True)
    which.add_argument("--control", metavar="NAME", help="a control declared in task.toml (e.g. reference, starter)")
    which.add_argument("--candidate-dir", metavar="DIR", help="a directory containing a solution (always treated as a path)")
    p.add_argument("--out", help="write the JSON report to this file instead of stdout")
    p.set_defaults(func=cmd_run)
    p = sub.add_parser("selftest", help="check that every control in task.toml gets its declared verdict", allow_abbrev=False)
    p.add_argument("task", metavar="TASK_DIR")
    p.set_defaults(func=cmd_selftest)
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except (SpecError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
