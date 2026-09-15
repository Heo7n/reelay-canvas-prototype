-- Keep deleted personal group placements from being resurrected by an old create request.
CREATE TABLE entity_library_deletions (
  workspace_id text NOT NULL,
  entity_id text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, entity_id, owner_user_id),
  FOREIGN KEY (workspace_id, entity_id) REFERENCES workspace_entities(workspace_id, id) ON DELETE CASCADE
);
ALTER TABLE entity_library_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON entity_library_deletions FROM PUBLIC, anon, authenticated;
