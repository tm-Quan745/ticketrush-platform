import unittest
from sellout_contract import cohort_complete


class SelloutContractTest(unittest.TestCase):
    def test_every_member_must_have_a_terminal_outcome(self):
        seed = list(range(5000))
        self.assertTrue(cohort_complete(seed, seed[:2000], seed[2000:], 1998, 2, 3000))
        self.assertFalse(cohort_complete(seed, seed[:2000], seed[2000:], 1997, 2, 3000))
        self.assertFalse(cohort_complete(seed, seed[:2000], seed[2000:], 1998, 2, 2999))
        self.assertFalse(cohort_complete(seed, seed[:2000], seed[2001:], 1998, 2, 2999))

    def test_empty_work_and_duplicate_or_reordered_admissions_fail(self):
        seed = list(range(5000))
        self.assertFalse(cohort_complete(seed, [], seed, 0, 0, 5000))
        self.assertFalse(cohort_complete(seed, [0, 0], seed[2:], 2, 0, 4998))
        self.assertFalse(cohort_complete(seed, [1, 0], seed[2:], 2, 0, 4998))
