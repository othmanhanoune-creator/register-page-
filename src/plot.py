"""Generate a plain SVG summary from scenario assumptions; no charting dependencies."""

from __future__ import annotations

import json
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def plot(report_file: Path = ROOT / "outputs" / "analysis.json") -> Path:
    report = json.loads(report_file.read_text(encoding="utf-8"))
    rows = report["assumption_based_channel_economics"]
    max_abs = max(abs(r["expected_contribution_after_cac_aed"]) for r in rows)
    origin_x, scale = 345, 255 / max_abs
    bits = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 400" role="img" aria-labelledby="title desc">',
        '<title id="title">90-day modeled contribution by acquisition channel</title>',
        '<desc id="desc">Scenario assumptions, not retail sales. Paid social is negative; referral and organic are positive.</desc>',
        '<rect width="900" height="400" rx="18" fill="#f7f9f8"/>',
        '<text x="48" y="52" font-family="Arial, sans-serif" font-weight="700" font-size="24" fill="#172c34">UAE coffee app | 90-day acquisition economics</text>',
        '<text x="48" y="81" font-family="Arial, sans-serif" font-size="15" fill="#52646d">AED per acquired customer  •  modeled assumptions, not observed ROI</text>',
        f'<line x1="{origin_x}" y1="113" x2="{origin_x}" y2="318" stroke="#64747b" stroke-width="1.5"/>',
    ]
    for idx, row in enumerate(rows):
        y = 130 + idx * 70
        val = row["expected_contribution_after_cac_aed"]
        w = abs(val) * scale
        x = origin_x if val >= 0 else origin_x - w
        color = '#1f8075' if val >= 0 else '#b3584e'
        label = escape(row['channel'])
        bits.append(f'<text x="48" y="{y + 23}" font-family="Arial, sans-serif" font-size="18" fill="#172c34">{label}</text>')
        bits.append(f'<rect x="{x:.2f}" y="{y}" width="{w:.2f}" height="38" rx="5" fill="{color}"/>')
        text_x = origin_x + 14 if val >= 0 else origin_x - 14
        anchor = 'start' if val >= 0 else 'end'
        bits.append(f'<text x="{text_x}" y="{y + 24}" text-anchor="{anchor}" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#152e37">{val:+.2f}</text>')
    bits += [
        '<text x="48" y="359" font-family="Arial, sans-serif" font-size="12" fill="#52646d">Inputs: config/pilot.json | Modeled first order + scheduled repeat opportunities through day 90</text>',
        '</svg>'
    ]
    target = ROOT / "outputs" / "channel_economics.svg"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("\n".join(bits) + "\n", encoding="utf-8")
    return target


if __name__ == "__main__":
    print(plot())
