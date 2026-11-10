-- Preserve each new publication event without changing existing shop records.
CREATE TABLE IF NOT EXISTS store_publication_order (
 source TEXT NOT NULL CHECK(source IN ('shop','partner')),
 entity_id TEXT NOT NULL,
 published_at TEXT NOT NULL,
 PRIMARY KEY(source,entity_id)
);
CREATE TRIGGER IF NOT EXISTS store_pub_insert AFTER INSERT ON store_shop_stores WHEN NEW.status='active' BEGIN
 INSERT INTO store_publication_order VALUES('shop',NEW.id,NEW.updated_at)
 ON CONFLICT(source,entity_id) DO UPDATE SET published_at=excluded.published_at;
END;
CREATE TRIGGER IF NOT EXISTS store_pub_update AFTER UPDATE OF status ON store_shop_stores WHEN NEW.status='active' AND OLD.status!='active' BEGIN
 INSERT INTO store_publication_order VALUES('shop',NEW.id,NEW.updated_at)
 ON CONFLICT(source,entity_id) DO UPDATE SET published_at=excluded.published_at;
END;
CREATE TRIGGER IF NOT EXISTS partner_pub_insert AFTER INSERT ON point_redemption_partners WHEN NEW.status='active' BEGIN
 INSERT INTO store_publication_order VALUES('partner',NEW.partner_handle,NEW.updated_at)
 ON CONFLICT(source,entity_id) DO UPDATE SET published_at=excluded.published_at;
END;
CREATE TRIGGER IF NOT EXISTS partner_pub_update AFTER UPDATE OF status ON point_redemption_partners WHEN NEW.status='active' AND OLD.status!='active' BEGIN
 INSERT INTO store_publication_order VALUES('partner',NEW.partner_handle,NEW.updated_at)
 ON CONFLICT(source,entity_id) DO UPDATE SET published_at=excluded.published_at;
END;
