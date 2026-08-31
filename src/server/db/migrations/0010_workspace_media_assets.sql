ALTER TABLE projects
  ADD CONSTRAINT projects_workspace_id_id_key UNIQUE (workspace_id, id);

CREATE TABLE asset_upload_intents (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'audio')),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  object_key text NOT NULL UNIQUE CHECK (btrim(object_key) <> ''),
  expected_content_type text NOT NULL CHECK (btrim(expected_content_type) <> ''),
  expected_byte_size bigint NOT NULL CHECK (expected_byte_size > 0),
  expected_checksum_sha256 text NOT NULL CHECK (
    expected_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'finalized')),
  uploaded_content_type text,
  uploaded_byte_size bigint CHECK (uploaded_byte_size IS NULL OR uploaded_byte_size > 0),
  uploaded_checksum_sha256 text CHECK (
    uploaded_checksum_sha256 IS NULL
    OR uploaded_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  uploaded_etag text,
  asset_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  uploaded_at timestamptz,
  finalized_at timestamptz,
  UNIQUE (workspace_id, created_by_user_id, idempotency_key),
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (expires_at > created_at),
  CHECK (
    (status = 'pending'
      AND uploaded_content_type IS NULL
      AND uploaded_byte_size IS NULL
      AND uploaded_checksum_sha256 IS NULL
      AND uploaded_etag IS NULL
      AND uploaded_at IS NULL
      AND asset_id IS NULL
      AND finalized_at IS NULL)
    OR
    (status = 'uploaded'
      AND uploaded_content_type IS NOT NULL
      AND uploaded_byte_size IS NOT NULL
      AND uploaded_checksum_sha256 IS NOT NULL
      AND uploaded_at IS NOT NULL
      AND asset_id IS NULL
      AND finalized_at IS NULL)
    OR
    (status = 'finalized'
      AND uploaded_content_type IS NOT NULL
      AND uploaded_byte_size IS NOT NULL
      AND uploaded_checksum_sha256 IS NOT NULL
      AND uploaded_at IS NOT NULL
      AND asset_id IS NOT NULL
      AND finalized_at IS NOT NULL)
  )
);

CREATE TABLE workspace_media_assets (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  media_kind text NOT NULL CHECK (media_kind IN ('image', 'video', 'audio')),
  display_name text NOT NULL CHECK (btrim(display_name) <> ''),
  object_key text NOT NULL UNIQUE CHECK (btrim(object_key) <> ''),
  object_version integer NOT NULL DEFAULT 1 CHECK (object_version > 0),
  content_type text NOT NULL CHECK (btrim(content_type) <> ''),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  checksum_sha256 text NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, id, object_version),
  UNIQUE (workspace_id, object_key, object_version),
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (updated_at >= created_at)
);

ALTER TABLE asset_upload_intents
  ADD CONSTRAINT asset_upload_intents_workspace_asset_fkey
  FOREIGN KEY (workspace_id, asset_id)
  REFERENCES workspace_media_assets(workspace_id, id)
  ON DELETE RESTRICT;

CREATE TABLE media_asset_placements (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  asset_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind IN ('personal', 'organization')),
  owner_user_id text,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, asset_id)
    REFERENCES workspace_media_assets(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, owner_user_id)
    REFERENCES memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES memberships(workspace_id, user_id)
    ON DELETE RESTRICT,
  CHECK (
    (scope_kind = 'personal' AND owner_user_id IS NOT NULL)
    OR (scope_kind = 'organization' AND owner_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX media_asset_placements_personal_key
  ON media_asset_placements (workspace_id, asset_id, owner_user_id)
  WHERE scope_kind = 'personal';

CREATE UNIQUE INDEX media_asset_placements_organization_key
  ON media_asset_placements (workspace_id, asset_id)
  WHERE scope_kind = 'organization';

CREATE TABLE project_asset_references (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  asset_id text NOT NULL,
  asset_version integer NOT NULL CHECK (asset_version > 0),
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, project_id)
    REFERENCES projects(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, asset_id, asset_version)
    REFERENCES workspace_media_assets(workspace_id, id, object_version)
    ON DELETE RESTRICT,
  FOREIGN KEY (project_id, created_by_user_id)
    REFERENCES project_memberships(project_id, user_id)
    ON DELETE RESTRICT,
  UNIQUE (project_id, asset_id, asset_version)
);

CREATE INDEX asset_upload_intents_pending_expiry_idx
  ON asset_upload_intents (expires_at, id)
  WHERE status = 'pending';

CREATE INDEX asset_upload_intents_creator_idx
  ON asset_upload_intents (created_by_user_id, created_at DESC, id);

CREATE INDEX asset_upload_intents_asset_idx
  ON asset_upload_intents (workspace_id, asset_id)
  WHERE asset_id IS NOT NULL;

CREATE INDEX workspace_media_assets_workspace_created_idx
  ON workspace_media_assets (workspace_id, created_at DESC, id);

CREATE INDEX workspace_media_assets_creator_idx
  ON workspace_media_assets (created_by_user_id, created_at DESC, id);

CREATE INDEX media_asset_placements_personal_list_idx
  ON media_asset_placements (workspace_id, owner_user_id, created_at DESC, asset_id)
  WHERE scope_kind = 'personal';

CREATE INDEX media_asset_placements_creator_idx
  ON media_asset_placements (created_by_user_id, created_at DESC, id);

CREATE INDEX media_asset_placements_asset_idx
  ON media_asset_placements (workspace_id, asset_id);

CREATE INDEX project_asset_references_project_created_idx
  ON project_asset_references (project_id, created_at DESC, id);

CREATE INDEX project_asset_references_asset_idx
  ON project_asset_references (workspace_id, asset_id, asset_version);

CREATE INDEX project_asset_references_creator_idx
  ON project_asset_references (created_by_user_id, created_at DESC, id);

ALTER TABLE asset_upload_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_asset_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_asset_references ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON asset_upload_intents FROM PUBLIC, anon, authenticated;
REVOKE ALL ON workspace_media_assets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON media_asset_placements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON project_asset_references FROM PUBLIC, anon, authenticated;
