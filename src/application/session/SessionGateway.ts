import type { SessionSnapshot } from "../../domain/identity/session";

export interface PasswordCredentials {
  account: string;
  password: string;
}

export interface SessionGateway {
  getCurrent(): Promise<SessionSnapshot>;
  signInWithPassword(credentials: PasswordCredentials): Promise<SessionSnapshot>;
  signOut(): Promise<void>;
}
