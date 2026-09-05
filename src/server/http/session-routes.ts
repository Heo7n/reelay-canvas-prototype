import type { FastifyInstance } from "fastify";

import type { SessionStore } from "../application/SessionStore";
import { DemoSessionBodySchema } from "./contracts";
import { DEMO_SESSION_COOKIE, getRequestActor } from "./session-context";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: false,
};

export async function registerSessionRoutes(
  app: FastifyInstance,
  sessions: SessionStore,
  secureCookie: boolean,
): Promise<void> {
  app.get("/api/session", async (request) => ({ actor: await getRequestActor(request, sessions) }));

  app.post("/api/demo/session", async (request, reply) => {
    const parsed = DemoSessionBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: "invalid_request", message: "账号和密码不能为空。" } });
    }

    const actorId = await sessions.authenticate(parsed.data.account, parsed.data.password);
    if (!actorId) {
      return reply.code(401).send({ error: { code: "invalid_credentials", message: "演示账号或密码错误。" } });
    }

    const sessionId = await sessions.createSession(actorId);
    reply.setCookie(DEMO_SESSION_COOKIE, sessionId, { ...cookieOptions, secure: secureCookie });
    return reply.code(201).send({ actor: await sessions.getSessionActor(sessionId), mode: "demo" });
  });

  app.delete("/api/session", async (request, reply) => {
    const sessionId = request.cookies[DEMO_SESSION_COOKIE];
    if (sessionId) await sessions.deleteSession(sessionId);
    reply.clearCookie(DEMO_SESSION_COOKIE, { ...cookieOptions, secure: secureCookie });
    return reply.code(204).send();
  });
}
