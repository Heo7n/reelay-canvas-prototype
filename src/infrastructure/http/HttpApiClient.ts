import type { ZodType } from "zod";

import { ApplicationError, type ApplicationErrorCode } from "../../application/shared/ApplicationError";
import { ErrorResponseDtoSchema } from "./contracts";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HttpAdapterOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export class HttpResponseValidationError extends Error {
  constructor(
    readonly path: string,
    options?: ErrorOptions,
  ) {
    super(`The API response for ${path} did not match its runtime contract.`, options);
    this.name = "HttpResponseValidationError";
  }
}

export class HttpApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly pendingJsonReads = new Map<string, Promise<string>>();
  private activeWrites = 0;

  constructor(options: HttpAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async read<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
    return this.withWriteBoundary(init, async () => {
      const text = await this.readPayload(path, init);
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (cause) {
        throw new HttpResponseValidationError(path, { cause });
      }

      const parsed = schema.safeParse(payload);
      if (!parsed.success) {
        throw new HttpResponseValidationError(path, { cause: parsed.error });
      }
      return parsed.data;
    });
  }

  async sendWithoutResponse(path: string, init: RequestInit = {}): Promise<void> {
    await this.withWriteBoundary(init, () => this.send(path, init));
  }

  private readPayload(path: string, init?: RequestInit): Promise<string> {
    // Explicit request options retain their own headers, credentials and cancellation.
    if (init !== undefined || this.activeWrites > 0) return this.loadPayload(path, init ?? {});
    const key = this.resolveUrl(path);
    const current = this.pendingJsonReads.get(key);
    if (current) return current;
    const pending = this.loadPayload(path, {}).finally(() => {
      if (this.pendingJsonReads.get(key) === pending) this.pendingJsonReads.delete(key);
    });
    this.pendingJsonReads.set(key, pending);
    return pending;
  }

  private async loadPayload(path: string, init: RequestInit): Promise<string> {
    const response = await this.send(path, init);
    try {
      return await response.text();
    } catch (cause) {
      throw new HttpResponseValidationError(path, { cause });
    }
  }

  private async withWriteBoundary<T>(init: RequestInit | undefined, operation: () => Promise<T>): Promise<T> {
    const writes = !["GET", "HEAD"].includes((init?.method ?? "GET").toUpperCase());
    if (writes) {
      this.activeWrites += 1;
      this.pendingJsonReads.clear();
    }
    try {
      return await operation();
    } finally {
      if (writes) {
        this.activeWrites -= 1;
        this.pendingJsonReads.clear();
      }
    }
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.resolveUrl(path), {
        ...init,
        credentials: init.credentials ?? "include",
        headers,
      });
    } catch (cause) {
      throw new ApplicationError("request_failed", "暂时无法连接 Reelay 服务，请稍后重试。", { cause });
    }

    if (!response.ok) {
      throw await this.toRequestError(response);
    }
    return response;
  }

  private resolveUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  private async toRequestError(response: Response): Promise<ApplicationError> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const parsed = ErrorResponseDtoSchema.safeParse(payload);
    if (parsed.success) {
      const { currentRevision, currentVersion } = parsed.data.error;
      const details = currentRevision === undefined && currentVersion === undefined
        ? undefined
        : {
            ...(currentRevision === undefined ? {} : { currentRevision }),
            ...(currentVersion === undefined ? {} : { currentVersion }),
          };
      return new ApplicationError(
        toApplicationErrorCode(response.status),
        parsed.data.error.message,
        {
          details,
          serviceCode: parsed.data.error.code,
        },
      );
    }

    return new ApplicationError(
      toApplicationErrorCode(response.status),
      response.statusText || `HTTP request failed with status ${response.status}.`,
      { serviceCode: "http_error" },
    );
  }
}

function toApplicationErrorCode(status: number): ApplicationErrorCode {
  if (status === 401) return "authentication_required";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  return "request_failed";
}
