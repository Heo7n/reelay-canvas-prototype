CREATE TABLE canvas_documents (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  canvas_id text NOT NULL CHECK (btrim(canvas_id) <> ''),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, canvas_id),
  CHECK (updated_at >= created_at)
);
