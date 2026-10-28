# ApexStint evaluation tasks

Reproducible coding tasks derived from ApexStint's own invariants, with a small harness that runs a candidate solution against a hidden behavioural verifier and writes a machine-readable report. Use it to evaluate a coding agent (or a person) on a realistic bug fix, and to prove that the task itself is sound: the reference passes, the seeded bug fails for the intended reason, and plausible wrong fixes are rejected.

The harness is standard-library Python 3.11 or 3.12 (3.11 is the minimum, for `tomllib`). Locally only 3.12 has been run; the CI `evals` job runs both versions, and 3.11 support is confirmed only once that job has passed on GitHub. `pytest` and `ruff` are needed only to test and lint it.

## Commands

Run from `evals/`:

```bash
python -m pip install -r requirements-dev.txt          # pytest + ruff (pinned); not needed to run tasks

python -m apexstint_evals validate tasks/*/            # check every task.toml
python -m apexstint_evals selftest tasks/move-stop-distance
python -m apexstint_evals run tasks/move-stop-distance --control starter                  # JSON report on stdout
python -m apexstint_evals run tasks/move-stop-distance --candidate-dir path/to/solution --out report.json

python -m pytest -q                                    # harness + task tests
ruff check . && ruff format --check .
```

`run` takes exactly one of `--control NAME` (a control declared in `task.toml`: `reference`, `starter` or a mutant) or `--candidate-dir DIR` (a directory containing the task's `entry_file`, always treated as a path, so a directory called `reference` is never mistaken for the task's reference). Abbreviated options are rejected. Exit status of `run`: 0 pass, 1 fail, 2 timeout or error. `selftest` exits 0 only when every control gets exactly its declared verdict.

To attempt the task by hand: copy `tasks/move-stop-distance/starter/` somewhere, read `prompt.md`, fix `stints.py` (from your copy, the visible tests run with `python -m unittest discover -s TASK/tests -t TASK`, where `TASK` is the task directory), then `run --candidate-dir <your copy>`.

## Layout

```
evals/
  apexstint_evals/      the harness
    spec.py             task.toml schema and validation
    runner.py           subprocess execution: argv only, timeout, process-group kill, output cap, minimal env
    scoring.py          verifier protocol parsing -> pass / fail / timeout / error
    harness.py          task execution: copy candidate to a temp workspace, run verifier, score
    report.py           deterministic JSON report + digest
    cli.py              validate / run / selftest
  tasks/<task-id>/
    task.toml           id, version, limits, acceptance criteria, verifier command, controls
    prompt.md           what the solver is told
    starter/            code handed to the solver, with the seeded bug
    reference/          known-good solution
    tests/              tests the solver may see
    verifier/           hidden checks; prints the verifier protocol
    mutants/<name>/     plausible incorrect solutions (negative controls)
  tests/                pytest suite for the harness and the bundled task
```

## Execution flow

1. `spec.load_task` validates `task.toml` strictly (unknown keys, wrong types, paths escaping the task directory, unknown placeholders and shell-string commands are errors).
2. `harness.evaluate` copies the candidate into a fresh temporary workspace (the original is never written to) and substitutes `{python}`, `{task}`, `{workspace}` and `{entry_file}` into the verifier's argument list. The command must pass `{entry_file}`, so the file named in `task.toml` is the one verified.
3. `runner.run_command` executes it without a shell, in a new process group, with a minimal environment (the caller's variables are not copied in — hygiene, not a secrecy boundary; see below), the task's timeout and an output cap.
4. `scoring.score` turns the run into an outcome. Only a verifier that exits 0 with well-formed protocol output can produce `pass` or `fail`; anything else is `timeout` or `error`, never a pass.
5. `report.to_json` writes the report.

### Verifier protocol (version 1)

The verifier exits 0 and prints one JSON object: `{"protocol": 1, "checks": [{"id": "kebab-id", "passed": true, "detail": "..."}]}`. A failing candidate is still a successful verifier run. Check ids must be unique; at least one check is required.

### Report

```json
{
  "candidate": "starter",
  "checks": [{"id": "min-one-lap", "passed": false, "detail": "move_stop(laps=[1, 1], index=0, lap=-1) -> [0, 2]"}, "..."],
  "diagnostics": "",
  "digest": "sha256:…",
  "error": null,
  "failed_checks": ["examples", "min-one-lap", "stop-placement"],
  "outcome": "fail",
  "report_version": 1,
  "runtime": {"seconds": 1.21},
  "task": {"id": "move-stop-distance", "version": "1.1.0"},
  "tools": {"harness": "0.1.0", "python": "3.12.3", "python_implementation": "CPython"}
}
```

Keys are sorted. Everything except `runtime` is a function of the task, the candidate and the tool versions; `digest` is the SHA-256 of the canonical JSON without `runtime`, so equal digests mean equal results. Temporary and task paths are replaced by `<workspace>`, `<task>` and `<tmp>`, so reports are comparable across machines.

## The bundled task: `move-stop-distance`

Derived from `moveStop` in `src/lib/sim/model.ts` (the strategy lab's "edit by stop lap" control) and its invariant that editing a stop preserves race distance and keeps every stint at least one lap long (`LIMITS.stintLaps.min`). The task is a Python port on synthetic stint lists; it uses no race data, so the dataset licence does not apply to it.

- **Contract on identity** (mirrors the TypeScript `moveStop`, which returns the same array when nothing changes): a move that changes the strategy must return a new list; a no-op (invalid index, or the stop already on the clamped lap) may return the caller's list itself or an equal new list. The input is never modified either way.
- **Seeded bug** (`starter/`): the stop is clamped to `[previous stop, next stop]` instead of `[previous stop + 1, next stop − 1]`, so dragging a stop onto a neighbour leaves a 0-lap stint. Distance is still preserved; the visible tests reproduce the bug report.
- **Verifier**: an exhaustive enumeration of 30,331 cases (1–4 stints of 1–4 laps, every index from −2 to the stint count, every target lap from −1 to distance + 2, plus the documented examples), judged on 13 named checks: distance preserved, every stint ≥ 1 lap, stint count preserved, other keys preserved, only neighbouring stints change, stop placement, invalid (including negative) index is a no-op, input not mutated, the result is a real `list` (a tuple is rejected), a change returns a new list, and more. Type and identity are recorded in the candidate's process before results are serialised, because JSON cannot distinguish a tuple from a list or a new list from the caller's. It checks behaviour, not source text: an independently written implementation passes (`test_an_alternative_correct_implementation_passes`).
- **Negative controls**, each rejected for its own reason:

| Control | Plausible mistake | Rejected by |
| --- | --- | --- |
| `upper-bound-only` | fixes only the reported end-of-race symptom | `min-one-lap`, `stop-placement`, `examples` |
| `drop-empty-stints` | deletes the empty stint instead of preventing it | `stint-count-preserved`, `examples` |
| `clamp-each-stint` | forces every stint to ≥ 1 lap after the move | `distance-preserved`, `stop-placement`, `examples` |
| `mutates-input` | correct laps, but edits the caller's dicts | `input-unchanged` |
| `negative-index` | correct clamp, but Python's negative indexing moves a stop | `invalid-index-unchanged`, `no-exceptions`, `min-one-lap` |

- **Reference** (`reference/`): tested against a brute-force specification (search over every legal split, sharing no arithmetic with the reference) on more than 50,000 inputs, in addition to the verifier.

## Adding a task

1. Create `tasks/<task-id>/` (the directory name must equal `id`) with the layout above.
2. Write the verifier to print protocol output and exit 0. Check properties of the contract rather than one expected patch; avoid randomness, clocks, network and absolute paths in check details. Run candidate code in a separate process (see `move-stop-distance/verifier/driver.py`) so it cannot rewrite the verdict.
3. Declare controls in `task.toml`: the reference (`expect = "pass"`), the starter and at least two plausible wrong fixes (`expect = "fail"`, with the exact `failing_checks`).
4. Run `python -m apexstint_evals validate tasks/<task-id>` and `python -m apexstint_evals selftest tasks/<task-id>`; CI runs both for every task.
5. Bump the task's `version` whenever the prompt, verifier or limits change, so old reports stay distinguishable.

## Security limits — read before running untrusted code

The runner is **process isolation for well-behaved code, not a sandbox.** What it does:

- prevents shell injection (argument lists only, never a shell);
- on **timeout**, kills the command's whole process group, so helpers in the group cannot keep a run alive;
- caps captured output;
- does not copy the caller's environment variables into the child's environment;
- never writes to the candidate's directory (it works on a temporary copy).

What it does **not** do:

- **Protect secrets in your environment.** Environment filtering is hygiene, not a security boundary: candidate code runs as your user and can read accessible process metadata, including the environments of its ancestor processes through `/proc/<pid>/environ` (verified: a candidate read a variable from the shell that launched the harness and surfaced it in the report). **Never launch untrusted candidate code from a shell or session that holds credentials** (API keys, cloud or Git tokens, SSH agents).
- **Stop processes after a normal exit.** Only a timeout kills the process group. If the verifier finishes normally, descendants still running in its group are left alone (verified: a background `sleep` started by a candidate outlived the run), because once the leader has been reaped its process id may be reused and killing that group could hit an unrelated process. A process that leaves the group (e.g. via `setsid`) also survives a timeout.
- **Restrict filesystem access.** Candidate code can read or modify anything you can, including the task's hidden verifier and reference and files outside the workspace.
- **Block network access.**
- **Limit** memory, CPU (beyond wall-clock time), disk use or process count.
- **Bound memory while capturing output** (output is truncated after capture, not while reading).

The `move-stop-distance` verifier runs candidate code in a child process and judges only the returned data, so printed output cannot forge a verdict; but the type, identity and input-mutation flags are measured inside the candidate's process, and any candidate with filesystem access could read the hidden reference (verified: a candidate that loads it passes) or tamper with the task files. Hash randomisation is not controlled either: verifiers run with `python -I`, which ignores `PYTHONHASHSEED`, so verifiers must not depend on hash order (tested by running the verifier repeatedly). **Run untrusted or agent-generated code only inside a disposable container or VM** (no credentials, no network, read-only task files) and treat this harness as the inner layer.
