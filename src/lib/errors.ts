/**
 * Application error taxonomy. Every error that reaches an API route is mapped
 * to a safe HTTP response; anything that is not an AppError becomes a generic
 * 500 so stack traces, SQL text and file paths never reach the client.
 */
export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'MFA_REQUIRED'
  | 'REAUTH_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'INSUFFICIENT_STOCK'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  MFA_REQUIRED: 401,
  REAUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 422,
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const unauthenticated = (m = 'You need to sign in to continue.') =>
  new AppError('UNAUTHENTICATED', m);
export const forbidden = (m = 'You do not have access to this action.') => new AppError('FORBIDDEN', m);
export const notFound = (m = 'That record no longer exists.') => new AppError('NOT_FOUND', m);
export const conflict = (m: string, details?: unknown) => new AppError('CONFLICT', m, details);
export const validationError = (m: string, details?: unknown) =>
  new AppError('VALIDATION_ERROR', m, details);
export const rateLimited = (m = 'Too many attempts. Wait a moment and try again.') =>
  new AppError('RATE_LIMITED', m);

/** Raised when a removal would take a stock level below zero. */
export class InsufficientStockError extends AppError {
  readonly available: number;
  readonly requested: number;

  constructor(available: number, requested: number, unitLabel = 'units') {
    super(
      'INSUFFICIENT_STOCK',
      `Insufficient stock. Only ${available} ${unitLabel} are currently available.`,
      { available, requested },
    );
    this.name = 'InsufficientStockError';
    this.available = available;
    this.requested = requested;
  }
}
