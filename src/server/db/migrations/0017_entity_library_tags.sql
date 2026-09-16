-- Group organization belongs to its library placement, independent of Entity content and members.
ALTER TABLE entity_placements ADD COLUMN tag_ids text[] NOT NULL DEFAULT '{}';

-- Retire the sound preset without discarding labels users already applied. Each used scope
-- receives an ordinary dictionary tag, reusing its existing same-name tag when present.
INSERT INTO media_library_tags (id, workspace_id, scope_kind, owner_user_id, name, name_key)
SELECT 'tag-retired-sound-' || md5(json_build_array(workspace_id, scope_kind, scope_owner)::text),
       workspace_id, scope_kind, owner_user_id, '音效', '音效'
FROM media_asset_placements
WHERE 'builtin:sound' = ANY(tag_ids)
GROUP BY workspace_id, scope_kind, scope_owner, owner_user_id
ON CONFLICT (workspace_id, scope_kind, scope_owner, name_key) DO NOTHING;

UPDATE media_asset_placements AS placement
SET tag_ids = ARRAY(
  SELECT DISTINCT CASE WHEN old_id = 'builtin:sound' THEN tag.id ELSE old_id END AS replacement_id
  FROM unnest(placement.tag_ids) AS old_id
  ORDER BY replacement_id
)
FROM media_library_tags AS tag
WHERE placement.workspace_id = tag.workspace_id AND placement.scope_kind = tag.scope_kind
  AND placement.scope_owner = tag.scope_owner AND tag.name_key = '音效'
  AND 'builtin:sound' = ANY(placement.tag_ids);
