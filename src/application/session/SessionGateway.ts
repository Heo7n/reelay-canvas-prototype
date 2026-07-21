import type { ActorId, SessionSnapshot } from "../../domain/identity/session";

export interface SessionGateway {
  getCurrent(): Promise<SessionSnapshot>;
  switchDemoActor(actorId: ActorId): Promise<SessionSnapshot>;
  signOut(): Promise<void>;
}
