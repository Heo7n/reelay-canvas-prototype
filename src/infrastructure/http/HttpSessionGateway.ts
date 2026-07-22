import type {
  PasswordCredentials,
  SessionGateway,
} from "../../application/session/SessionGateway";
import type { SessionActor, SessionSnapshot } from "../../domain/identity/session";
import { DemoSessionResponseDtoSchema, SessionResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

type SessionActorDto = (typeof SessionResponseDtoSchema)["_output"]["actor"];

function toSessionActor(actor: NonNullable<SessionActorDto>): SessionActor {
  return {
    account: actor.account,
    id: actor.id,
    displayName: actor.displayName,
    workspaceIds: [...actor.workspaceIds],
  };
}

export class HttpSessionGateway implements SessionGateway {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async getCurrent(): Promise<SessionSnapshot> {
    const response = await this.http.read("/api/session", SessionResponseDtoSchema);
    return { actor: response.actor ? toSessionActor(response.actor) : null };
  }

  async signInWithPassword(credentials: PasswordCredentials): Promise<SessionSnapshot> {
    const response = await this.http.read("/api/demo/session", DemoSessionResponseDtoSchema, {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    return { actor: toSessionActor(response.actor) };
  }

  async signOut(): Promise<void> {
    await this.http.sendWithoutResponse("/api/session", { method: "DELETE" });
  }
}
