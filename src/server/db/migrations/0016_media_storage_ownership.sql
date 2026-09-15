CREATE TABLE media_storage_accounts (
  owner_kind text NOT NULL CHECK (owner_kind IN ('personal', 'organization')),
  owner_id text NOT NULL CHECK (btrim(owner_id) <> ''),
  limit_bytes bigint CHECK (limit_bytes >= 0),
  PRIMARY KEY (owner_kind, owner_id)
);

ALTER TABLE asset_upload_intents
  ADD COLUMN storage_owner_kind text,
  ADD COLUMN storage_owner_id text,
  ADD COLUMN project_id text REFERENCES projects(id) ON DELETE RESTRICT,
  ADD COLUMN reserved_byte_size bigint,
  ADD COLUMN upload_authorization_expires_at timestamptz;
ALTER TABLE workspace_media_assets
  ADD COLUMN storage_owner_kind text,
  ADD COLUMN storage_owner_id text;

-- Earlier uploads were explicitly personal. A later library placement is a
-- reference, and must not retroactively transfer the original's owner.
UPDATE asset_upload_intents SET storage_owner_kind = 'personal', storage_owner_id = created_by_user_id;
UPDATE asset_upload_intents SET reserved_byte_size = expected_byte_size;
-- Old intents did not record whether a remote grant was issued. Preserve their
-- reservations rather than guessing that a still-running external write ended.
UPDATE asset_upload_intents SET upload_authorization_expires_at = expires_at WHERE status IN ('pending', 'uploaded');
UPDATE workspace_media_assets SET storage_owner_kind = 'personal', storage_owner_id = created_by_user_id;

INSERT INTO media_storage_accounts (owner_kind, owner_id)
SELECT storage_owner_kind, storage_owner_id FROM asset_upload_intents
UNION SELECT storage_owner_kind, storage_owner_id FROM workspace_media_assets;

ALTER TABLE asset_upload_intents
  ALTER COLUMN storage_owner_kind SET NOT NULL,
  ALTER COLUMN storage_owner_id SET NOT NULL,
  ALTER COLUMN reserved_byte_size SET NOT NULL,
  ADD CONSTRAINT asset_upload_reserved_bytes_check CHECK (reserved_byte_size >= expected_byte_size),
  ADD FOREIGN KEY (storage_owner_kind, storage_owner_id) REFERENCES media_storage_accounts(owner_kind, owner_id),
  DROP CONSTRAINT asset_upload_intents_status_check;
-- The old anonymous state constraint is replaced as a unit, preserving the
-- metadata invariants while permitting cancellation before or after upload.
DO $$ DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN SELECT conname FROM pg_constraint
    WHERE conrelid = 'asset_upload_intents'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%uploaded_content_type%'
  LOOP EXECUTE format('ALTER TABLE asset_upload_intents DROP CONSTRAINT %I', constraint_name); END LOOP;
END $$;
ALTER TABLE asset_upload_intents
  ADD CONSTRAINT asset_upload_intents_status_check CHECK (status IN ('pending','uploaded','finalized','cancelling','cancelled')),
  ADD CONSTRAINT asset_upload_intents_state_check CHECK (
    (status = 'pending' AND uploaded_content_type IS NULL AND uploaded_byte_size IS NULL
      AND uploaded_checksum_sha256 IS NULL AND uploaded_etag IS NULL AND uploaded_at IS NULL
      AND asset_id IS NULL AND finalized_at IS NULL)
    OR (status = 'uploaded' AND uploaded_content_type IS NOT NULL AND uploaded_byte_size IS NOT NULL
      AND uploaded_checksum_sha256 IS NOT NULL AND uploaded_at IS NOT NULL AND asset_id IS NULL AND finalized_at IS NULL)
    OR (status = 'finalized' AND uploaded_content_type IS NOT NULL AND uploaded_byte_size IS NOT NULL
      AND uploaded_checksum_sha256 IS NOT NULL AND uploaded_at IS NOT NULL AND asset_id IS NOT NULL AND finalized_at IS NOT NULL)
    OR (status IN ('cancelling','cancelled') AND asset_id IS NULL AND finalized_at IS NULL)
  );
ALTER TABLE workspace_media_assets
  ALTER COLUMN storage_owner_kind SET NOT NULL,
  ALTER COLUMN storage_owner_id SET NOT NULL,
  ADD FOREIGN KEY (storage_owner_kind, storage_owner_id) REFERENCES media_storage_accounts(owner_kind, owner_id);

-- Seed/import paths also assign ownership at insertion, without depending on
-- a placement being created before the source object.
CREATE FUNCTION assign_media_storage_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.storage_owner_kind IS NULL AND NEW.storage_owner_id IS NULL THEN
    NEW.storage_owner_kind := 'personal'; NEW.storage_owner_id := NEW.created_by_user_id;
  END IF;
  IF TG_TABLE_NAME = 'asset_upload_intents' THEN
    NEW.reserved_byte_size := COALESCE(NEW.reserved_byte_size, NEW.expected_byte_size);
  END IF;
  INSERT INTO media_storage_accounts(owner_kind, owner_id) VALUES (NEW.storage_owner_kind, NEW.storage_owner_id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER asset_upload_storage_owner BEFORE INSERT ON asset_upload_intents FOR EACH ROW EXECUTE FUNCTION assign_media_storage_owner();
CREATE TRIGGER media_asset_storage_owner BEFORE INSERT ON workspace_media_assets FOR EACH ROW EXECUTE FUNCTION assign_media_storage_owner();

CREATE INDEX media_asset_storage_owner_idx ON workspace_media_assets(storage_owner_kind, storage_owner_id);
CREATE INDEX media_upload_storage_reserved_idx ON asset_upload_intents(storage_owner_kind, storage_owner_id, expires_at)
  WHERE status IN ('pending','uploaded','cancelling');
ALTER TABLE media_storage_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON media_storage_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION assign_media_storage_owner() FROM PUBLIC, anon, authenticated;
