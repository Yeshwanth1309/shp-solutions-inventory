import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db, type DbExecutor } from '@/server/db/client';
import { auditLogs } from '@/server/db/schema';
import { logger } from '@/lib/logger';

export type AuditAction = (typeof auditLogs.action.enumValues)[number];

export interface AuditEntry {
  action: AuditAction;
  actorId?: string | null;
  actorEmail?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Records a security- or business-sensitive event.
 *
 * Auditing must never break the operation it describes, so failures are logged
 * and swallowed. Pass `executor` to write inside an existing transaction — that
 * is what stock mutations do, so the ledger row and its audit entry commit or
 * roll back together.
 */
export async function recordAudit(entry: AuditEntry, executor: DbExecutor = db): Promise<void> {
  try {
    await executor.insert(auditLogs).values({
      action: entry.action,
      actorId: entry.actorId ?? null,
      actorEmail: entry.actorEmail ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      summary: entry.summary,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    });
  } catch (error) {
    logger.error('Failed to write audit log', {
      event: 'audit.write_failed',
      action: entry.action,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export interface AuditQuery {
  action?: AuditAction;
  actorId?: string;
  entityType?: string;
  entityId?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function listAuditLogs(query: AuditQuery = {}) {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 50));

  const filters: SQL[] = [];
  if (query.action) filters.push(eq(auditLogs.action, query.action));
  if (query.actorId) filters.push(eq(auditLogs.actorId, query.actorId));
  if (query.entityType) filters.push(eq(auditLogs.entityType, query.entityType));
  if (query.entityId) filters.push(eq(auditLogs.entityId, query.entityId));
  if (query.from) filters.push(gte(auditLogs.createdAt, query.from));
  if (query.to) filters.push(lte(auditLogs.createdAt, query.to));

  return db
    .select()
    .from(auditLogs)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}
