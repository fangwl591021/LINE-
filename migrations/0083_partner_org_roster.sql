-- Display-only, restricted to the named chart owner and authorized administrators.
CREATE TABLE IF NOT EXISTS partner_org_roster (
 root_uid TEXT NOT NULL, node_key TEXT NOT NULL, parent_key TEXT NOT NULL,
 alias TEXT NOT NULL DEFAULT '', source_ref TEXT NOT NULL,
 PRIMARY KEY(root_uid,node_key), CHECK(root_uid<>node_key AND parent_key<>node_key)
);
