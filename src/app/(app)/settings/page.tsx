'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ShieldCheck, ShieldOff, KeyRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const forcePasswordChange = searchParams.get('forcePasswordChange') === '1';
  const { session, refresh } = useSession();
  const { push } = useToast();

  // Password change
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [changingPassword, setChangingPassword] = React.useState(false);

  // MFA enrolment
  const [enrolling, setEnrolling] = React.useState(false);
  const [enrolment, setEnrolment] = React.useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [confirmCode, setConfirmCode] = React.useState('');
  const [recoveryCodes, setRecoveryCodes] = React.useState<string[] | null>(null);
  const [mfaError, setMfaError] = React.useState<string | null>(null);

  // MFA removal
  const [removingMfa, setRemovingMfa] = React.useState(false);
  const [removePassword, setRemovePassword] = React.useState('');
  const [removeError, setRemoveError] = React.useState<string | null>(null);

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

  async function startEnrolment() {
    setMfaError(null);
    setEnrolling(true);
    try {
      const result = await apiPost<{ qrDataUrl: string; secret: string }>('/api/auth/mfa/enroll');
      setEnrolment(result);
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setEnrolling(false);
    }
  }

  async function confirmEnrolment(event: React.FormEvent) {
    event.preventDefault();
    setMfaError(null);
    try {
      const result = await apiPost<{ recoveryCodes: string[] }>('/api/auth/mfa/confirm', { code: confirmCode });
      setRecoveryCodes(result.recoveryCodes);
      refresh();
    } catch (err) {
      setMfaError(err instanceof ApiError ? err.message : 'That code did not match.');
    }
  }

  async function onRemoveMfa(event: React.FormEvent) {
    event.preventDefault();
    setRemoveError(null);
    try {
      await apiPost('/api/auth/mfa/remove', { currentPassword: removePassword });
      push({ title: 'Two-factor authentication removed.', variant: 'success' });
      setRemovingMfa(false);
      setRemovePassword('');
      refresh();
    } catch (err) {
      setRemoveError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
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

      <Card>
        <CardHeader><CardTitle>Two-factor authentication</CardTitle></CardHeader>
        <CardContent>
          {session?.user?.mfaEnabled ? (
            <div className="grid gap-3">
              <p className="flex items-center gap-2 text-sm text-ok"><ShieldCheck className="h-4 w-4" aria-hidden /> Enabled on this account</p>
              {!removingMfa ? (
                <Button variant="outline" size="sm" className="w-fit" onClick={() => setRemovingMfa(true)}>Turn off</Button>
              ) : (
                <form className="grid gap-2" onSubmit={onRemoveMfa}>
                  <Label htmlFor="remove-password">Confirm your password to turn off two-factor authentication</Label>
                  <Input id="remove-password" type="password" required value={removePassword} onChange={(e) => setRemovePassword(e.target.value)} />
                  {removeError && <p role="alert" className="text-sm text-destructive">{removeError}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" variant="destructive" size="sm">Turn off</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setRemovingMfa(false)}>Cancel</Button>
                  </div>
                </form>
              )}
            </div>
          ) : recoveryCodes ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium text-ok">Two-factor authentication is now on.</p>
              <p className="text-sm text-muted-foreground">Save these recovery codes somewhere safe. Each one works once, and this is the only time they&apos;ll be shown.</p>
              <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-3 font-mono text-sm">
                {recoveryCodes.map((code) => <span key={code}>{code}</span>)}
              </div>
            </div>
          ) : enrolment ? (
            <form className="grid gap-3" onSubmit={confirmEnrolment}>
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><ShieldOff className="h-4 w-4" aria-hidden /> Scan this with your authenticator app</p>
              <Image src={enrolment.qrDataUrl} alt="Scan this QR code with your authenticator app" width={180} height={180} className="rounded-md border border-border" unoptimized />
              <p className="text-xs text-muted-foreground">Can&apos;t scan? Enter this key manually: <span className="font-mono">{enrolment.secret}</span></p>
              <div className="grid gap-1.5">
                <Label htmlFor="confirm-code">Enter the 6-digit code to confirm</Label>
                <Input id="confirm-code" inputMode="numeric" required value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} />
              </div>
              {mfaError && <p role="alert" className="text-sm text-destructive">{mfaError}</p>}
              <Button type="submit" className="w-fit">Confirm and enable</Button>
            </form>
          ) : (
            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">Add a second step at sign-in using an authenticator app.</p>
              <Button size="sm" className="w-fit" disabled={enrolling} onClick={startEnrolment}>Set up two-factor authentication</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
