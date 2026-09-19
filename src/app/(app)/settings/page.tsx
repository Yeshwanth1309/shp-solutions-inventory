'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';

/**
 * Two-factor authentication was intentionally removed from this page.
 * Login (see src/app/api/auth/login/route.ts) no longer gates on MFA at
 * all, so an enrolment UI here would be actively misleading — someone
 * could "turn it on" and see recovery codes, but it would never actually
 * be enforced at sign-in. Simple username + password only.
 */
export default function SettingsPage() {
  const searchParams = useSearchParams();
  const forcePasswordChange = searchParams.get('forcePasswordChange') === '1';
  const { refresh } = useSession();
  const { push } = useToast();

  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [changingPassword, setChangingPassword] = React.useState(false);

  async function onChangePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(null);
    setChangingPassword(true);
    try {
      await apiPost('/api/auth/password', { currentPassword, newPassword, confirmPassword });
      push({ title: 'Password changed. You have been kept signed in here.', variant: 'success' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      refresh();
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="grid max-w-lg gap-4">
      {forcePasswordChange && (
        <p role="alert" className="rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">
          Please set a new password to continue.
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={onChangePassword} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              <p className="text-xs text-muted-foreground">At least 12 characters, with upper, lower and a number.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            </div>
            {passwordError && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{passwordError}</p>}
            <Button type="submit" disabled={changingPassword} className="w-fit gap-2">
              <KeyRound className="h-4 w-4" aria-hidden /> Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
