'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';
import { formatNumber } from '@/lib/utils';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface Summary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalUnits: number;
}

interface Movement {
  unitsAdded: number;
  unitsRemoved: number;
  netMovement: number;
  transactionCount: number;
  byType: Array<{ type: string; transactions: number; units: number }>;
}

export default function ReportsPage() {
  const { can } = useSession();
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [movement, setMovement] = React.useState<Movement | null>(null);
  const [exporting, setExporting] = React.useState(false);

  React.useEffect(() => {
    apiGet<Summary>('/api/reports/inventory').then(setSummary);
    apiGet<Movement>('/api/reports/movement').then(setMovement);
  }, []);

  async function exportCsv() {
    setExporting(true);
    try {
      const response = await fetch('/api/reports/inventory?format=csv', { credentials: 'same-origin' });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Inventory summary</CardTitle>
          {can(PERMISSIONS.REPORT_EXPORT) && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={exportCsv} disabled={exporting}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Export CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {summary ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ['Total products', summary.totalProducts],
                ['In stock', summary.inStock],
                ['Low stock', summary.lowStock],
                ['Out of stock', summary.outOfStock],
                ['Total units', summary.totalUnits],
              ].map(([label, value]) => (
                <div key={label as string}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-semibold tabular-nums">{formatNumber(value as number)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Stock movement (all time)</CardTitle></CardHeader>
        <CardContent>
          {movement ? (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Units added</p>
                  <p className="text-xl font-semibold tabular-nums text-ok">+{formatNumber(movement.unitsAdded)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Units removed</p>
                  <p className="text-xl font-semibold tabular-nums text-destructive">−{formatNumber(movement.unitsRemoved)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Net movement</p>
                  <p className="text-xl font-semibold tabular-nums">{movement.netMovement >= 0 ? '+' : ''}{formatNumber(movement.netMovement)}</p>
                </div>
              </div>
              <table className="mt-4 w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr><th className="py-1">Type</th><th className="py-1 text-right">Transactions</th><th className="py-1 text-right">Units</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {movement.byType.map((row) => (
                    <tr key={row.type}>
                      <td className="py-1.5">{row.type}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.transactions}</td>
                      <td className="py-1.5 text-right tabular-nums">{row.units}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
