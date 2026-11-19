"""Deterministic cohort demonstration and auditable unit-economics calculations."""

from __future__ import annotations

import argparse
import csv
import json
import random
import sqlite3
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_config(path: Path = ROOT / "config" / "pilot.json") -> dict:
    cfg = json.loads(path.read_text(encoding="utf-8"))
    assert cfg["currency"] == "AED"
    assert cfg["contribution_per_full_price_order_aed"] > 0
    days = cfg["repeat_order_days"]
    assert days == sorted(set(days)) and all(0 < day <= 90 for day in days)
    names = [c["name"] for c in cfg["channels"]]
    assert len(names) == len(set(names))
    for c in cfg["channels"]:
        assert c["customers"] > 0 and c["cac_aed"] >= 0
        assert 0 <= c["first_order_discount_aed"] <= cfg["contribution_per_full_price_order_aed"]
        assert len(c["repeat_probabilities"]) == len(days)
        assert all(0 <= p <= 1 for p in c["repeat_probabilities"])
    return cfg


def projected_economics(channel: dict, contribution: float) -> dict:
    """Expectation for four independent *opportunities* to repurchase within 90 days."""
    D = lambda value: Decimal(str(value))
    repeats = sum((D(p) for p in channel["repeat_probabilities"]), Decimal("0"))
    net_before_cac = D(contribution) * (1 + repeats) - D(channel["first_order_discount_aed"])
    round_money = lambda value: float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
    return {
        "channel": channel["name"],
        "expected_orders_90d": float(1 + repeats),
        "break_even_cac_aed": round_money(net_before_cac),
        "assumed_cac_aed": channel["cac_aed"],
        "expected_contribution_after_cac_aed": round_money(net_before_cac - D(channel["cac_aed"])),
        "minimum_expected_repeat_orders_to_break_even": round_money(max(Decimal("0"), (D(channel["cac_aed"]) + D(channel["first_order_discount_aed"])) / D(contribution) - 1)),
    }


def generate_demo_db(conn: sqlite3.Connection, cfg: dict, seed: int = 20261119) -> None:
    """Populate an in-memory database. This is an illustration, not customer data."""
    conn.executescript("""
    CREATE TABLE customers (
        customer_id INTEGER PRIMARY KEY,
        channel TEXT NOT NULL,
        acquisition_cost_aed REAL NOT NULL CHECK (acquisition_cost_aed >= 0)
    );
    CREATE TABLE orders (
        order_id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(customer_id),
        order_day INTEGER NOT NULL CHECK (order_day BETWEEN 0 AND 90),
        contribution_aed REAL NOT NULL
    );
    CREATE INDEX idx_orders_customer_day ON orders(customer_id, order_day);
    """)
    rng = random.Random(seed)
    order_id, customer_id = 0, 0
    for channel in cfg["channels"]:
        for _ in range(channel["customers"]):
            customer_id += 1
            conn.execute("INSERT INTO customers VALUES (?, ?, ?)",
                         (customer_id, channel["name"], channel["cac_aed"]))
            order_id += 1
            first_order_contribution = cfg["contribution_per_full_price_order_aed"] - channel["first_order_discount_aed"]
            conn.execute("INSERT INTO orders VALUES (?, ?, ?, ?)",
                         (order_id, customer_id, 0, first_order_contribution))
            for day, probability in zip(cfg["repeat_order_days"], channel["repeat_probabilities"]):
                if rng.random() < probability:
                    order_id += 1
                    conn.execute("INSERT INTO orders VALUES (?, ?, ?, ?)",
                                 (order_id, customer_id, day, cfg["contribution_per_full_price_order_aed"]))
    conn.commit()


def query_cohorts(conn: sqlite3.Connection) -> list[dict]:
    query = (ROOT / "sql" / "cohort_report.sql").read_text(encoding="utf-8")
    cur = conn.execute(query)
    return [dict(zip([c[0] for c in cur.description], row)) for row in cur.fetchall()]


def market_context(path: Path = ROOT / "data" / "market_context.csv") -> dict:
    with path.open(encoding="utf-8", newline="") as stream:
        rows = list(csv.DictReader(stream))
    tourist = {int(r["year"]): int(r["value"]) for r in rows if r["metric"] == "international_overnight_visitors"}
    resident = next(int(r["value"]) for r in rows if r["metric"] == "resident_population")
    return {
        "dubai_2024_international_overnight_visitors": tourist[2024],
        "dubai_2025_international_overnight_visitors": tourist[2025],
        "visitor_growth_2024_to_2025_pct": round((tourist[2025] / tourist[2024] - 1) * 100, 2),
        "dubai_2025_resident_population": resident,
        "warning": "Visitors and population are city-level context, not coffee buyers or TAM estimates."
    }


def run(seed: int = 20261119) -> dict:
    cfg = load_config()
    with sqlite3.connect(":memory:") as conn:
        generate_demo_db(conn, cfg, seed=seed)
        measured_on_demo = query_cohorts(conn)
    return {
        "project": "UAE coffee app growth: 90-day acquisition economics",
        "data_status": "Generated customer and order events; cost parameters are illustrative inputs, not Luckin results.",
        "market_context": market_context(),
        "assumption_based_channel_economics": [projected_economics(c, cfg["contribution_per_full_price_order_aed"]) for c in cfg["channels"]],
        "generated_demo_cohort_sql_results": measured_on_demo,
        "decision_rule": "Scale a paid channel only when measured 90-day contribution after first-order discounts covers fully loaded CAC, with a holdout and uncertainty bounds."
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="UAE coffee app growth case study")
    parser.add_argument("--seed", type=int, default=20261119)
    parser.add_argument("--output", type=Path, default=ROOT / "outputs" / "analysis.json")
    args = parser.parse_args()
    report = run(seed=args.seed)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("90-day contribution after CAC (AED/customer):")
    for row in report["assumption_based_channel_economics"]:
        print(f"  {row['channel']:<14} {row['expected_contribution_after_cac_aed']:>7.2f}  | CAC cap {row['break_even_cac_aed']:>6.2f}")
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
