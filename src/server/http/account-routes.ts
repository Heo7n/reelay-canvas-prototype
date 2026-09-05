import type { FastifyInstance } from "fastify";

import type { AccountStore } from "../application/AccountStore";
import type { SessionActorReader } from "../application/SessionStore";
import { UpdateAccountContactsBodySchema } from "./contracts";
import { getRequestActor } from "./session-context";

type AccountRouteCapabilities = AccountStore & SessionActorReader;

export async function registerAccountRoutes(
  app: FastifyInstance,
  capabilities: AccountRouteCapabilities,
): Promise<void> {
  app.patch("/api/account", async (request, reply) => {
    const actor = await getRequestActor(request, capabilities);
    if (!actor) {
      return reply.code(401).send({
        error: { code: "session_required", message: "请先登录演示账号。" },
      });
    }
    const body = UpdateAccountContactsBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: { code: "invalid_request", message: "请检查联系邮箱和手机号码格式。" },
      });
    }
    const updated = await capabilities.updateAccountContacts(actor.id, {
      contactEmail: body.data.contactEmail ?? null,
      contactPhone: body.data.contactPhone ?? null,
    });
    if (!updated) {
      return reply.code(404).send({
        error: { code: "account_not_found", message: "当前演示账号不存在。" },
      });
    }
    return { actor: updated };
  });
}
