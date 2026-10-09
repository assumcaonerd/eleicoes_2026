import os
import psycopg

SOURCE=os.environ["SOURCE_DATABASE_URL"]
TARGET=os.environ["TARGET_DATABASE_URL"]

DDL="""
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
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  UNIQUE (uf, municipality_code, zone, section, polling_place_code)
);
CREATE INDEX IF NOT EXISTS places_municipality_idx ON places(uf, municipality_code);
CREATE INDEX IF NOT EXISTS places_neighborhood_idx ON places(uf, municipality_name, neighborhood);
CREATE INDEX IF NOT EXISTS places_section_idx ON places(uf, municipality_code, zone, section);

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
CREATE INDEX IF NOT EXISTS sv_candidate_idx ON section_votes(uf,office_code,candidate_number);
CREATE INDEX IF NOT EXISTS sv_municipality_idx ON section_votes(uf,office_code,candidate_number,municipality_code);
CREATE INDEX IF NOT EXISTS sv_section_idx ON section_votes(uf,municipality_code,zone,section);
"""

def pipe_copy(src, dst, select_sql, copy_sql, label):
    print(f"{label}_START", flush=True)
    with src.cursor().copy(select_sql) as out_copy:
        with dst.cursor().copy(copy_sql) as in_copy:
            while True:
                data=out_copy.read()
                if not data:
                    break
                in_copy.write(data)
    dst.commit()
    print(f"{label}_DONE", flush=True)

with psycopg.connect(SOURCE) as src, psycopg.connect(TARGET) as dst:
    with dst.cursor() as cur:
        cur.execute(DDL)
    dst.commit()

    with src.cursor() as cur:
        cur.execute("SELECT count(*) FROM places WHERE uf='SP'")
        places_count=cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM section_votes WHERE uf='SP'")
        votes_count=cur.fetchone()[0]
    print(f"SOURCE_SP_COUNTS places={places_count} votes={votes_count}", flush=True)

    pipe_copy(
        src,dst,
        """COPY (
          SELECT uf,municipality_code,municipality_name,zone,section,polling_place_code,
                 polling_place_name,address,neighborhood,cep,latitude,longitude
          FROM places WHERE uf='SP'
        ) TO STDOUT""",
        """COPY places
          (uf,municipality_code,municipality_name,zone,section,polling_place_code,
           polling_place_name,address,neighborhood,cep,latitude,longitude)
          FROM STDIN""",
        "COPY_PLACES"
    )

    pipe_copy(
        src,dst,
        """COPY (
          SELECT election_id,round,office_code,uf,municipality_code,municipality_name,
                 zone,section,polling_place_code,candidate_number,party_number,votes,
                 source_file,source_updated_at
          FROM section_votes WHERE uf='SP'
        ) TO STDOUT""",
        """COPY section_votes
          (election_id,round,office_code,uf,municipality_code,municipality_name,
           zone,section,polling_place_code,candidate_number,party_number,votes,
           source_file,source_updated_at)
          FROM STDIN""",
        "COPY_VOTES"
    )

    with dst.cursor() as cur:
        cur.execute("SELECT count(*) FROM places WHERE uf='SP'")
        p=cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM section_votes WHERE uf='SP'")
        v=cur.fetchone()[0]
    print(f"TARGET_SP_COUNTS places={p} votes={v}", flush=True)
    if p!=places_count or v!=votes_count:
        raise RuntimeError(f"Contagens divergentes origem/destino: places {places_count}/{p}, votes {votes_count}/{v}")
    print("SP_MIGRATION_DONE", flush=True)
