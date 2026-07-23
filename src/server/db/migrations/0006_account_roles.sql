ALTER TABLE memberships
  DROP CONSTRAINT memberships_role_check,
  ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'admin', 'member'));

UPDATE users
SET display_name = 'Hoo'
WHERE id = 'actor-tianmaochao';

UPDATE password_identities
SET identifier = 'creator@reelay.test',
    normalized_identifier = 'creator@reelay.test'
WHERE user_id = 'actor-tianmaochao';

UPDATE memberships
SET role = CASE user_id
  WHEN 'actor-tianmaochao' THEN 'owner'
  WHEN 'actor-linjing' THEN 'admin'
  ELSE 'member'
END
WHERE workspace_id = 'workspace-organization-reelay';
