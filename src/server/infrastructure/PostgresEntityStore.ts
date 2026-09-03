import { randomUUID } from "node:crypto";

import type { Pool, PoolClient, QueryResultRow } from "pg";

import {
  normalizeEntityContent,
  normalizeEntityIdempotencyKey,
  normalizeExpectedEntityVersion,
  type NormalizedEntityContent,
  type WorkspaceEntity,
} from "../../domain/asset/entity";
import {
  EntityCreateConflictError,
  EntityCoverMediaInvalidError,
  EntityMediaUnavailableError,
  EntityUnavailableError,
  EntityVersionConflictError,
  EntityWorkspaceUnavailableError,
  type CreatePersonalEntityInput,
  type EntityStore,
  type ListPersonalEntitiesInput,
  type ReadPersonalEntityInput,
  type UpdatePersonalEntityInput,
} from "../application/EntityStore";

interface EntityRow extends QueryResultRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  cover_asset_id: string | null;
  cover_media_kind: "image" | "video" | "audio" | null;
  version: number;
  created_by_user_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  asset_id: string;
  position: number;
}

interface LockedEntityRow extends QueryResultRow {
  version: number;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function mapEntities(rows: EntityRow[]): WorkspaceEntity[] {
  const entities = new Map<string, WorkspaceEntity>();
  for (const row of rows) {
    let entity = entities.get(row.id);
    if (!entity) {
      if (row.cover_asset_id && row.cover_media_kind !== "image") {
        throw new EntityCoverMediaInvalidError();
      }
      entity = {
        id: row.id,
        workspaceId: row.workspace_id,
        name: row.name,
        description: row.description,
        mediaRefs: [],
        coverMediaId: row.cover_asset_id,
        version: row.version,
        createdByActorId: row.created_by_user_id,
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      };
      entities.set(row.id, entity);
    }
    entity.mediaRefs.push({ mediaAssetId: row.asset_id, order: row.position });
  }
  return [...entities.values()];
}

function sameContent(entity: WorkspaceEntity, content: NormalizedEntityContent): boolean {
  return entity.name === content.name
    && entity.description === content.description
    && entity.coverMediaId === content.coverMediaId
    && entity.mediaRefs.length === content.mediaRefs.length
    && entity.mediaRefs.every((reference, index) => {
      const expected = content.mediaRefs[index];
      return reference.mediaAssetId === expected.mediaAssetId && reference.order === expected.order;
    });
}

const entityColumns = `
  entity.id,
  entity.workspace_id,
  entity.name,
  entity.description,
  entity.cover_asset_id,
  (
    SELECT cover_asset.media_kind
    FROM workspace_media_assets AS cover_asset
    WHERE cover_asset.workspace_id = entity.workspace_id
      AND cover_asset.id = entity.cover_asset_id
  ) AS cover_media_kind,
  entity.version,
  entity.created_by_user_id,
  entity.created_at,
  entity.updated_at,
  reference.asset_id,
  reference.position
`;

export class PostgresEntityStore implements EntityStore {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
    private readonly createId: () => string = randomUUID,
  ) {}

  async createPersonalEntity(input: CreatePersonalEntityInput): Promise<WorkspaceEntity> {
    const idempotencyKey = normalizeEntityIdempotencyKey(input.idempotencyKey);
    const content = normalizeEntityContent(input);
    return this.withTransaction(async (client) => {
      await this.lockWorkspaceMembership(client, input.workspaceId, input.actorId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify(["entity-create", input.workspaceId, input.actorId, idempotencyKey])],
      );

      const existing = await this.readEntityByCreateCommand(
        client,
        input.workspaceId,
        input.actorId,
        idempotencyKey,
      );
      if (existing) {
        if (!sameContent(existing, content)) throw new EntityCreateConflictError("idempotency_key_reused");
        await this.lockPersonalMedia(client, input.workspaceId, input.actorId, content);
        await this.ensurePersonalEntityPlacement(
          client,
          input.workspaceId,
          input.actorId,
          existing.id,
          this.now().toISOString(),
        );
        await this.ensurePersonalMediaBindings(client, input.workspaceId, input.actorId, existing.id);
        const restored = await this.readPersonalEntity(client, input.workspaceId, input.actorId, existing.id);
        if (!restored) throw new EntityUnavailableError();
        return restored;
      }

      await this.lockPersonalMedia(client, input.workspaceId, input.actorId, content);
      const timestamp = this.now().toISOString();
      const entityId = `entity-${this.createId()}`;
      await client.query(
        `INSERT INTO workspace_entities (
           id, workspace_id, name, description, cover_asset_id, version,
           create_idempotency_key, created_by_user_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, NULL, 1, $5, $6, $7, $7)`,
        [entityId, input.workspaceId, content.name, content.description, idempotencyKey, input.actorId, timestamp],
      );
      await this.insertMediaReferences(client, input.workspaceId, entityId, content);
      if (content.coverMediaId) {
        await client.query(
          "UPDATE workspace_entities SET cover_asset_id = $3 WHERE workspace_id = $1 AND id = $2",
          [input.workspaceId, entityId, content.coverMediaId],
        );
      }
      await this.ensurePersonalEntityPlacement(client, input.workspaceId, input.actorId, entityId, timestamp);
      await this.ensurePersonalMediaBindings(client, input.workspaceId, input.actorId, entityId);
      const created = await this.readPersonalEntity(client, input.workspaceId, input.actorId, entityId);
      if (!created) throw new EntityUnavailableError();
      return created;
    });
  }

  async listPersonalEntities(input: ListPersonalEntitiesInput): Promise<WorkspaceEntity[]> {
    return this.withTransaction(async (client) => {
      await this.lockWorkspaceMembership(client, input.workspaceId, input.actorId);
      const result = await client.query<EntityRow>(
        `SELECT ${entityColumns}
         FROM entity_placements AS placement
         JOIN workspace_entities AS entity
           ON entity.workspace_id = placement.workspace_id
          AND entity.id = placement.entity_id
         JOIN entity_media_references AS reference
           ON reference.workspace_id = entity.workspace_id
          AND reference.entity_id = entity.id
         WHERE placement.workspace_id = $1
           AND placement.scope_kind = 'personal'
           AND placement.owner_user_id = $2
         ORDER BY entity.updated_at DESC, entity.id, reference.position`,
        [input.workspaceId, input.actorId],
      );
      return mapEntities(result.rows);
    });
  }

  async getPersonalEntity(input: ReadPersonalEntityInput): Promise<WorkspaceEntity | null> {
    return this.withTransaction(async (client) => {
      await this.lockWorkspaceMembership(client, input.workspaceId, input.actorId);
      return this.readPersonalEntity(client, input.workspaceId, input.actorId, input.entityId);
    });
  }

  async updatePersonalEntity(input: UpdatePersonalEntityInput): Promise<WorkspaceEntity> {
    const expectedVersion = normalizeExpectedEntityVersion(input.expectedVersion);
    const content = normalizeEntityContent(input);
    return this.withTransaction(async (client) => {
      await this.lockWorkspaceMembership(client, input.workspaceId, input.actorId);
      const locked = await client.query<LockedEntityRow>(
        `SELECT entity.version
         FROM entity_placements AS placement
         JOIN workspace_entities AS entity
           ON entity.workspace_id = placement.workspace_id
          AND entity.id = placement.entity_id
         WHERE placement.workspace_id = $1
           AND placement.entity_id = $2
           AND placement.scope_kind = 'personal'
           AND placement.owner_user_id = $3
         FOR UPDATE OF entity, placement`,
        [input.workspaceId, input.entityId, input.actorId],
      );
      const current = locked.rows[0];
      if (!current) throw new EntityUnavailableError();
      if (current.version !== expectedVersion) throw new EntityVersionConflictError(current.version);

      await this.lockPersonalMedia(client, input.workspaceId, input.actorId, content);
      await client.query(
        "UPDATE workspace_entities SET cover_asset_id = NULL WHERE workspace_id = $1 AND id = $2",
        [input.workspaceId, input.entityId],
      );
      await client.query(
        "DELETE FROM entity_media_references WHERE workspace_id = $1 AND entity_id = $2",
        [input.workspaceId, input.entityId],
      );
      await this.insertMediaReferences(client, input.workspaceId, input.entityId, content);
      await this.ensurePersonalMediaBindings(client, input.workspaceId, input.actorId, input.entityId);
      const updatedAt = this.now().toISOString();
      await client.query(
        `UPDATE workspace_entities
         SET name = $3,
             description = $4,
             cover_asset_id = $5,
             version = version + 1,
             updated_at = $6
         WHERE workspace_id = $1 AND id = $2`,
        [
          input.workspaceId,
          input.entityId,
          content.name,
          content.description,
          content.coverMediaId,
          updatedAt,
        ],
      );
      const updated = await this.readPersonalEntity(client, input.workspaceId, input.actorId, input.entityId);
      if (!updated) throw new EntityUnavailableError();
      return updated;
    });
  }

  private async lockWorkspaceMembership(client: PoolClient, workspaceId: string, actorId: string): Promise<void> {
    const membership = await client.query(
      `SELECT 1
       FROM memberships
       WHERE workspace_id = $1 AND user_id = $2
       FOR KEY SHARE`,
      [workspaceId, actorId],
    );
    if (!membership.rows[0]) throw new EntityWorkspaceUnavailableError();
  }

  private async lockPersonalMedia(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    content: NormalizedEntityContent,
  ): Promise<void> {
    const assetIds = content.mediaRefs.map(({ mediaAssetId }) => mediaAssetId);
    const available = await client.query<{ id: string; media_kind: "image" | "video" | "audio" }>(
      `SELECT asset.id, asset.media_kind
       FROM unnest($3::text[]) AS requested(id)
       JOIN workspace_media_assets AS asset
         ON asset.workspace_id = $1
        AND asset.id = requested.id
       JOIN media_asset_placements AS placement
         ON placement.workspace_id = asset.workspace_id
        AND placement.asset_id = asset.id
        AND placement.scope_kind = 'personal'
        AND placement.owner_user_id = $2
       FOR KEY SHARE OF asset, placement`,
      [workspaceId, actorId, assetIds],
    );
    if (available.rows.length !== assetIds.length) throw new EntityMediaUnavailableError();
    const cover = content.coverMediaId
      ? available.rows.find((asset) => asset.id === content.coverMediaId)
      : null;
    if (content.coverMediaId && cover?.media_kind !== "image") {
      throw new EntityCoverMediaInvalidError();
    }
  }

  private async insertMediaReferences(
    client: PoolClient,
    workspaceId: string,
    entityId: string,
    content: NormalizedEntityContent,
  ): Promise<void> {
    await client.query(
      `INSERT INTO entity_media_references (workspace_id, entity_id, asset_id, position)
       SELECT $1, $2, media.asset_id, media.ordinality - 1
       FROM unnest($3::text[]) WITH ORDINALITY AS media(asset_id, ordinality)`,
      [workspaceId, entityId, content.mediaRefs.map(({ mediaAssetId }) => mediaAssetId)],
    );
  }

  private async ensurePersonalEntityPlacement(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    entityId: string,
    createdAt: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO entity_placements (
         id, workspace_id, entity_id, scope_kind, owner_user_id, created_by_user_id, created_at
       ) VALUES ($1, $2, $3, 'personal', $4, $4, $5)
       ON CONFLICT (workspace_id, entity_id, owner_user_id) DO NOTHING`,
      [`entity-placement-${this.createId()}`, workspaceId, entityId, actorId, createdAt],
    );
  }

  private async ensurePersonalMediaBindings(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    entityId: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO entity_personal_media_bindings (
         workspace_id, entity_id, owner_user_id, asset_id
       )
       SELECT reference.workspace_id, reference.entity_id, $3, reference.asset_id
       FROM entity_media_references AS reference
       WHERE reference.workspace_id = $1
         AND reference.entity_id = $2
       ON CONFLICT (workspace_id, entity_id, owner_user_id, asset_id) DO NOTHING`,
      [workspaceId, entityId, actorId],
    );
  }

  private async readPersonalEntity(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    entityId: string,
  ): Promise<WorkspaceEntity | null> {
    const result = await client.query<EntityRow>(
      `SELECT ${entityColumns}
       FROM entity_placements AS placement
       JOIN workspace_entities AS entity
         ON entity.workspace_id = placement.workspace_id
        AND entity.id = placement.entity_id
       JOIN entity_media_references AS reference
         ON reference.workspace_id = entity.workspace_id
        AND reference.entity_id = entity.id
       WHERE placement.workspace_id = $1
         AND placement.entity_id = $2
         AND placement.scope_kind = 'personal'
         AND placement.owner_user_id = $3
       ORDER BY reference.position`,
      [workspaceId, entityId, actorId],
    );
    return mapEntities(result.rows)[0] ?? null;
  }

  private async readEntityByCreateCommand(
    client: PoolClient,
    workspaceId: string,
    actorId: string,
    idempotencyKey: string,
  ): Promise<WorkspaceEntity | null> {
    const result = await client.query<EntityRow>(
      `SELECT ${entityColumns}
       FROM workspace_entities AS entity
       JOIN entity_media_references AS reference
         ON reference.workspace_id = entity.workspace_id
        AND reference.entity_id = entity.id
       WHERE entity.workspace_id = $1
         AND entity.created_by_user_id = $2
         AND entity.create_idempotency_key = $3
       ORDER BY reference.position`,
      [workspaceId, actorId, idempotencyKey],
    );
    return mapEntities(result.rows)[0] ?? null;
  }

  private async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
