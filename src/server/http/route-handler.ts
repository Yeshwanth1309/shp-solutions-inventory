import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { CSRF_HEADER, readCsrfCookie } from './session-cookie';
import { constantTimeEquals } from '@/server/auth/crypto';

/**
 * Wraps a route handler with request logging, CSRF enforcement and error
 * translation.
 *
 * Only AppError messages reach the client. Anything else becomes a generic 500
 * with a request id the user can quote, while the real cause goes to the log.
 */

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Login is exempt from the CSRF check by necessity: on a fresh browser there
 * is no session yet and therefore no CSRF cookie to echo back — requiring one
 * here would make it impossible to ever sign in. This is the standard
 * double-submit caveat, not a gap: CSRF exists to stop a third-party site from
 * driving an action inside the victim's *existing* session, and before login
 * there is no session to act on. The login response itself issues the CSRF
 * cookie (see /api/auth/login), so every mutating request that follows —
 * including the very next one, MFA verification — is protected as normal.
 * The session cookie's SameSite=Lax setting independently blocks a
 * cross-site POST from authenticating as the attacker's account (login CSRF).
 */
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/login']);

async function assertCsrf(request: NextRequest): Promise<void> {
  if (!MUTATING.has(request.method)) return;
  if (CSRF_EXEMPT_PATHS.has(new URL(request.url).pathname)) return;

  const header = request.headers.get(CSRF_HEADER);
  const cookie = await readCsrfCookie();
  if (!header || !cookie || !constantTimeEquals(header, cookie)) {
    throw new AppError('FORBIDDEN', 'Your session could not be verified. Refresh the page and try again.');
  }
}

type Handler<Context> = (request: NextRequest, context: Context) => Promise<Response> | Response;

export function withRoute<Context>(handler: Handler<Context>): Handler<Context> {
  return async (request, context) => {
    const requestId = request.headers.get('x-request-id') ?? randomUUID();
    const startedAt = Date.now();
    const route = new URL(request.url).pathname;

    try {
      await assertCsrf(request);
      const response = await handler(request, context);
      response.headers.set('x-request-id', requestId);
      logger.info('request.completed', {
        requestId,
        route,
        method: request.method,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('request.validation_failed', { requestId, route, method: request.method, status: 422 });
        return json<ApiErrorBody>(
          {
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Some fields need attention.',
              details: error.flatten().fieldErrors,
              requestId,
            },
          },
          422,
          requestId,
        );
      }

      if (error instanceof AppError) {
        logger.warn('request.failed', {
          requestId,
          route,
          method: request.method,
          status: error.status,
          event: error.code,
          durationMs: Date.now() - startedAt,
        });
        return json<ApiErrorBody>(
          { error: { code: error.code, message: error.message, details: error.details, requestId } },
          error.status,
          requestId,
        );
      }

      logger.error('request.unhandled_error', {
        requestId,
        route,
        method: request.method,
        status: 500,
        error: error instanceof Error ? error.message : 'unknown',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return json<ApiErrorBody>(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Something went wrong at our end. Try again, or quote this reference to support.',
            requestId,
          },
        },
        500,
        requestId,
      );
    }
  };
}

function json<T>(body: T, status: number, requestId: string): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set('x-request-id', requestId);
  return response;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

/** Parses a URLSearchParams object into a plain record for Zod. */
export function searchParamsToObject(url: string): Record<string, string> {
  return Object.fromEntries(new URL(url).searchParams.entries());
}
