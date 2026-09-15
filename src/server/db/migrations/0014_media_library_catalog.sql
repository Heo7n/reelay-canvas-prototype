CREATE TABLE media_library_folders (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('personal', 'organization')),
  owner_user_id text,
  scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id, '')) STORED,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  name_key text NOT NULL,
  parent_id text,
  depth integer NOT NULL CHECK (depth BETWEEN 1 AND 4),
  CHECK ((scope_kind = 'personal' AND owner_user_id IS NOT NULL) OR (scope_kind = 'organization' AND owner_user_id IS NULL)),
  CHECK ((parent_id IS NULL AND depth = 1) OR (parent_id IS NOT NULL AND depth > 1)),
  UNIQUE (workspace_id, scope_kind, scope_owner, id),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES memberships(workspace_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, scope_kind, scope_owner, parent_id) REFERENCES media_library_folders(workspace_id, scope_kind, scope_owner, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX media_library_folders_sibling_key ON media_library_folders (workspace_id, scope_kind, scope_owner, COALESCE(parent_id, ''), name_key);

CREATE TABLE media_library_tags (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('personal', 'organization')),
  owner_user_id text,
  scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id, '')) STORED,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
  name_key text NOT NULL,
  CHECK ((scope_kind = 'personal' AND owner_user_id IS NOT NULL) OR (scope_kind = 'organization' AND owner_user_id IS NULL)),
  FOREIGN KEY (workspace_id, owner_user_id) REFERENCES memberships(workspace_id, user_id) ON DELETE CASCADE,
  UNIQUE (workspace_id, scope_kind, scope_owner, name_key)
);

ALTER TABLE media_asset_placements
  ADD COLUMN display_name text CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 1 AND 300),
  ADD COLUMN folder_id text,
  ADD COLUMN tag_ids text[] NOT NULL DEFAULT '{}',
  ADD COLUMN updated_at timestamptz,
  ADD COLUMN scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id, '')) STORED,
  ADD CONSTRAINT media_asset_placements_folder_fkey FOREIGN KEY (workspace_id, scope_kind, scope_owner, folder_id)
    REFERENCES media_library_folders(workspace_id, scope_kind, scope_owner, id) ON DELETE RESTRICT;

UPDATE media_asset_placements AS placement SET display_name = asset.display_name, updated_at = placement.created_at
FROM workspace_media_assets AS asset WHERE asset.workspace_id = placement.workspace_id AND asset.id = placement.asset_id;

ALTER TABLE media_library_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON media_library_folders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON media_library_tags FROM PUBLIC, anon, authenticated;
