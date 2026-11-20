/** Application errors carry the HTTP status they should map to. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Please log in.') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to do that.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Not found.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, extra: Record<string, unknown> = {}) {
    super(400, 'VALIDATION_ERROR', message, extra);
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(409, code, message, extra);
  }
}

export class BusinessRuleError extends AppError {
  constructor(code: string, message: string, extra: Record<string, unknown> = {}) {
    super(422, code, message, extra);
  }
}

export class RateLimitError extends AppError {
  constructor(message: string, retryAfterSeconds: number) {
    super(429, 'RATE_LIMITED', message, { retryAfterSeconds });
  }
}

export class LockTimeoutError extends AppError {
  constructor(message = 'The seats are busy right now. Please try again in a moment.') {
    super(503, 'LOCK_TIMEOUT', message);
  }
}

/** Normalises any thrown value (including pg errors) into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code = (err as { code?: string })?.code;
  if (code === '55P03') return new LockTimeoutError();
  if (code === '23505') {
    return new ConflictError('CONFLICT', 'That change conflicts with another request. Refresh and try again.');
  }
  if (code === '40P01' || code === '40001') {
    return new AppError(503, 'RETRY', 'The server is busy. Please try again.');
  }
  console.error(err);
  return new AppError(500, 'INTERNAL', 'Something went wrong.');
}
