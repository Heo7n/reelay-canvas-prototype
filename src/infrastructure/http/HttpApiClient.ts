import type { ZodType } from "zod";

import { ErrorResponseDtoSchema } from "./contracts";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface HttpAdapterOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

export class HttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpRequestError";
  }
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

  constructor(options: HttpAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async read<T>(path: string, schema: ZodType<T>, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    let payload: unknown;

    try {
      payload = await response.json();
    } catch (cause) {
      throw new HttpResponseValidationError(path, { cause });
    }

    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new HttpResponseValidationError(path, { cause: parsed.error });
    }
    return parsed.data;
  }

  async sendWithoutResponse(path: string, init: RequestInit = {}): Promise<void> {
    await this.send(path, init);
  }

  private async send(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body !== undefined && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetchImpl(this.resolveUrl(path), {
      ...init,
      credentials: init.credentials ?? "include",
      headers,
    });

    if (!response.ok) {
      throw await this.toRequestError(response);
    }
    return response;
  }

  private resolveUrl(path: string): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  private async toRequestError(response: Response): Promise<HttpRequestError> {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const parsed = ErrorResponseDtoSchema.safeParse(payload);
    if (parsed.success) {
      return new HttpRequestError(response.status, parsed.data.error.code, parsed.data.error.message);
    }

    return new HttpRequestError(
      response.status,
      "http_error",
      response.statusText || `HTTP request failed with status ${response.status}.`,
    );
  }
}
