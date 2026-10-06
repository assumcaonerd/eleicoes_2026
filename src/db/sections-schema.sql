CREATE TABLE IF NOT EXISTS places (
  id BIGSERIAL PRIMARY KEY,
  uf CHAR(2) NOT NULL,
  municipality_code TEXT NOT NULL,
  municipality_name TEXT NOT NULL,
  zone INTEGER NOT NULL,
  section INTEGER NOT NULL,
  polling_place_code TEXT NOT NULL DEFAULT '',
  polling_place_name TEXT,
  address TEXT,
  neighborhood TEXT NOT NULL DEFAULT '',
  cep TEXT,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  UNIQUE (uf, municipality_code, zone, section, polling_place_code)
);
CREATE INDEX IF NOT EXISTS places_scope_idx ON places(uf, municipality_code, zone, section);
CREATE INDEX IF NOT EXISTS places_neighborhood_idx ON places(uf, municipality_code, neighborhood);
CREATE INDEX IF NOT EXISTS places_location_idx ON places(uf, municipality_code, polling_place_code);

CREATE TABLE IF NOT EXISTS section_votes (
  id BIGSERIAL PRIMARY KEY,
  election_id INTEGER NOT NULL,
  round INTEGER NOT NULL DEFAULT 1,
  office_code INTEGER NOT NULL,
  uf CHAR(2) NOT NULL,
  municipality_code TEXT NOT NULL,
  municipality_name TEXT,
  zone INTEGER NOT NULL,
  section INTEGER NOT NULL,
  polling_place_code TEXT NOT NULL DEFAULT '',
  candidate_number TEXT NOT NULL,
  party_number TEXT,
  votes INTEGER NOT NULL CHECK(votes>=0),
  source_file TEXT,
  source_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(election_id,round,office_code,uf,municipality_code,zone,section,polling_place_code,candidate_number)
);
CREATE INDEX IF NOT EXISTS sv_candidate_idx ON section_votes(uf, office_code, candidate_number);
CREATE INDEX IF NOT EXISTS sv_municipality_idx ON section_votes(uf, office_code, candidate_number, municipality_code);
CREATE INDEX IF NOT EXISTS sv_section_idx ON section_votes(uf, municipality_code, zone, section);
