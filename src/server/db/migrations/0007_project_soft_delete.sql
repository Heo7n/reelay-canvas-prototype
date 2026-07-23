ALTER TABLE projects
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by_user_id text REFERENCES users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_deleted_audit_check CHECK (
    (deleted_at IS NULL AND deleted_by_user_id IS NULL)
    OR (deleted_at IS NOT NULL AND deleted_by_user_id IS NOT NULL)
  );

CREATE INDEX projects_active_workspace_updated_idx
  ON projects (workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX projects_deleted_membership_idx
  ON projects (deleted_at DESC, id)
  WHERE deleted_at IS NOT NULL;
