import { z } from "zod";

/**
 * The one error shape for every API route and Server Action (see docs/CONVENTIONS.md → Errors).
 * Clients read `code`; `message` is safe, fixed text; `fields` lists input errors per field.
 */
export type ErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "internal";

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string[]>;
  };
}

export const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  invalid_input: "The input is not valid.",
  unauthorized: "Sign in to continue.",
  forbidden: "You do not have permission to do this.",
  not_found: "Not found.",
  conflict: "This conflicts with an existing record.",
  internal: "Something went wrong.",
};

/**
 * An error we expect and may show to the user. Its message must be safe to publish:
 * never pass another error's message, a database error or a stack trace.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string[]>;

  constructor(code: ErrorCode, message?: string, fields?: Record<string, string[]>) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = "AppError";
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Turn any thrown value into the error body and HTTP status.
 * Unknown errors are logged on the server and reported as "internal", with no details.
 */
export function toErrorBody(
  err: unknown,
  log: (...args: unknown[]) => void = console.error,
): { body: ErrorBody; status: number } {
  if (err instanceof AppError) {
    const body: ErrorBody = { error: { code: err.code, message: err.message } };
    if (err.fields) body.error.fields = err.fields;
    return { body, status: HTTP_STATUS[err.code] };
  }
  if (err instanceof z.ZodError) {
    const { formErrors, fieldErrors } = z.flattenError(err);
    const fields: Record<string, string[]> = {};
    for (const [name, messages] of Object.entries(fieldErrors)) {
      if (Array.isArray(messages) && messages.length > 0) fields[name] = messages;
    }
    if (formErrors.length > 0) fields._form = formErrors;
    return {
      body: { error: { code: "invalid_input", message: DEFAULT_MESSAGE.invalid_input, fields } },
      status: HTTP_STATUS.invalid_input,
    };
  }
  log("Unexpected error:", err);
  return {
    body: { error: { code: "internal", message: DEFAULT_MESSAGE.internal } },
    status: HTTP_STATUS.internal,
  };
}

/** A JSON error response for an API route, never cached. */
export function errorResponse(err: unknown): Response {
  const { body, status } = toErrorBody(err);
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
