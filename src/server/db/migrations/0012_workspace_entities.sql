CREATE TABLE workspace_entities (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  description text NOT NULL DEFAULT '',
  cover_asset_id text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  create_idempotency_key text NOT NULL CHECK (btrim(create_idempotency_key) <> ''),
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, created_by_user_id, create_idempotency_key),
  CHECK (updated_at >= created_at)
);

CREATE TABLE entity_media_references (
  workspace_id text NOT NULL,
  entity_id text NOT NULL,
  asset_id text NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  PRIMARY KEY (workspace_id, entity_id, asset_id),
  UNIQUE (workspace_id, entity_id, position),
  FOREIGN KEY (workspace_id, entity_id)
    REFERENCES workspace_entities(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, asset_id)
    REFERENCES workspace_media_assets(workspace_id, id)
    ON DELETE RESTRICT
);

ALTER TABLE workspace_entities
  ADD CONSTRAINT workspace_entities_cover_reference_fkey
  FOREIGN KEY (workspace_id, id, cover_asset_id)
  REFERENCES entity_media_references(workspace_id, entity_id, asset_id)
  ON DELETE RESTRICT;

CREATE TABLE entity_placements (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  entity_id text NOT NULL,
  scope_kind text NOT NULL CHECK (scope_kind = 'personal'),
  owner_user_id text NOT NULL,
  created_by_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, entity_id)
    REFERENCES workspace_entities(workspace_id, id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, owner_user_id)
    REFERENCES memberships(workspace_id, user_id)
    ON DELETE CASCADE,
  UNIQUE (workspace_id, entity_id, owner_user_id)
);

CREATE INDEX workspace_entities_workspace_updated_idx
  ON workspace_entities (workspace_id, updated_at DESC, id);

CREATE INDEX workspace_entities_creator_idx
  ON workspace_entities (created_by_user_id, created_at DESC, id);

CREATE INDEX entity_media_references_asset_idx
  ON entity_media_references (workspace_id, asset_id, entity_id);

CREATE INDEX entity_placements_personal_list_idx
  ON entity_placements (workspace_id, owner_user_id, created_at DESC, entity_id)
  WHERE scope_kind = 'personal';

ALTER TABLE workspace_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_media_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_placements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON workspace_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON entity_media_references FROM PUBLIC, anon, authenticated;
REVOKE ALL ON entity_placements FROM PUBLIC, anon, authenticated;
