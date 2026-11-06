-- Count distinct people, not requests. reporter = hash(daily random salt + IP); the salt is deleted after its day,
-- so a reporter code can't be traced back to an IP or linked across days. channel = web | mcp | rest | cli.
ALTER TABLE needs ADD COLUMN reporter TEXT;
ALTER TABLE needs ADD COLUMN channel TEXT;
CREATE TABLE IF NOT EXISTS salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);
-- Needs an admin hid from the public board (spam, abuse); by fingerprint of the need text
CREATE TABLE IF NOT EXISTS hidden_needs (
  fingerprint TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  note TEXT
);
