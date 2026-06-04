CREATE TABLE IF NOT EXISTS deleted_accounts (
  id SERIAL PRIMARY KEY,
  email TEXT,
  google_id TEXT,
  kakao_id TEXT,
  naver_id TEXT,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deleted_accounts_email_idx ON deleted_accounts (email);
CREATE INDEX IF NOT EXISTS deleted_accounts_google_id_idx ON deleted_accounts (google_id);
CREATE INDEX IF NOT EXISTS deleted_accounts_kakao_id_idx ON deleted_accounts (kakao_id);
CREATE INDEX IF NOT EXISTS deleted_accounts_naver_id_idx ON deleted_accounts (naver_id);

-- Holds PII (emails / OAuth ids) of withdrawn users; must never be exposed via
-- the public API. Server uses a direct DB connection that bypasses RLS.
ALTER TABLE deleted_accounts ENABLE ROW LEVEL SECURITY;
