ALTER TABLE asset_upload_intents
  DROP CONSTRAINT asset_upload_intents_workspace_id_created_by_user_id_fkey;

ALTER TABLE workspace_media_assets
  DROP CONSTRAINT workspace_media_assets_workspace_id_created_by_user_id_fkey;

ALTER TABLE media_asset_placements
  DROP CONSTRAINT media_asset_placements_workspace_id_created_by_user_id_fkey,
  DROP CONSTRAINT media_asset_placements_workspace_id_owner_user_id_fkey;

ALTER TABLE media_asset_placements
  ADD CONSTRAINT media_asset_placements_workspace_id_owner_user_id_fkey
  FOREIGN KEY (workspace_id, owner_user_id)
  REFERENCES memberships(workspace_id, user_id)
  ON DELETE CASCADE;

CREATE INDEX media_asset_placements_owner_membership_idx
  ON media_asset_placements (workspace_id, owner_user_id)
  WHERE owner_user_id IS NOT NULL;

ALTER TABLE project_asset_references
  DROP CONSTRAINT project_asset_references_project_id_created_by_user_id_fkey;
