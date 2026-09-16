-- Placement belongs to the library; moving a group never changes its media references.
ALTER TABLE entity_placements
  ADD COLUMN folder_id text,
  ADD COLUMN added_at timestamptz,
  ADD COLUMN scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id, '')) STORED,
  ADD CONSTRAINT entity_placements_folder_fkey FOREIGN KEY (workspace_id, scope_kind, scope_owner, folder_id)
    REFERENCES media_library_folders(workspace_id, scope_kind, scope_owner, id) ON DELETE RESTRICT;
ALTER TABLE media_asset_placements ADD COLUMN added_at timestamptz;
-- Preserve the creation command's original destination independently of later moves.
ALTER TABLE workspace_entities ADD COLUMN create_folder_id text;
