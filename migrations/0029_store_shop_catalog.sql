-- Catalog only: no seeds, no mutations to users/cards/points/orders.
CREATE TABLE IF NOT EXISTS store_shop_stores (
 id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '',
 address TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', hours TEXT NOT NULL DEFAULT '',
 image_url TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active')),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS store_shop_stores_public ON store_shop_stores(status,id);
CREATE TABLE IF NOT EXISTS store_shop_products (
 id TEXT PRIMARY KEY, shop_id TEXT NOT NULL REFERENCES store_shop_stores(id),
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', image_url TEXT NOT NULL DEFAULT '',
 price_cents INTEGER NOT NULL CHECK(price_cents>=0),
 redeem_type TEXT NOT NULL DEFAULT 'none' CHECK(redeem_type IN ('none','fixed','percent','full')),
 redeem_value INTEGER NOT NULL DEFAULT 0 CHECK(redeem_value>=0),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL,
 request_key TEXT NOT NULL, UNIQUE(shop_id,request_key)
);
CREATE INDEX IF NOT EXISTS store_shop_products_scope ON store_shop_products(shop_id,status,id);
