import type { Pool, PoolClient, QueryResultRow } from "pg";

import type { WorkspaceMediaAsset } from "../../domain/asset/workspace-media-asset";
import {
  DEMO_ACTOR_ID,
  DEMO_ENTITY_FIXTURES,
  DEMO_PROJECT_ID,
  DEMO_WORKSPACE_ID,
  LEGACY_DEMO_ENTITY_FIXTURES,
  type DemoAssetFixture,
  type DemoEntityFixture,
} from "./demo-asset-fixtures";

const DEMO_FIXTURE_LOCK_KEY = "reelay-demo-entity-library-v2";

export interface ResolvedDemoAssetFixture extends DemoAssetFixture {
  idempotencyKey: string;
  byteSize: number;
  checksumSha256: string;
}

interface EntityRow extends QueryResultRow {
  id: string;
  name: string;
  description: string;
  cover_asset_id: string | null;
  version: number;
  create_idempotency_key: string;
  created_by_user_id: string;
}

interface EntityPlacementRow extends QueryResultRow {
  scope_kind: "personal" | "organization";
  owner_user_id: string | null;
  created_by_user_id: string;
}

interface EntityReferenceRow extends QueryResultRow {
  asset_id: string;
  position: number;
  asset_media_kind: "image" | "video" | "audio";
  asset_display_name: string;
  asset_object_key: string;
  asset_object_version: number;
  asset_content_type: string;
  asset_byte_size: string;
  asset_checksum_sha256: string;
  asset_created_by_user_id: string;
  intent_idempotency_key: string | null;
  intent_object_key: string | null;
  intent_expected_content_type: string | null;
  intent_expected_byte_size: string | null;
  intent_expected_checksum_sha256: string | null;
  intent_status: "pending" | "uploaded" | "finalized" | null;
  intent_uploaded_content_type: string | null;
  intent_uploaded_byte_size: string | null;
  intent_uploaded_checksum_sha256: string | null;
  intent_asset_id: string | null;
}

interface EntityState {
  entity: EntityRow;
  placements: EntityPlacementRow[];
  references: EntityReferenceRow[];
}

interface SeedAssetRow extends QueryResultRow {
  intent_id: string;
  intent_idempotency_key: string;
  intent_media_kind: "image" | "video" | "audio";
  intent_display_name: string;
  intent_object_key: string;
  intent_expected_content_type: string;
  intent_expected_byte_size: string;
  intent_expected_checksum_sha256: string;
  intent_status: "pending" | "uploaded" | "finalized";
  intent_uploaded_content_type: string | null;
  intent_uploaded_byte_size: string | null;
  intent_uploaded_checksum_sha256: string | null;
  intent_asset_id: string | null;
  asset_id: string | null;
  asset_media_kind: "image" | "video" | "audio" | null;
  asset_display_name: string | null;
  asset_object_key: string | null;
  asset_object_version: number | null;
  asset_content_type: string | null;
  asset_byte_size: string | null;
  asset_checksum_sha256: string | null;
  asset_created_by_user_id: string | null;
}

interface AssetPlacementRow extends QueryResultRow {
  scope_kind: "personal" | "organization";
  owner_user_id: string | null;
  created_by_user_id: string;
}

interface ProjectReferenceRow extends QueryResultRow {
  id: string;
  project_id: string;
  asset_version: number;
  created_by_user_id: string;
}

export class DemoAssetFixtureConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoAssetFixtureConflictError";
  }
}

function expectedAssetsByKey(fixtures: readonly ResolvedDemoAssetFixture[]) {
  return new Map(fixtures.map((fixture) => [fixture.key, fixture]));
}

function requireExpectedAsset(
  fixturesByKey: ReadonlyMap<string, ResolvedDemoAssetFixture>,
  key: string,
): ResolvedDemoAssetFixture {
  const fixture = fixturesByKey.get(key);
  if (!fixture) throw new Error(`Demo fixture references an unknown asset key: ${key}.`);
  return fixture;
}

async function readEntityState(
  client: PoolClient,
  createIdempotencyKey: string,
  lock: boolean,
): Promise<EntityState | null> {
  const entityResult = await client.query<EntityRow>(
    `SELECT id, name, description, cover_asset_id, version,
            create_idempotency_key, created_by_user_id
     FROM workspace_entities
     WHERE workspace_id = $1
       AND created_by_user_id = $2
       AND create_idempotency_key = $3
     ${lock ? "FOR UPDATE" : ""}`,
    [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID, createIdempotencyKey],
  );
  const entity = entityResult.rows[0];
  if (!entity) return null;

  const placements = await client.query<EntityPlacementRow>(
    `SELECT scope_kind, owner_user_id, created_by_user_id
     FROM entity_placements
     WHERE workspace_id = $1 AND entity_id = $2
     ORDER BY id`,
    [DEMO_WORKSPACE_ID, entity.id],
  );
  const references = await client.query<EntityReferenceRow>(
    `SELECT reference.asset_id,
            reference.position,
            asset.media_kind AS asset_media_kind,
            asset.display_name AS asset_display_name,
            asset.object_key AS asset_object_key,
            asset.object_version AS asset_object_version,
            asset.content_type AS asset_content_type,
            asset.byte_size::text AS asset_byte_size,
            asset.checksum_sha256 AS asset_checksum_sha256,
            asset.created_by_user_id AS asset_created_by_user_id,
            intent.idempotency_key AS intent_idempotency_key,
            intent.object_key AS intent_object_key,
            intent.expected_content_type AS intent_expected_content_type,
            intent.expected_byte_size::text AS intent_expected_byte_size,
            intent.expected_checksum_sha256 AS intent_expected_checksum_sha256,
            intent.status AS intent_status,
            intent.uploaded_content_type AS intent_uploaded_content_type,
            intent.uploaded_byte_size::text AS intent_uploaded_byte_size,
            intent.uploaded_checksum_sha256 AS intent_uploaded_checksum_sha256,
            intent.asset_id AS intent_asset_id
     FROM entity_media_references AS reference
     JOIN workspace_media_assets AS asset
       ON asset.workspace_id = reference.workspace_id
      AND asset.id = reference.asset_id
     LEFT JOIN asset_upload_intents AS intent
       ON intent.workspace_id = asset.workspace_id
      AND intent.asset_id = asset.id
     WHERE reference.workspace_id = $1 AND reference.entity_id = $2
     ORDER BY reference.position, intent.id`,
    [DEMO_WORKSPACE_ID, entity.id],
  );
  return { entity, placements: placements.rows, references: references.rows };
}

function hasExpectedPlacement(state: EntityState): boolean {
  return state.placements.length === 1
    && state.placements[0]?.scope_kind === "personal"
    && state.placements[0]?.owner_user_id === DEMO_ACTOR_ID
    && state.placements[0]?.created_by_user_id === DEMO_ACTOR_ID;
}

function referenceMatchesFixture(
  reference: EntityReferenceRow,
  expected: ResolvedDemoAssetFixture,
): boolean {
  return reference.asset_media_kind === "image"
    && reference.asset_display_name === expected.displayName
    && reference.asset_object_version === 1
    && reference.asset_content_type === "image/png"
    && Number(reference.asset_byte_size) === expected.byteSize
    && reference.asset_checksum_sha256 === expected.checksumSha256
    && reference.asset_created_by_user_id === DEMO_ACTOR_ID
    && reference.intent_idempotency_key === expected.idempotencyKey
    && reference.intent_object_key === reference.asset_object_key
    && reference.intent_expected_content_type === "image/png"
    && Number(reference.intent_expected_byte_size) === expected.byteSize
    && reference.intent_expected_checksum_sha256 === expected.checksumSha256
    && reference.intent_status === "finalized"
    && reference.intent_uploaded_content_type === "image/png"
    && Number(reference.intent_uploaded_byte_size) === expected.byteSize
    && reference.intent_uploaded_checksum_sha256 === expected.checksumSha256
    && reference.intent_asset_id === reference.asset_id;
}

function stateMatchesFixture(
  state: EntityState,
  fixture: DemoEntityFixture,
  assetFixtures: readonly ResolvedDemoAssetFixture[],
  requireInitialVersion: boolean,
): boolean {
  if (
    state.entity.create_idempotency_key !== fixture.createIdempotencyKey
    || state.entity.created_by_user_id !== DEMO_ACTOR_ID
    || state.entity.name !== fixture.name
    || state.entity.description !== fixture.description
    || (requireInitialVersion && state.entity.version !== 1)
    || !hasExpectedPlacement(state)
    || state.references.length !== fixture.assetKeys.length
  ) return false;

  const fixturesByKey = expectedAssetsByKey(assetFixtures);
  for (const [index, key] of fixture.assetKeys.entries()) {
    const reference = state.references[index];
    if (!reference || reference.position !== index) return false;
    if (!referenceMatchesFixture(reference, requireExpectedAsset(fixturesByKey, key))) return false;
  }
  const coverIndex = fixture.assetKeys.indexOf(fixture.coverAssetKey);
  return coverIndex >= 0 && state.entity.cover_asset_id === state.references[coverIndex]?.asset_id;
}

function matchingCanonicalFixture(createIdempotencyKey: string): DemoEntityFixture {
  const fixture = DEMO_ENTITY_FIXTURES.find(
    (candidate) => candidate.createIdempotencyKey === createIdempotencyKey,
  );
  if (!fixture) throw new Error(`No canonical demo Entity owns ${createIdempotencyKey}.`);
  return fixture;
}

function assertReconcileableState(
  state: EntityState,
  canonicalAssets: readonly ResolvedDemoAssetFixture[],
  legacyAssets: readonly ResolvedDemoAssetFixture[],
): "canonical" | "legacy" {
  const canonicalFixture = matchingCanonicalFixture(state.entity.create_idempotency_key);
  if (stateMatchesFixture(state, canonicalFixture, canonicalAssets, false)) return "canonical";
  const legacyFixture = LEGACY_DEMO_ENTITY_FIXTURES.find(
    (candidate) => candidate.createIdempotencyKey === state.entity.create_idempotency_key,
  );
  if (legacyFixture && stateMatchesFixture(state, legacyFixture, legacyAssets, true)) return "legacy";
  throw new DemoAssetFixtureConflictError(
    `Demo Entity ${state.entity.id} no longer matches its original or canonical fixture; refusing to overwrite user changes.`,
  );
}

export async function assertDemoEntityFixturesCanBeReconciled(
  pool: Pool,
  canonicalAssets: readonly ResolvedDemoAssetFixture[],
  legacyAssets: readonly ResolvedDemoAssetFixture[],
): Promise<void> {
  const client = await pool.connect();
  try {
    for (const fixture of DEMO_ENTITY_FIXTURES) {
      const state = await readEntityState(client, fixture.createIdempotencyKey, false);
      if (state) assertReconcileableState(state, canonicalAssets, legacyAssets);
    }
  } finally {
    client.release();
  }
}

async function replaceEntityContent(
  client: PoolClient,
  state: EntityState,
  fixture: DemoEntityFixture,
  canonicalAssetsByKey: ReadonlyMap<string, WorkspaceMediaAsset>,
): Promise<void> {
  const mediaAssets = fixture.assetKeys.map((key) => {
    const asset = canonicalAssetsByKey.get(key);
    if (!asset) throw new Error(`Canonical demo Entity references an unavailable asset: ${key}.`);
    return asset;
  });
  const coverAsset = canonicalAssetsByKey.get(fixture.coverAssetKey);
  if (!coverAsset) throw new Error(`Canonical demo Entity cover is unavailable: ${fixture.coverAssetKey}.`);

  await client.query(
    "UPDATE workspace_entities SET cover_asset_id = NULL WHERE workspace_id = $1 AND id = $2",
    [DEMO_WORKSPACE_ID, state.entity.id],
  );
  await client.query(
    "DELETE FROM entity_media_references WHERE workspace_id = $1 AND entity_id = $2",
    [DEMO_WORKSPACE_ID, state.entity.id],
  );
  for (const [position, asset] of mediaAssets.entries()) {
    await client.query(
      `INSERT INTO entity_media_references (workspace_id, entity_id, asset_id, position)
       VALUES ($1, $2, $3, $4)`,
      [DEMO_WORKSPACE_ID, state.entity.id, asset.id, position],
    );
  }
  await client.query(
    `UPDATE workspace_entities
     SET name = $3,
         description = $4,
         cover_asset_id = $5,
         version = version + 1,
         updated_at = now()
     WHERE workspace_id = $1 AND id = $2`,
    [DEMO_WORKSPACE_ID, state.entity.id, fixture.name, fixture.description, coverAsset.id],
  );
  await client.query(
    `INSERT INTO entity_personal_media_bindings (
       workspace_id, entity_id, owner_user_id, asset_id
     )
     SELECT reference.workspace_id, reference.entity_id, $3, reference.asset_id
     FROM entity_media_references AS reference
     WHERE reference.workspace_id = $1 AND reference.entity_id = $2
     ON CONFLICT (workspace_id, entity_id, owner_user_id, asset_id) DO NOTHING`,
    [DEMO_WORKSPACE_ID, state.entity.id, DEMO_ACTOR_ID],
  );
}

export async function reconcileLegacyDemoEntities(
  pool: Pool,
  canonicalAssets: readonly ResolvedDemoAssetFixture[],
  legacyAssets: readonly ResolvedDemoAssetFixture[],
  canonicalAssetsByKey: ReadonlyMap<string, WorkspaceMediaAsset>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [DEMO_FIXTURE_LOCK_KEY]);
    const staged: Array<{ state: EntityState; status: "canonical" | "legacy" }> = [];
    for (const fixture of DEMO_ENTITY_FIXTURES) {
      const state = await readEntityState(client, fixture.createIdempotencyKey, true);
      if (state) staged.push({ state, status: assertReconcileableState(state, canonicalAssets, legacyAssets) });
    }
    for (const { state, status } of staged) {
      if (status !== "legacy") continue;
      await replaceEntityContent(
        client,
        state,
        matchingCanonicalFixture(state.entity.create_idempotency_key),
        canonicalAssetsByKey,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function seedAssetMatchesFixture(row: SeedAssetRow, fixture: ResolvedDemoAssetFixture): boolean {
  return row.intent_idempotency_key === fixture.idempotencyKey
    && row.intent_media_kind === "image"
    && row.intent_display_name === fixture.displayName
    && row.intent_expected_content_type === "image/png"
    && Number(row.intent_expected_byte_size) === fixture.byteSize
    && row.intent_expected_checksum_sha256 === fixture.checksumSha256
    && row.intent_status === "finalized"
    && row.intent_uploaded_content_type === "image/png"
    && Number(row.intent_uploaded_byte_size) === fixture.byteSize
    && row.intent_uploaded_checksum_sha256 === fixture.checksumSha256
    && row.intent_asset_id === row.asset_id
    && row.asset_media_kind === "image"
    && row.asset_display_name === fixture.displayName
    && row.asset_object_key === row.intent_object_key
    && row.asset_object_version === 1
    && row.asset_content_type === "image/png"
    && Number(row.asset_byte_size) === fixture.byteSize
    && row.asset_checksum_sha256 === fixture.checksumSha256
    && row.asset_created_by_user_id === DEMO_ACTOR_ID;
}

async function canvasContainsAny(client: PoolClient, needles: readonly string[]): Promise<boolean> {
  if (needles.length === 0) return false;
  const result = await client.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM canvas_documents AS document
       WHERE EXISTS (
         SELECT 1 FROM unnest($1::text[]) AS needle(value)
         WHERE strpos(document.content::text, needle.value) > 0
       )
     ) AS found`,
    [needles],
  );
  return result.rows[0]?.found === true;
}

export async function retireUnreferencedLegacyDemoAssets(
  pool: Pool,
  legacyAssets: readonly ResolvedDemoAssetFixture[],
): Promise<string[]> {
  const client = await pool.connect();
  const retiredAssetIds: string[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [DEMO_FIXTURE_LOCK_KEY]);
    for (const fixture of legacyAssets) {
      const assetResult = await client.query<SeedAssetRow>(
        `SELECT intent.id AS intent_id,
                intent.idempotency_key AS intent_idempotency_key,
                intent.media_kind AS intent_media_kind,
                intent.display_name AS intent_display_name,
                intent.object_key AS intent_object_key,
                intent.expected_content_type AS intent_expected_content_type,
                intent.expected_byte_size::text AS intent_expected_byte_size,
                intent.expected_checksum_sha256 AS intent_expected_checksum_sha256,
                intent.status AS intent_status,
                intent.uploaded_content_type AS intent_uploaded_content_type,
                intent.uploaded_byte_size::text AS intent_uploaded_byte_size,
                intent.uploaded_checksum_sha256 AS intent_uploaded_checksum_sha256,
                intent.asset_id AS intent_asset_id,
                asset.id AS asset_id,
                asset.media_kind AS asset_media_kind,
                asset.display_name AS asset_display_name,
                asset.object_key AS asset_object_key,
                asset.object_version AS asset_object_version,
                asset.content_type AS asset_content_type,
                asset.byte_size::text AS asset_byte_size,
                asset.checksum_sha256 AS asset_checksum_sha256,
                asset.created_by_user_id AS asset_created_by_user_id
         FROM asset_upload_intents AS intent
         LEFT JOIN workspace_media_assets AS asset
           ON asset.workspace_id = intent.workspace_id
          AND asset.id = intent.asset_id
         WHERE intent.workspace_id = $1
           AND intent.created_by_user_id = $2
           AND intent.idempotency_key = $3
         FOR UPDATE OF intent`,
        [DEMO_WORKSPACE_ID, DEMO_ACTOR_ID, fixture.idempotencyKey],
      );
      const asset = assetResult.rows[0];
      if (!asset || !asset.asset_id || !asset.asset_object_key || !seedAssetMatchesFixture(asset, fixture)) continue;

      const entityReferences = await client.query(
        `SELECT 1 FROM entity_media_references
         WHERE workspace_id = $1 AND asset_id = $2 LIMIT 1`,
        [DEMO_WORKSPACE_ID, asset.asset_id],
      );
      if (entityReferences.rows[0]) continue;

      const placements = await client.query<AssetPlacementRow>(
        `SELECT scope_kind, owner_user_id, created_by_user_id
         FROM media_asset_placements
         WHERE workspace_id = $1 AND asset_id = $2
         ORDER BY id`,
        [DEMO_WORKSPACE_ID, asset.asset_id],
      );
      if (
        placements.rows.length > 1
        || placements.rows.some((placement) => (
          placement.scope_kind !== "personal"
          || placement.owner_user_id !== DEMO_ACTOR_ID
          || placement.created_by_user_id !== DEMO_ACTOR_ID
        ))
      ) continue;

      const projectReferences = await client.query<ProjectReferenceRow>(
        `SELECT id, project_id, asset_version, created_by_user_id
         FROM project_asset_references
         WHERE workspace_id = $1 AND asset_id = $2
         ORDER BY id`,
        [DEMO_WORKSPACE_ID, asset.asset_id],
      );
      if (
        projectReferences.rows.length > 1
        || projectReferences.rows.some((reference) => (
          reference.project_id !== DEMO_PROJECT_ID
          || reference.asset_version !== 1
          || reference.created_by_user_id !== DEMO_ACTOR_ID
        ))
      ) continue;

      if (await canvasContainsAny(client, [
        asset.asset_id,
        asset.asset_object_key,
        ...projectReferences.rows.map(({ id }) => id),
      ])) continue;

      await client.query(
        `DELETE FROM project_asset_references
         WHERE workspace_id = $1 AND asset_id = $2 AND project_id = $3
           AND asset_version = 1 AND created_by_user_id = $4`,
        [DEMO_WORKSPACE_ID, asset.asset_id, DEMO_PROJECT_ID, DEMO_ACTOR_ID],
      );
      await client.query(
        `DELETE FROM media_asset_placements
         WHERE workspace_id = $1 AND asset_id = $2 AND scope_kind = 'personal'
           AND owner_user_id = $3 AND created_by_user_id = $3`,
        [DEMO_WORKSPACE_ID, asset.asset_id, DEMO_ACTOR_ID],
      );
      retiredAssetIds.push(asset.asset_id);
    }
    await client.query("COMMIT");
    return retiredAssetIds;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
