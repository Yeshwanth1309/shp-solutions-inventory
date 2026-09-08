'use client';

import * as React from 'react';
import { Plus, LogOutIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';
import { formatDateTime } from '@/lib/utils';

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  roleKey: 'ADMIN' | 'INVENTORY_MANAGER' | 'STAFF';
  roleName: string;
}

const ROLES: Array<{ value: UserRow['roleKey']; label: string }> = [
  { value: 'ADMIN', label: 'Administrator' },
  { value: 'INVENTORY_MANAGER', label: 'Inventory manager' },
  { value: 'STAFF', label: 'Staff' },
];

export default function UsersPage() {
  const { session } = useSession();
  const { push } = useToast();
  const [users, setUsers] = React.useState<UserRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [form, setForm] = React.useState({ email: '', name: '', password: '', roleKey: 'STAFF' as UserRow['roleKey'] });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ users: UserRow[] }>('/api/users').then((data) => setUsers(data.users));
  }, []);
  React.useEffect(() => { load(); }, [load]);

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/api/users', { ...form, mustChangePassword: true });
      push({ title: `Account created for ${form.email}.`, variant: 'success' });
      setDialogOpen(false);
      setForm({ email: '', name: '', password: '', roleKey: 'STAFF' });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(user: UserRow) {
    try {
      await apiPatch(`/api/users/${user.id}`, { isActive: !user.isActive });
      push({ title: user.isActive ? `Disabled ${user.email}.` : `Enabled ${user.email}.`, variant: 'success' });
      load();
    } catch (err) {
      push({ title: err instanceof ApiError ? err.message : 'Could not update that account.', variant: 'error' });
    }
  }

  async function changeRole(user: UserRow, roleKey: UserRow['roleKey']) {
    try {
      await apiPatch(`/api/users/${user.id}`, { roleKey });
      push({ title: `Updated role for ${user.email}.`, variant: 'success' });
      load();
    } catch (err) {
      push({ title: err instanceof ApiError ? err.message : 'Could not update that account.', variant: 'error' });
    }
  }

  async function revokeSessions(user: UserRow) {
    try {
      await apiDelete(`/api/users/${user.id}/sessions`);
      push({ title: `Signed ${user.email} out everywhere.`, variant: 'success' });
    } catch (err) {
      push({ title: err instanceof ApiError ? err.message : 'Could not revoke sessions.', variant: 'error' });
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden /> Add user
        </Button>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-secondary/40 text-left text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Email</th>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">2FA</th>
              <th className="px-4 py-2.5">Last sign-in</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users?.map((user) => (
              <tr key={user.id} className="hover:bg-accent/40">
                <td className="px-4 py-2.5 font-medium">{user.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.email}</td>
                <td className="px-4 py-2.5">
                  <Select value={user.roleKey} onValueChange={(v) => changeRole(user, v as UserRow['roleKey'])} disabled={user.id === session?.user?.id}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={user.mfaEnabled ? 'ok' : 'default'}>{user.mfaEnabled ? 'On' : 'Off'}</Badge>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}</td>
                <td className="px-4 py-2.5">
                  <Badge variant={user.isActive ? 'ok' : 'destructive'}>{user.isActive ? 'Active' : 'Disabled'}</Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => revokeSessions(user)} aria-label={`Sign ${user.email} out everywhere`}>
                      <LogOutIcon className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={user.id === session?.user?.id}
                      onClick={() => toggleActive(user)}
                    >
                      {user.isActive ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add user</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={onCreate} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="u-name">Name</Label>
              <Input id="u-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-email">Email</Label>
              <Input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-password">Temporary password</Label>
              <Input id="u-password" type="text" required minLength={12} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="text-xs text-muted-foreground">At least 12 characters, with upper, lower and a number. They&apos;ll be asked to change it on first sign-in.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="u-role">Role</Label>
              <Select value={form.roleKey} onValueChange={(v) => setForm({ ...form, roleKey: v as UserRow['roleKey'] })}>
                <SelectTrigger id="u-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>Create account</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
