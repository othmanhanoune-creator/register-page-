import sqlite3
import unittest
from src.growth import load_config, projected_economics, generate_demo_db, query_cohorts, run

class GrowthCaseTests(unittest.TestCase):
    def setUp(self):
        self.cfg = load_config()

    def test_base_case_expected_units(self):
        paid = self.cfg["channels"][0]
        res = projected_economics(paid, self.cfg["contribution_per_full_price_order_aed"])
        self.assertAlmostEqual(res["expected_orders_90d"], 1.65)
        self.assertAlmostEqual(res["break_even_cac_aed"], 9.68)  # rounded from AED 9.675
        self.assertLess(res["expected_contribution_after_cac_aed"], 0)

    def test_generation_is_deterministic(self):
        with sqlite3.connect(":memory:") as a, sqlite3.connect(":memory:") as b:
            generate_demo_db(a, self.cfg, seed=15)
            generate_demo_db(b, self.cfg, seed=15)
            self.assertEqual(query_cohorts(a), query_cohorts(b))

    def test_all_acquired_customers_have_one_initial_order(self):
        with sqlite3.connect(":memory:") as db:
            generate_demo_db(db, self.cfg)
            actual = db.execute("SELECT COUNT(*) FROM orders WHERE order_day=0").fetchone()[0]
            expected = sum(c["customers"] for c in self.cfg["channels"])
            self.assertEqual(actual, expected)

    def test_cohort_rates_have_valid_denominators(self):
        res = run()
        for row in res["generated_demo_cohort_sql_results"]:
            self.assertTrue(0 <= row["repeat_30d_rate"] <= row["repeat_90d_rate"] <= 1)
            self.assertGreaterEqual(row["orders_per_customer_90d"], 1)
        self.assertEqual(sum(row["acquired_customers"] for row in res["generated_demo_cohort_sql_results"]), 1300)

if __name__ == "__main__":
    unittest.main()
