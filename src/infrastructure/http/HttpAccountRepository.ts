import type {
  AccountRepository,
  UpdateAccountContactsInput,
} from "../../application/account/AccountRepository";
import type { SessionActor } from "../../domain/identity/session";
import { AccountResponseDtoSchema } from "./contracts";
import { HttpApiClient, type HttpAdapterOptions } from "./HttpApiClient";

export class HttpAccountRepository implements AccountRepository {
  private readonly http: HttpApiClient;

  constructor(options: HttpAdapterOptions | HttpApiClient = {}) {
    this.http = options instanceof HttpApiClient ? options : new HttpApiClient(options);
  }

  async updateContacts(input: UpdateAccountContactsInput): Promise<SessionActor> {
    const response = await this.http.read("/api/account", AccountResponseDtoSchema, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return response.actor;
  }
}
