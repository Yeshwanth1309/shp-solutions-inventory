import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const CONFIG = {
  IN_STOCK: { label: 'In stock', variant: 'ok' as const, Icon: CheckCircle2 },
  LOW_STOCK: { label: 'Low stock', variant: 'warn' as const, Icon: AlertTriangle },
  OUT_OF_STOCK: { label: 'Out of stock', variant: 'destructive' as const, Icon: XCircle },
};

/** Status is always shown as an icon + word pair — never colour alone (WCAG 2.1 AA). */
export function StockStatusBadge({ status }: { status: keyof typeof CONFIG }) {
  const { label, variant, Icon } = CONFIG[status];
  return (
    <Badge variant={variant}>
      <Icon className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
}
