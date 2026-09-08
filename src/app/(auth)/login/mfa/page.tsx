'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { apiPost, ApiError } from '@/lib/api-client';

export default function MfaPage() {
  const router = useRouter();
  const [code, setCode] = React.useState('');
  const [mode, setMode] = React.useState<'totp' | 'recovery'>('totp');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/api/auth/mfa/verify', { code, mode });
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-foreground">Verify it&apos;s you</CardTitle>
        <p className="text-sm text-muted-foreground">
          {mode === 'totp' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter one of your recovery codes.'}
        </p>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="code">{mode === 'totp' ? 'Authentication code' : 'Recovery code'}</Label>
            <Input
              id="code"
              inputMode={mode === 'totp' ? 'numeric' : 'text'}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={mode === 'totp' ? '123456' : 'XXXX-XXXX-XXXX'}
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={submitting || !code}>
            {submitting ? 'Verifying…' : 'Verify'}
          </Button>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => {
              setMode(mode === 'totp' ? 'recovery' : 'totp');
              setCode('');
              setError(null);
            }}
          >
            {mode === 'totp' ? 'Use a recovery code instead' : 'Use my authenticator app instead'}
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
