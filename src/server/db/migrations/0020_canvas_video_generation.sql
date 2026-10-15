-- Credentials remain process-private. Only immutable connection identities,
-- project bindings, task intent and attempt/result evidence are persisted.
CREATE TABLE canvas_video_project_bindings (
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  platform_user_id text NOT NULL,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id uuid NOT NULL,
  binding jsonb NOT NULL,
  PRIMARY KEY (actor_id, platform_user_id, project_id)
);
CREATE TABLE canvas_video_tasks (
  id uuid PRIMARY KEY,
  actor_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  platform_user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('prepared','submitting','waiting','saving','succeeded','failed','unconfirmed','save_failed')),
  record jsonb NOT NULL,
  UNIQUE (actor_id, request_key)
);
CREATE INDEX canvas_video_tasks_actor_project ON canvas_video_tasks(actor_id, project_id);
CREATE TABLE real_generation_account_locks (
  platform_user_id text PRIMARY KEY,
  operation_id uuid NOT NULL,
  heartbeat_at timestamptz NOT NULL DEFAULT now()
);
-- Expiry detects interrupted execution but never releases an unknown paid
-- attempt. Probe and canvas tasks share this one account fence.
ALTER TABLE canvas_video_project_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_video_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE real_generation_account_locks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON canvas_video_project_bindings, canvas_video_tasks, real_generation_account_locks FROM PUBLIC, anon, authenticated;
