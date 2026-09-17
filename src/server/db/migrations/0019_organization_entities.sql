-- Subject content has one library scope; organization placements survive creator membership changes.
ALTER TABLE workspace_entities ADD COLUMN create_space text NOT NULL DEFAULT 'personal'
  CHECK (create_space IN ('personal', 'organization'));
DO $$
DECLARE constraint_name text;
BEGIN
  SELECT conname INTO STRICT constraint_name FROM pg_constraint
  WHERE conrelid='workspace_entities'::regclass AND contype='u'
    AND pg_get_constraintdef(oid)='UNIQUE (workspace_id, created_by_user_id, create_idempotency_key)';
  EXECUTE format('ALTER TABLE workspace_entities DROP CONSTRAINT %I', constraint_name);
END $$;
ALTER TABLE workspace_entities ADD CONSTRAINT workspace_entities_scoped_create_key
  UNIQUE (workspace_id, created_by_user_id, create_space, create_idempotency_key);

ALTER TABLE entity_placements DROP CONSTRAINT entity_placements_scope_kind_check;
ALTER TABLE entity_placements ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE entity_placements ADD CONSTRAINT entity_placements_scope_kind_check
  CHECK (scope_kind IN ('personal', 'organization'));
ALTER TABLE entity_placements ADD CONSTRAINT entity_placements_scope_owner_check
  CHECK ((scope_kind='personal' AND owner_user_id IS NOT NULL) OR (scope_kind='organization' AND owner_user_id IS NULL));
ALTER TABLE entity_placements ADD CONSTRAINT entity_placements_scope_key
  UNIQUE (workspace_id, entity_id, scope_kind, scope_owner);
ALTER TABLE media_asset_placements ADD CONSTRAINT media_asset_placements_scope_key
  UNIQUE (workspace_id, asset_id, scope_kind, scope_owner);
CREATE INDEX entity_placements_organization_list_idx ON entity_placements (workspace_id, created_at DESC, entity_id)
  WHERE scope_kind='organization';

ALTER TABLE entity_library_deletions DROP CONSTRAINT entity_library_deletions_pkey;
ALTER TABLE entity_library_deletions ALTER COLUMN owner_user_id DROP NOT NULL;
ALTER TABLE entity_library_deletions ADD COLUMN scope_kind text NOT NULL DEFAULT 'personal'
  CHECK (scope_kind IN ('personal','organization'));
ALTER TABLE entity_library_deletions ADD COLUMN scope_owner text GENERATED ALWAYS AS (COALESCE(owner_user_id, '')) STORED;
ALTER TABLE entity_library_deletions ADD CONSTRAINT entity_library_deletions_scope_owner_check
  CHECK ((scope_kind='personal' AND owner_user_id IS NOT NULL) OR (scope_kind='organization' AND owner_user_id IS NULL));
ALTER TABLE entity_library_deletions ADD PRIMARY KEY (workspace_id, entity_id, scope_kind, scope_owner);
ALTER TABLE entity_library_deletions ADD UNIQUE (workspace_id, entity_id, owner_user_id);

-- A shared subject cannot hold a reference that depends on a member's private library placement.
CREATE TABLE entity_organization_media_bindings (
  workspace_id text NOT NULL,
  entity_id text NOT NULL,
  asset_id text NOT NULL,
  scope_kind text NOT NULL DEFAULT 'organization' CHECK (scope_kind='organization'),
  scope_owner text NOT NULL DEFAULT '' CHECK (scope_owner=''),
  PRIMARY KEY (workspace_id, entity_id, asset_id),
  FOREIGN KEY (workspace_id, entity_id, scope_kind, scope_owner)
    REFERENCES entity_placements(workspace_id, entity_id, scope_kind, scope_owner) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id, entity_id, asset_id)
    REFERENCES entity_media_references(workspace_id, entity_id, asset_id) ON DELETE CASCADE,
  CONSTRAINT entity_organization_media_bindings_organization_asset_fkey
    FOREIGN KEY (workspace_id, asset_id, scope_kind, scope_owner)
    REFERENCES media_asset_placements(workspace_id, asset_id, scope_kind, scope_owner)
    DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX entity_organization_media_bindings_asset_idx
  ON entity_organization_media_bindings (workspace_id, asset_id, entity_id);
ALTER TABLE entity_organization_media_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON entity_organization_media_bindings FROM PUBLIC, anon, authenticated;
