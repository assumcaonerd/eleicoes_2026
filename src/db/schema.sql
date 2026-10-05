CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS candidates (
  id BIGSERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  office_code INTEGER NOT NULL,
  office_name TEXT NOT NULL,
  uf CHAR(2) NOT NULL,
  tse_candidate_id TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL,
  ballot_name TEXT NOT NULL,
  full_name TEXT,
  party_number TEXT,
  party_abbr TEXT,
  status TEXT,
  source_updated_at TIMESTAMPTZ,
  UNIQUE (election_id, office_code, uf, number, tse_candidate_id)
);

CREATE INDEX IF NOT EXISTS candidates_name_trgm_idx ON candidates USING gin (ballot_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS candidates_number_idx ON candidates(number);
CREATE INDEX IF NOT EXISTS candidates_scope_idx ON candidates(election_id, office_code, uf);

CREATE TABLE IF NOT EXISTS places (
  id BIGSERIAL PRIMARY KEY,
  uf CHAR(2) NOT NULL,
  municipality_code TEXT NOT NULL,
  municipality_name TEXT NOT NULL,
  zone INTEGER NOT NULL DEFAULT -1,
  section INTEGER NOT NULL DEFAULT -1,
  polling_place_code TEXT NOT NULL DEFAULT '',
  polling_place_name TEXT,
  address TEXT,
  neighborhood TEXT NOT NULL DEFAULT '',
  cep TEXT,
  UNIQUE (uf, municipality_code, zone, section, polling_place_code)
);

CREATE INDEX IF NOT EXISTS places_municipality_idx ON places(uf, municipality_code);
CREATE INDEX IF NOT EXISTS places_neighborhood_idx ON places(uf, municipality_name, neighborhood);
CREATE INDEX IF NOT EXISTS places_section_idx ON places(uf, municipality_code, zone, section);

CREATE TABLE IF NOT EXISTS vote_facts (
  id BIGSERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  office_code INTEGER NOT NULL,
  candidate_id BIGINT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  uf CHAR(2) NOT NULL,
  municipality_code TEXT NOT NULL DEFAULT '',
  municipality_name TEXT,
  neighborhood TEXT NOT NULL DEFAULT '',
  zone INTEGER NOT NULL DEFAULT -1,
  section INTEGER NOT NULL DEFAULT -1,
  polling_place_code TEXT NOT NULL DEFAULT '',
  votes INTEGER NOT NULL CHECK (votes >= 0),
  source_kind TEXT NOT NULL,
  source_file TEXT,
  source_updated_at TIMESTAMPTZ,
  UNIQUE (
    election_id, round, office_code, candidate_id, uf,
    municipality_code, neighborhood, zone, section, polling_place_code, source_kind
  )
);

CREATE INDEX IF NOT EXISTS vote_candidate_idx ON vote_facts(candidate_id);
CREATE INDEX IF NOT EXISTS vote_municipality_idx ON vote_facts(candidate_id, municipality_code);
CREATE INDEX IF NOT EXISTS vote_neighborhood_idx ON vote_facts(candidate_id, municipality_code, neighborhood);
CREATE INDEX IF NOT EXISTS vote_zone_idx ON vote_facts(candidate_id, municipality_code, zone);
CREATE INDEX IF NOT EXISTS vote_section_idx ON vote_facts(candidate_id, municipality_code, zone, section);

CREATE TABLE IF NOT EXISTS import_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  files_downloaded INTEGER NOT NULL DEFAULT 0,
  rows_imported BIGINT NOT NULL DEFAULT 0,
  notes TEXT
);


CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','superadmin')),
  email_verified_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_exp_idx ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  provider_checkout_id TEXT,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly','lifetime')),
  status TEXT NOT NULL DEFAULT 'pending',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_user_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_provider_idx ON subscriptions(provider_subscription_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email TEXT,
  ip_hash TEXT,
  success BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_recent_idx ON login_attempts(created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs(user_id, created_at DESC);
