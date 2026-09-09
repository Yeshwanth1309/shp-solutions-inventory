'use client';

import * as React from 'react';
import { ShieldAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, humanise } from '@/lib/utils';

interface AuditRow {
  id: string;
  action: string;
  actorId: string | null;
  actorEmail: string | null;
  entityType: string | null;
  entityId: string | null;
  summary: string;
  createdAt: string;
}

const ACTIONS = [
  'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'SESSION_REVOKED',
  'MFA_ENROLLED', 'MFA_REMOVED', 'MFA_RECOVERY_USED', 'PASSWORD_CHANGED',
  'USER_CREATED', 'USER_UPDATED', 'USER_DISABLED', 'USER_ENABLED', 'ROLE_CHANGED',
  'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DEACTIVATED',
  'STOCK_ADDED', 'STOCK_REMOVED', 'STOCK_ADJUSTED',
  'SUPPLIER_CREATED', 'SUPPLIER_UPDATED', 'LOCATION_CREATED', 'LOCATION_UPDATED',
  'SETTINGS_CHANGED',
];

const PAGE_SIZE = 50;

export default function AuditPage() {
  const { push } = useToast();
  const [action, setAction] = React.useState('ALL');
  const [page, setPage] = React.useState(1);
  const [logs, setLogs] = React.useState<AuditRow[] | null>(null);

  const load = React.useCallback(() => {
    const params = new URLSearchParams();
    if (action !== 'ALL') params.set('action', action);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    apiGet<{ logs: AuditRow[] }>(`/api/audit?${params.toString()}`)
      .then((data) => setLogs(data.logs))
      .catch(() => push({ title: 'Could not load the audit log. Check your connection and try again.', variant: 'error' }));
  }, [action, page, push]);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    setPage(1);
  }, [action]);

  const hasNextPage = (logs?.length ?? 0) === PAGE_SIZE;

  return (
    <div className="grid gap-4">
      <Select value={action} onValueChange={setAction}>
        <SelectTrigger className="w-56"><SelectValue placeholder="All actions" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All actions</SelectItem>
          {ACTIONS.map((a) => (
            <SelectItem key={a} value={a}>{humanise(a)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {logs && logs.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShieldAlert className="h-8 w-8" aria-hidden />
          <p className="text-sm">No audit events found.</p>
        </div>
      )}

      {logs && logs.length > 0 && (
        <>
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((row) => (
                  <tr key={row.id} className="hover:bg-accent/40">
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{formatDateTime(row.createdAt)}</td>
                    <td className="px-4 py-2.5 font-medium">{humanise(row.action)}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.actorEmail ?? 'System'}</td>
                    <td className="px-4 py-2.5">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-2 md:hidden">
            {logs.map((row) => (
              <Card key={row.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{humanise(row.action)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">{row.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.actorEmail ?? 'System'}</p>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </Button>
              <Button size="icon" variant="outline" disabled={!hasNextPage} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}