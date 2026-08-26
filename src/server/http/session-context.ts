import type { FastifyRequest } from "fastify";

import type { SessionActor } from "../../domain/identity/session";
import type { SessionActorReader } from "../application/SessionStore";

export const DEMO_SESSION_COOKIE = "reelay_demo_session";

export async function getRequestActor(
  request: FastifyRequest,
  sessions: SessionActorReader,
): Promise<SessionActor | null> {
  return await sessions.getSessionActor(request.cookies[DEMO_SESSION_COOKIE]);
}
