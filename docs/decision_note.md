# Pilot decision note — Dubai coffee app

**Question:** With a first-order promotion, can acquisition repay its cost within 90 days?

## Working decision

Under the selected inputs, referral has positive expected 90-day contribution while paid social does not. Do **not** interpret the simulated result as an operational recommendation to cut actual paid media. The scenario establishes the CAC and retention thresholds that real cohort data would need to clear.

The first order carries most of the incentive, but the hypothesis only survives if a meaningful proportion of users return without equally expensive repeat subsidies. If the first-order promotional cost is not netted from margin, the model overstates payback.

## Measurement contract

| Field | Meaning | Check |
| --- | --- | --- |
| `customer_id` | Pseudonymous user key, not device ID | One unique first purchase |
| `channel` | Last eligible attributable acquisition source | Keep an unattributed bucket; audit self-referrals |
| `order_day` | Integer days after first purchase | Only 0 to 90 in this study |
| `contribution_aed` | Net variable contribution after discounts per order | Exclude refunded orders, include variable delivery/platform fees |
| `acquisition_cost_aed` | Incremental acquisition spending divided by acquired users | Attribute offers and paid media without double counting |

**Day-30 repeat rate** = acquired customers with at least one additional order on days 1–30 / acquired customers.

**Day-90 repeat rate** = acquired customers with at least one additional order on days 1–90 / acquired customers. The day-90 rate is cumulative, not a monthly-active-user metric.

**90-day contribution after CAC** = all order-level variable contribution over days 0–90, minus attributable acquisition cost, divided by acquired customers.

## Experiment proposal

Test an Arabic-language referral invite against a paid acquisition creative in comparable store catchments. Randomize exposure within eligible audiences and preserve a no-offer holdout. Track coupon misuse and unsuccessful deliveries, and stratify results by first-order day and acquisition source. Wait until each cohort has a full 90-day observation window before declaring the payback comparison final.

### Gating risks

- A platform coupon can subsidize users who would have ordered anyway; raw redemptions do not measure incremental lift.
- Tourism counts are neither unique app users nor coffee purchase occasions.
- The sample lacks actual order frequency, margins, fraud, site availability and geographic distribution; none may be inferred.
- Time-of-day, local observances, language and menu preferences require live local validation, not assumptions from a national label.

## Sources

- Dubai DET 2024 annual visitor report: https://www.dubaidet.gov.ae/en/research-and-insights/annual-visitor-report-2024
- Dubai DET 2025 tourism performance: https://www.dubaidet.gov.ae/en/research-and-insights/tourism-performance-report-december-2025
- Digital Dubai end-2025 population: https://www.digitaldubai.ae/newsroom/news/dubai-digital-dubai%27s-population-tops-4.580-million-by-the-end-of-2025-recording-7.5-growth
