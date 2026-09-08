import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/health — liveness only: is the process up and answering HTTP?
 * Deliberately does not touch the database; that is /api/ready. Exposes no
 * internal detail beyond a timestamp.
 */
export function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() });
}
