import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ready — readiness: can this instance actually serve traffic?
 * Checks the database round-trip. Returns 503 (not 200) when it cannot, so a
 * load balancer or orchestrator takes the instance out of rotation.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: 'ready', timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'not_ready', timestamp: new Date().toISOString() }, { status: 503 });
  }
}
