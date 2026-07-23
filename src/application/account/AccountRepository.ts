import type { SessionActor } from "../../domain/identity/session";

export interface UpdateAccountContactsInput {
  contactEmail: string | null;
  contactPhone: string | null;
}

export interface AccountRepository {
  updateContacts(input: UpdateAccountContactsInput): Promise<SessionActor>;
}
