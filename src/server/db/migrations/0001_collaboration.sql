CREATE TABLE users (
  id text PRIMARY KEY,
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE login_identities (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (btrim(kind) <> ''),
  identifier text NOT NULL CHECK (btrim(identifier) <> ''),
  normalized_identifier text NOT NULL CHECK (btrim(normalized_identifier) <> ''),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, normalized_identifier)
);

CREATE INDEX login_identities_user_id_idx ON login_identities (user_id);

CREATE TABLE workspaces (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('personal', 'organization')),
  name text NOT NULL CHECK (btrim(name) <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (btrim(role) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX memberships_user_id_idx ON memberships (user_id);

CREATE TABLE projects (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  updated_at timestamptz NOT NULL,
  cover_asset_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

CREATE INDEX projects_workspace_updated_at_idx
  ON projects (workspace_id, updated_at DESC, id);

CREATE TABLE sessions (
  token_hash bytea PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);
CREATE INDEX sessions_active_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;
