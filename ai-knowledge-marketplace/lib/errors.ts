/**
 * Typed application errors. API routes throw these; toApiResponse()
 * converts them to a consistent JSON shape and status code so error
 * handling doesn't get reinvented per-route.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Not permitted") {
    super(message, 403, "forbidden");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  readonly issues: unknown;
  constructor(message = "Invalid input", issues?: unknown) {
    super(message, 422, "validation_error");
    this.issues = issues;
  }
}

export function toApiResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message, issues: (err as ValidationError).issues } },
      { status: err.statusCode }
    );
  }
  // Never leak internal error details for unexpected failures.
  console.error(err);
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500 }
  );
}
