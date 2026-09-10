-- Owner/date-bounded, read-only sales reports; no ledger or balance changes.
CREATE INDEX IF NOT EXISTS store_cashier_sales_by_actor_date
ON store_cashier_requests(actor_id,status,updated_at);
