'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Scoped to everything behind the sidebar. Catches a failure in one page
 * (e.g. a bad response the page itself didn't handle) without tearing down
 * the whole app shell — you keep the sidebar and can navigate elsewhere.
 */
export default function AppSectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Section error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" aria-hidden />
      <h2 className="text-base font-semibold">This page hit a problem loading.</h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Nothing was lost. Try again, or use the sidebar to go somewhere else.
      </p>
      <Button size="sm" onClick={() => reset()}>Try again</Button>
    </div>
  );
}
