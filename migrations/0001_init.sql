-- Anonymous unmet needs: no user identity, IP, user agent or exact time
CREATE TABLE IF NOT EXISTS needs (
  id TEXT PRIMARY KEY,
  need TEXT NOT NULL,
  category TEXT,
  platform TEXT,
  budget TEXT,
  day TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS needs_fingerprint ON needs (fingerprint);

-- Anonymous daily counters
CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,
  key TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, key)
);

-- Products submitted by makers
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  day TEXT NOT NULL,
  url TEXT NOT NULL,
  product TEXT NOT NULL,
  contact TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS submissions_status ON submissions (status);
CREATE INDEX IF NOT EXISTS submissions_url ON submissions (url);

-- Approved products, merged on top of the bundled catalog
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL
);
