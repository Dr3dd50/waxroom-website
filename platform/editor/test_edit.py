"""The editor's timing logic, without ffmpeg or the speech model.

    python3 platform/editor/test_edit.py
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from edit import Timeline, Word, cards, keep_ranges, retime, srt_time  # noqa: E402


class Cutting(unittest.TestCase):
    def test_a_word_auto_editor_called_quiet_is_kept(self):
        keeps = keep_ranges([(0, 2), (5, 8)], [Word('quietly', 3.0, 3.5)], 10, 'natural')
        self.assertEqual(keeps, [(0, 2), (2.94, 3.56), (5, 8)])

    def test_short_gaps_join_and_clicks_go(self):
        keeps = keep_ranges([(0, 2), (2.2, 4), (6, 6.1)], [], 10, 'natural')
        self.assertEqual(keeps, [(0, 4)])

    def test_nothing_loud_keeps_the_whole_video(self):
        self.assertEqual(keep_ranges([], [], 7, 'natural'), [(0.0, 7)])


class Timing(unittest.TestCase):
    tl = Timeline([(0, 2), (5, 8)])

    def test_maps_across_a_cut(self):
        self.assertEqual(self.tl.duration, 5)
        self.assertEqual(self.tl.map(6), 3)
        self.assertIsNone(self.tl.map(3))
        self.assertEqual(self.tl.cut_points(), [(2, 3)])

    def test_words_follow_the_cut_and_cut_words_drop(self):
        words = retime([Word('hi', 1, 1.5), Word('gone', 3, 3.4), Word('there', 5.2, 5.6)], self.tl)
        self.assertEqual([(w.text, round(w.start, 3), round(w.end, 3)) for w in words], [('hi', 1, 1.5), ('there', 2.2, 2.6)])


class Captions(unittest.TestCase):
    def test_cards_break_at_punctuation_pauses_and_three_words(self):
        w = lambda t, s: Word(t, s, s + 0.2)  # noqa: E731
        groups = cards([w('Book', 0), w('your', 0.2), w('brows,', 0.4), w('then', 0.6), w('relax', 0.8), w('and', 1.0), w('glow', 1.2), w('later', 3)])
        self.assertEqual([[x.text for x in g] for g in groups], [['Book', 'your', 'brows,'], ['then', 'relax', 'and'], ['glow'], ['later']])

    def test_srt_time(self):
        self.assertEqual(srt_time(3725.5), '01:02:05,500')


if __name__ == '__main__':
    unittest.main()
