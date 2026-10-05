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
