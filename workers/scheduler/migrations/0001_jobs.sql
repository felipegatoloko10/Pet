CREATE TABLE jobs(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,kind TEXT NOT NULL,entity_id TEXT,due_at INTEGER NOT NULL,lease_until INTEGER NOT NULL DEFAULT 0,attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX jobs_due ON jobs(due_at,lease_until);
CREATE INDEX jobs_user ON jobs(user_id);
