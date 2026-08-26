export type ApplicationErrorCode =
  | "authentication_required"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "request_failed";

interface ApplicationErrorOptions extends ErrorOptions {
  serviceCode?: string;
  details?: Readonly<Record<string, unknown>>;
}

export class ApplicationError extends Error {
  readonly code: ApplicationErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly serviceCode?: string;

  constructor(code: ApplicationErrorCode, message: string, options: ApplicationErrorOptions = {}) {
    super(message, options);
    this.name = "ApplicationError";
    this.code = code;
    this.details = options.details;
    this.serviceCode = options.serviceCode;
  }
}

export function isApplicationError(
  error: unknown,
  code?: ApplicationErrorCode,
): error is ApplicationError {
  return error instanceof ApplicationError && (code === undefined || error.code === code);
}
