# Bug: moving a pit stop can leave a stint with zero laps

`stints.py` implements the "edit by stop lap" control of a race-strategy tool. A strategy is a
list of stints; each stint is a dict with an integer `"laps"` key (other keys, such as
`"compound"`, must be carried through untouched). A pit stop happens at the end of every stint
except the last, so stop `i` is on lap `laps[0] + … + laps[i]`.

`move_stop(stints, index, lap)` moves stop `index` to `lap` by adjusting only the two stints
either side of it, so the race distance is unchanged.

**Report.** Dragging a stop onto the previous stop, onto lap 0, or onto the final lap produces a
stint with 0 laps. The simulator rejects any stint shorter than one lap, so the whole strategy
becomes invalid:

```python
>>> move_stop([{"laps": 10}, {"laps": 20}, {"laps": 27}], 1, 100)
[{'laps': 10}, {'laps': 47}, {'laps': 0}]      # expected [10, 46, 1]
```

## Required behaviour

- The stop is clamped so both neighbouring stints keep at least one lap.
- The race distance and the number of stints never change.
- Only the two stints either side of the moved stop change; other keys are preserved.
- An `index` that does not name a stop — including a negative index — returns the strategy unchanged.
- The input list and its stint dicts are never modified.
- The result is always a `list` of stint dicts (not a tuple or another sequence). When the move
  changes the strategy, return a **new** list. When nothing changes — the index names no stop, or
  the stop is already on the clamped lap — you may return the caller's list itself or an equal new
  list (the original TypeScript `moveStop` returns the same array in that case).

Examples (lap counts only):

| stints | index | lap | result |
| --- | --- | --- | --- |
| `[10, 20, 27]` | 0 | 15 | `[15, 15, 27]` |
| `[10, 20, 27]` | 1 | 100 | `[10, 46, 1]` |
| `[10, 20, 27]` | 0 | -4 | `[1, 29, 27]` |

Run the visible tests from the directory containing your `stints.py`, where `TASK` is this task's
directory (the one containing `prompt.md` and `tests/`):

```bash
python -m unittest discover -s TASK/tests -t TASK     # from any working copy, e.g. TASK=/path/to/move-stop-distance
python -m unittest discover -s ../tests -t ..         # shorthand when working inside TASK/starter/
```

A hidden verifier checks the behaviour above over many more inputs.
