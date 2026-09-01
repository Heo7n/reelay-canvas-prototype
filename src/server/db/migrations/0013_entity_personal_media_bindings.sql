ALTER TABLE media_asset_placements
  ADD CONSTRAINT media_asset_placements_workspace_asset_owner_key
  UNIQUE (workspace_id, asset_id, owner_user_id);

CREATE TABLE entity_personal_media_bindings (
  workspace_id text NOT NULL,
  entity_id text NOT NULL,
  owner_user_id text NOT NULL,
  asset_id text NOT NULL,
  PRIMARY KEY (workspace_id, entity_id, owner_user_id, asset_id),
  FOREIGN KEY (workspace_id, entity_id, owner_user_id)
    REFERENCES entity_placements(workspace_id, entity_id, owner_user_id)
    ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, entity_id, asset_id)
    REFERENCES entity_media_references(workspace_id, entity_id, asset_id)
    ON DELETE CASCADE,
  CONSTRAINT entity_personal_media_bindings_personal_asset_fkey
    FOREIGN KEY (workspace_id, asset_id, owner_user_id)
    REFERENCES media_asset_placements(workspace_id, asset_id, owner_user_id)
    DEFERRABLE INITIALLY DEFERRED
);

INSERT INTO entity_personal_media_bindings (
  workspace_id,
  entity_id,
  owner_user_id,
  asset_id
)
SELECT
  placement.workspace_id,
  placement.entity_id,
  placement.owner_user_id,
  reference.asset_id
FROM entity_placements AS placement
JOIN entity_media_references AS reference
  ON reference.workspace_id = placement.workspace_id
 AND reference.entity_id = placement.entity_id
WHERE placement.scope_kind = 'personal';

CREATE INDEX entity_personal_media_bindings_asset_owner_idx
  ON entity_personal_media_bindings (workspace_id, asset_id, owner_user_id, entity_id);

ALTER TABLE entity_personal_media_bindings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON entity_personal_media_bindings FROM PUBLIC, anon, authenticated;
