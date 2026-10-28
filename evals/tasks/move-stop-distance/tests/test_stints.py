"""Visible tests for the solver. Run from the directory containing stints.py:

python -m unittest discover -s ../tests -t ..
"""

import unittest

import stints


def laps(result):
    return [s["laps"] for s in result]


def make(*counts):
    return [{"compound": "MEDIUM", "laps": n} for n in counts]


class MoveStopTest(unittest.TestCase):
    def test_moves_a_stop_and_preserves_distance(self):
        self.assertEqual(laps(stints.move_stop(make(10, 20, 27), 0, 15)), [15, 15, 27])

    def test_clamps_a_late_stop_before_the_final_lap(self):
        self.assertEqual(laps(stints.move_stop(make(10, 20, 27), 1, 100)), [10, 46, 1])

    def test_clamps_an_early_stop_after_lap_zero(self):
        self.assertEqual(laps(stints.move_stop(make(10, 20, 27), 0, -4)), [1, 29, 27])

    def test_stop_laps(self):
        self.assertEqual(stints.stop_laps(make(10, 20, 27)), [10, 30])


if __name__ == "__main__":
    unittest.main()
