'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Root-level safety net. Next.js renders this instead of a crash whenever an
 * error escapes every other boundary. It should rarely fire — most failures
 * are caught and shown inline by the page that triggered them — but it's
 * what stands between a bug and a blank/broken screen for a real user.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled application error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
          <h1 className="text-lg font-semibold">Something went wrong.</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            This wasn&apos;t your fault — nothing you did was lost. Try again, or reload the page.
          </p>
          <div className="mt-2 flex gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button variant="outline" onClick={() => window.location.assign('/dashboard')}>
              Go to dashboard
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
