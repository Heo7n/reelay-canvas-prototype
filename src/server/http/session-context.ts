import type { FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import type { CollaborationStore } from "../application/CollaborationStore";

export const DEMO_SESSION_COOKIE = "reelay_demo_session";

export async function getRequestActor(
  request: FastifyRequest,
  store: CollaborationStore,
): Promise<SessionActor | null> {
  return await store.getSessionActor(request.cookies[DEMO_SESSION_COOKIE]);
}
