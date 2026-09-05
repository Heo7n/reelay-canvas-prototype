import type { ActorId, SessionActor } from "../../domain/identity/session";

export interface AccountStore {
  updateAccountContacts(
    actorId: ActorId,
    contacts: { contactEmail: string | null; contactPhone: string | null },
  ): Promise<SessionActor | null>;
}
