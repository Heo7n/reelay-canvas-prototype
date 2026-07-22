DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM workspaces WHERE kind = 'personal')
     AND (SELECT count(*) FROM workspaces WHERE kind = 'organization') <> 1 THEN
    RAISE EXCEPTION 'Project access migration requires exactly one organization workspace when personal workspaces exist';
  END IF;
END $$;

ALTER TABLE projects ADD COLUMN access_kind text;

UPDATE projects AS project
SET access_kind = CASE workspace.kind
  WHEN 'personal' THEN 'private'
  ELSE 'collaborative'
END
FROM workspaces AS workspace
WHERE workspace.id = project.workspace_id;

CREATE TABLE project_memberships (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('admin', 'edit', 'view')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX project_memberships_user_project_idx
  ON project_memberships (user_id, project_id);

INSERT INTO project_memberships (project_id, user_id, role)
SELECT project.id, project.created_by_user_id, 'admin'
FROM projects AS project
ON CONFLICT (project_id, user_id) DO NOTHING;

INSERT INTO project_memberships (project_id, user_id, role)
SELECT
  project.id,
  membership.user_id,
  CASE
    WHEN membership.user_id = project.created_by_user_id OR membership.role = 'owner' THEN 'admin'
    ELSE 'edit'
  END
FROM projects AS project
JOIN workspaces AS workspace ON workspace.id = project.workspace_id
JOIN memberships AS membership ON membership.workspace_id = workspace.id
WHERE project.access_kind = 'collaborative'
ON CONFLICT (project_id, user_id) DO UPDATE
SET role = CASE
  WHEN project_memberships.role = 'admin' OR EXCLUDED.role = 'admin' THEN 'admin'
  ELSE EXCLUDED.role
END;

INSERT INTO memberships (workspace_id, user_id, role)
SELECT organization.id, personal_membership.user_id, 'member'
FROM memberships AS personal_membership
JOIN workspaces AS personal ON personal.id = personal_membership.workspace_id AND personal.kind = 'personal'
CROSS JOIN LATERAL (
  SELECT id
  FROM workspaces
  WHERE kind = 'organization'
  LIMIT 1
) AS organization
ON CONFLICT (workspace_id, user_id) DO NOTHING;

UPDATE projects AS project
SET workspace_id = organization.id
FROM workspaces AS personal
CROSS JOIN LATERAL (
  SELECT id
  FROM workspaces
  WHERE kind = 'organization'
  LIMIT 1
) AS organization
WHERE project.workspace_id = personal.id
  AND personal.kind = 'personal';

DELETE FROM memberships
WHERE workspace_id IN (SELECT id FROM workspaces WHERE kind = 'personal');

DELETE FROM workspaces WHERE kind = 'personal';

UPDATE memberships SET role = 'member' WHERE role <> 'owner';

ALTER TABLE memberships
  DROP CONSTRAINT memberships_role_check,
  ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'member'));

ALTER TABLE workspaces
  DROP CONSTRAINT workspaces_kind_check,
  ADD CONSTRAINT workspaces_kind_check CHECK (kind = 'organization');

ALTER TABLE projects
  ALTER COLUMN access_kind SET NOT NULL,
  ADD CONSTRAINT projects_access_kind_check CHECK (access_kind IN ('private', 'collaborative'));
