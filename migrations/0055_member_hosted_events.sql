-- VEO semantics adapted to existing point-system users. No official activity/point writes.
CREATE TABLE member_hosted_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(row_id),
  create_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  registration_closes_at TEXT NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 0 CHECK(typeof(capacity)='integer' AND capacity BETWEEN 0 AND 10000),
  fee_text TEXT NOT NULL DEFAULT '免費',
  cover_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0,
  last_key TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_id,create_key),
  CHECK(julianday(ends_at)>julianday(starts_at)),
  CHECK(julianday(registration_closes_at)<=julianday(ends_at))
);
CREATE INDEX idx_member_hosted_owner ON member_hosted_events(owner_id,ends_at);
CREATE TABLE member_event_registrations (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES member_hosted_events(id),
  member_id TEXT NOT NULL REFERENCES users(row_id),
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','cancelled')),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TEXT,
  checked_in_at TEXT,
  checked_in_by TEXT REFERENCES users(row_id),
  ticket_hash TEXT,
  ticket_expires_at TEXT,
  UNIQUE(event_id,member_id)
);
CREATE INDEX idx_member_event_registrations_member ON member_event_registrations(member_id,registered_at);
CREATE UNIQUE INDEX idx_member_event_ticket ON member_event_registrations(ticket_hash) WHERE ticket_hash IS NOT NULL;
CREATE TRIGGER member_hosted_single_insert BEFORE INSERT ON member_hosted_events BEGIN
  SELECT RAISE(ABORT,'hosted_event_active') WHERE EXISTS(SELECT 1 FROM member_hosted_events WHERE owner_id=NEW.owner_id AND status='active' AND julianday(ends_at)>julianday('now'));
END;
CREATE TRIGGER member_hosted_update_guard BEFORE UPDATE ON member_hosted_events BEGIN
  SELECT RAISE(ABORT,'hosted_event_closed') WHERE OLD.status!='active' OR julianday(OLD.ends_at)<=julianday('now');
  SELECT RAISE(ABORT,'hosted_owner_invalid') WHERE NEW.owner_id!=OLD.owner_id OR NEW.id!=OLD.id OR NEW.create_key!=OLD.create_key;
  SELECT RAISE(ABORT,'hosted_event_active') WHERE NEW.status='active' AND julianday(NEW.ends_at)>julianday('now') AND EXISTS(SELECT 1 FROM member_hosted_events WHERE id!=OLD.id AND owner_id=NEW.owner_id AND status='active' AND julianday(ends_at)>julianday('now'));
  SELECT RAISE(ABORT,'hosted_capacity_too_small') WHERE NEW.capacity>0 AND NEW.capacity<(SELECT COUNT(*) FROM member_event_registrations WHERE event_id=OLD.id AND status='registered');
END;
CREATE TRIGGER member_registration_insert_guard BEFORE INSERT ON member_event_registrations
WHEN NOT EXISTS(SELECT 1 FROM member_event_registrations WHERE event_id=NEW.event_id AND member_id=NEW.member_id AND status='registered') BEGIN
  SELECT RAISE(ABORT,'hosted_registration_closed') WHERE NOT EXISTS(SELECT 1 FROM member_hosted_events WHERE id=NEW.event_id AND status='active' AND julianday(ends_at)>julianday('now') AND julianday(registration_closes_at)>julianday('now'));
  SELECT RAISE(ABORT,'hosted_event_full') WHERE EXISTS(SELECT 1 FROM member_hosted_events h WHERE h.id=NEW.event_id AND h.capacity>0 AND (SELECT COUNT(*) FROM member_event_registrations WHERE event_id=h.id AND status='registered')>=h.capacity);
END;
CREATE TRIGGER member_registration_rejoin_guard BEFORE UPDATE OF status ON member_event_registrations
WHEN OLD.status='cancelled' AND NEW.status='registered' BEGIN
  SELECT RAISE(ABORT,'hosted_registration_closed') WHERE NOT EXISTS(SELECT 1 FROM member_hosted_events WHERE id=NEW.event_id AND status='active' AND julianday(ends_at)>julianday('now') AND julianday(registration_closes_at)>julianday('now'));
  SELECT RAISE(ABORT,'hosted_event_full') WHERE EXISTS(SELECT 1 FROM member_hosted_events h WHERE h.id=NEW.event_id AND h.capacity>0 AND (SELECT COUNT(*) FROM member_event_registrations WHERE event_id=h.id AND status='registered')>=h.capacity);
END;
