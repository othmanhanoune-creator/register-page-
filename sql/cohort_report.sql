-- First purchase defines acquisition cohort; repeat purchase windows use days since purchase.
-- All order and acquisition events in the demo database are generated, not observed.
WITH first_orders AS (
    SELECT customer_id, MIN(order_day) AS first_day
    FROM orders
    GROUP BY customer_id
),
customer_rollup AS (
    SELECT c.channel,
           c.customer_id,
           COUNT(o.order_id) AS orders_90d,
           MAX(CASE WHEN o.order_day > f.first_day AND o.order_day - f.first_day <= 30 THEN 1 ELSE 0 END) AS repeated_by_day_30,
           MAX(CASE WHEN o.order_day > f.first_day AND o.order_day - f.first_day <= 90 THEN 1 ELSE 0 END) AS repeated_by_day_90,
           SUM(o.contribution_aed) AS order_contribution_aed,
           c.acquisition_cost_aed AS acquisition_cost_aed
    FROM customers c
    JOIN first_orders f ON f.customer_id = c.customer_id
    JOIN orders o ON o.customer_id = c.customer_id
    GROUP BY c.channel, c.customer_id
)
SELECT channel,
       COUNT(*) AS acquired_customers,
       SUM(orders_90d) AS orders_90d,
       ROUND(1.0 * SUM(repeated_by_day_30) / COUNT(*), 4) AS repeat_30d_rate,
       ROUND(1.0 * SUM(repeated_by_day_90) / COUNT(*), 4) AS repeat_90d_rate,
       ROUND(AVG(orders_90d), 4) AS orders_per_customer_90d,
       ROUND(SUM(order_contribution_aed) / COUNT(*), 2) AS contribution_before_cac_per_customer_aed,
       ROUND(SUM(acquisition_cost_aed) / COUNT(*), 2) AS cac_per_customer_aed,
       ROUND(SUM(order_contribution_aed - acquisition_cost_aed) / COUNT(*), 2) AS contribution_after_cac_per_customer_aed
FROM customer_rollup
GROUP BY channel
ORDER BY CASE channel WHEN 'Paid social' THEN 1 WHEN 'Referral' THEN 2 ELSE 3 END;
