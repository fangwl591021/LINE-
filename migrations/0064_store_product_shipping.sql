-- NULL preserves legacy per-shop shipping until a merchant explicitly sets a fee.
ALTER TABLE store_shop_products ADD COLUMN shipping_fee_cents INTEGER
  CHECK (shipping_fee_cents IS NULL OR
    (typeof(shipping_fee_cents)='integer' AND shipping_fee_cents BETWEEN 0 AND 1000000));
