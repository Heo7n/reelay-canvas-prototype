ALTER TABLE login_identities RENAME TO password_identities;

ALTER INDEX login_identities_user_id_idx RENAME TO password_identities_user_id_idx;

ALTER TABLE password_identities
  DROP CONSTRAINT login_identities_kind_normalized_identifier_key,
  DROP COLUMN kind,
  ADD CONSTRAINT password_identities_normalized_identifier_uq UNIQUE (normalized_identifier);
