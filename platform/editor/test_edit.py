"""The editor's decisions, without ffmpeg, the speech model or the sound kit.

    python3 platform/editor/test_edit.py
"""

import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import cut  # noqa: E402
from captions import cards, srt_time  # noqa: E402
from edit import Timeline, retime  # noqa: E402
from face import IDEAL, SAFE_BOTTOM, Placer  # noqa: E402
from sound import plan as sound_plan  # noqa: E402
from takes import Word, choose  # noqa: E402


def say(text: str, at: float, step: float = 0.3) -> list[Word]:
    return [Word(t, at + i * step, at + i * step + 0.25) for i, t in enumerate(text.split())]


def silent_with_speech(words: list[Word], duration: float) -> np.ndarray:
    """A voice track that is quiet except under the words."""
    x = np.random.default_rng(1).normal(0, 0.001, int(duration * cut.SR))
    for w in words:
        x[int(w.start * cut.SR) : int(w.end * cut.SR)] += 0.3 * np.sin(np.arange(int((w.end - w.start) * cut.SR)) * 0.05)
    return x


class Takes(unittest.TestCase):
    def test_a_false_start_goes_and_the_full_line_stays(self):
        words = say('Brow lamination lasts six', 0) + say('Brow lamination lasts six to eight weeks.', 3)
        keep, dropped = choose(words)
        self.assertEqual(keep, [False] * 4 + [True] * 7)
        self.assertEqual(dropped[0]['why'], 'retake')

    def test_a_meant_repetition_stays(self):
        words = say('Ask not what your country can do for you,', 0) + say('ask what you can do for your country.', 4)
        keep, _ = choose(words)
        self.assertTrue(all(keep))

    def test_restart_chatter_and_fillers_go(self):
        words = say('Okay, again.', 0) + say('Book', 2) + [Word('um', 2.6, 2.8)] + say('today.', 3.0)
        keep, dropped = choose(words)
        self.assertEqual(keep, [False, False, True, False, True])
        self.assertEqual([d['why'] for d in dropped], ['restart', 'filler'])


class Cutting(unittest.TestCase):
    def test_pieces_follow_the_voice_and_sit_on_frames(self):
        words = say('one two three', 1.0) + say('four five', 4.0)
        voice = silent_with_speech(words, 6)
        pieces = cut.plan(words, [True] * 5, voice, 6, 'natural')
        self.assertEqual(len(pieces), 2, 'the 2.3 s pause is cut')
        self.assertAlmostEqual(pieces[0].a, 0.9, delta=0.04)
        for q in pieces:
            self.assertAlmostEqual(q.a * cut.FPS, round(q.a * cut.FPS))
        self.assertEqual(pieces[0].take, pieces[1].take, 'a trimmed pause keeps the take')

    def test_no_words_keeps_everything(self):
        self.assertEqual([(q.a, q.b) for q in cut.plan([], [], np.zeros(cut.SR), 5.0, 'natural')], [(0.0, 5.0)])

    def test_the_voice_is_exactly_as_long_as_the_pieces(self):
        voice = np.ones(cut.SR * 4) * 0.1
        pieces = [cut.Piece(0.5, 1.5, 0), cut.Piece(2.0, 3.0, 1)]
        self.assertEqual(len(cut.build_voice(voice, pieces)), 2 * cut.SR)


class Timing(unittest.TestCase):
    tl = Timeline([cut.Piece(0, 2, 0), cut.Piece(5, 8, 1)])

    def test_maps_across_a_cut(self):
        self.assertEqual(self.tl.duration, 5)
        self.assertEqual(self.tl.where(6), (1, 3))
        self.assertIsNone(self.tl.where(3))

    def test_cut_and_dropped_words_leave_the_captions(self):
        words = [Word('hi', 1, 1.5), Word('gone', 3, 3.4), Word('dropped', 5.1, 5.3), Word('there', 5.4, 5.8)]
        out = retime(words, [True, True, False, True], self.tl)
        self.assertEqual([(e.text, round(e.start, 3), k) for _, e, k in out], [('hi', 1, 0), ('there', 2.4, 1)])


class Captions(unittest.TestCase):
    def test_three_words_a_card_capitalised_at_sentence_starts(self):
        groups = cards(say('book your brows, then relax and glow.', 0) + say('later', 5))
        self.assertEqual([[x.text for x in g] for g in groups], [['Book', 'your', 'brows,'], ['then', 'relax', 'and'], ['glow.'], ['Later']])

    def test_srt_time(self):
        self.assertEqual(srt_time(3725.5), '01:02:05,500')

    def test_captions_go_under_the_chin_or_over_the_head(self):
        no_face = Placer([], 540, 557, 80)
        self.assertEqual(no_face.place(0, 1, 1.0), (IDEAL, False))
        low_face = Placer([(0.5, [500, 1400, 300, 800, 700])], 540, 557, 80)
        y, backed = low_face.place(0, 1, 1.0)
        self.assertLess(y + 40, 500, 'above the head')
        self.assertFalse(backed)
        huge = Placer([(0.5, [150, 1700, 0, 1080, 600])], 540, 557, 80)
        y, backed = huge.place(0, 1, 1.0)
        self.assertTrue(backed)
        self.assertLessEqual(y + 40, SAFE_BOTTOM)


class Sound(unittest.TestCase):
    def test_subtle_marks_the_opening_and_numbers_only(self):
        words = say('Brows are $45 and take 20 minutes', 0.5, step=0.7)
        events = sound_plan(words, [1.0, 2.0], 30, 'subtle')
        self.assertEqual([e['why'] for e in events], ['opening', 'number "$45"', 'number "20"'])
        self.assertEqual(sound_plan(words, [], 30, 'off'), [])

    def test_lively_adds_punch_ins_but_keeps_them_apart(self):
        events = sound_plan(say('hello there', 0.5), [3.0, 3.5, 8.0], 60, 'lively')
        self.assertEqual([e['at'] for e in events], [0.25, 2.95, 7.95])


if __name__ == '__main__':
    unittest.main()
