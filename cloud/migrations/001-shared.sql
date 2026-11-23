CREATE TABLE IF NOT EXISTS pettinee_migrations(version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pettinee_workers(
 id text PRIMARY KEY, label text NOT NULL, expected_account text NOT NULL,
 token_hash text NOT NULL UNIQUE, enabled boolean NOT NULL DEFAULT true,
 last_seen timestamptz, capabilities jsonb NOT NULL DEFAULT '{}', state jsonb NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS pettinee_posts(
 id uuid PRIMARY KEY, source_type text NOT NULL, source_key text NOT NULL,
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), status text NOT NULL,
 doc jsonb NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_type,source_key));
CREATE INDEX IF NOT EXISTS pettinee_posts_status ON pettinee_posts(status,received_at DESC);
CREATE TABLE IF NOT EXISTS pettinee_jobs(
 id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('analyse','collect','publish','rewrite')),
 post_id uuid REFERENCES pettinee_posts(id), worker_id text REFERENCES pettinee_workers(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','complete','sent','failed','needs_verification')),
 snapshot jsonb NOT NULL, result jsonb, lease_token text, lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS pettinee_one_publish ON pettinee_jobs(post_id) WHERE kind='publish';
CREATE UNIQUE INDEX IF NOT EXISTS pettinee_one_analysis ON pettinee_jobs(post_id) WHERE kind='analyse' AND state IN ('queued','processing');
CREATE UNIQUE INDEX IF NOT EXISTS pettinee_one_collection ON pettinee_jobs(worker_id) WHERE kind='collect' AND state IN ('queued','processing');
CREATE INDEX IF NOT EXISTS pettinee_jobs_claim ON pettinee_jobs(worker_id,state,created_at);
CREATE TABLE IF NOT EXISTS pettinee_audit(id bigserial PRIMARY KEY, post_id uuid REFERENCES pettinee_posts(id), kind text NOT NULL, actor text NOT NULL, data jsonb NOT NULL DEFAULT '{}', at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pettinee_links(token text PRIMARY KEY, post_id uuid NOT NULL REFERENCES pettinee_posts(id), guide_id text NOT NULL,title text NOT NULL,destination text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS pettinee_clicks(token text NOT NULL REFERENCES pettinee_links(token), day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date, kind text NOT NULL CHECK(kind IN ('page','guide','preview')), count integer NOT NULL DEFAULT 1, PRIMARY KEY(token,day,kind));
CREATE TABLE IF NOT EXISTS pettinee_login_limits(key text PRIMARY KEY, expires_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS pettinee_legacy_rows(table_name text NOT NULL,row_key text NOT NULL,data jsonb NOT NULL,PRIMARY KEY(table_name,row_key));
INSERT INTO pettinee_migrations(version) VALUES('001-shared') ON CONFLICT DO NOTHING;
