import type { ActorId, SessionActor } from "../../domain/identity/session";

export interface SessionActorReader {
  getSessionActor(sessionId: string | undefined): Promise<SessionActor | null>;
}

export interface SessionStore extends SessionActorReader {
  authenticate(account: string, password: string): Promise<ActorId | null>;
  createSession(actorId: ActorId): Promise<string>;
  deleteSession(sessionId: string): Promise<void>;
}
