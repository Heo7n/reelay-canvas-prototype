import type { FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import type { InMemoryCollaborationStore } from "../infrastructure/InMemoryCollaborationStore";

export const DEMO_SESSION_COOKIE = "reelay_demo_session";

export function getRequestActor(
  request: FastifyRequest,
  store: InMemoryCollaborationStore,
): SessionActor | null {
  return store.getSessionActor(request.cookies[DEMO_SESSION_COOKIE]);
}
