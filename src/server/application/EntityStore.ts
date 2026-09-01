import type {
  EntityContentInput,
  EntityId,
  WorkspaceEntity,
} from "../../domain/asset/entity";
import type { ActorId } from "../../domain/identity/session";
import type { WorkspaceId } from "../../domain/workspace/workspace";

export interface CreatePersonalEntityInput extends EntityContentInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
  idempotencyKey: string;
}

export interface ListPersonalEntitiesInput {
  actorId: ActorId;
  workspaceId: WorkspaceId;
}

export interface ReadPersonalEntityInput extends ListPersonalEntitiesInput {
  entityId: EntityId;
}

export interface UpdatePersonalEntityInput extends ReadPersonalEntityInput, EntityContentInput {
  expectedVersion: number;
}

export class EntityWorkspaceUnavailableError extends Error {
  constructor() {
    super("The workspace is unavailable or inaccessible to the actor.");
    this.name = "EntityWorkspaceUnavailableError";
  }
}

export class EntityUnavailableError extends Error {
  constructor() {
    super("The entity is unavailable or inaccessible to the actor.");
    this.name = "EntityUnavailableError";
  }
}

export class EntityMediaUnavailableError extends Error {
  constructor() {
    super("At least one referenced media asset is unavailable or inaccessible to the actor.");
    this.name = "EntityMediaUnavailableError";
  }
}

export class EntityCoverMediaInvalidError extends Error {
  constructor() {
    super("The Entity cover must reference an image or video asset.");
    this.name = "EntityCoverMediaInvalidError";
  }
}

export class EntityCreateConflictError extends Error {
  constructor(readonly reason: "idempotency_key_reused") {
    super(`Entity creation cannot continue: ${reason}.`);
    this.name = "EntityCreateConflictError";
  }
}

export class EntityVersionConflictError extends Error {
  constructor(readonly currentVersion: number) {
    super(`Entity version conflict. Current version: ${currentVersion}.`);
    this.name = "EntityVersionConflictError";
  }
}

export interface EntityStore {
  createPersonalEntity(input: CreatePersonalEntityInput): Promise<WorkspaceEntity>;
  listPersonalEntities(input: ListPersonalEntitiesInput): Promise<WorkspaceEntity[]>;
  getPersonalEntity(input: ReadPersonalEntityInput): Promise<WorkspaceEntity | null>;
  updatePersonalEntity(input: UpdatePersonalEntityInput): Promise<WorkspaceEntity>;
}
