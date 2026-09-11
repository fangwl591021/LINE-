-- Private delivery preference only; existing postal profiles and order snapshots remain intact.
ALTER TABLE store_buyer_profiles ADD COLUMN carrier TEXT NOT NULL DEFAULT 'POST' CHECK(carrier IN ('POST','FAMILY','SEVEN'));
ALTER TABLE store_buyer_profiles ADD COLUMN store_info TEXT NOT NULL DEFAULT '';
