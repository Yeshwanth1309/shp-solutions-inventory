'use client';

import * as React from 'react';
import { Plus, Users as UsersIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  purchaseCount: number;
}

/** Sale-side counterpart to the Suppliers page — same pattern, deliberately. */
export default function CustomersPage() {
  const { can } = useSession();
  const { push } = useToast();
  const [customers, setCustomers] = React.useState<Customer[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Customer | null>(null);
  const [form, setForm] = React.useState({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '', isActive: true });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ customers: Customer[] }>('/api/customers')
      .then((data) => setCustomers(data.customers))
      .catch(() => push({ title: 'Could not load customers. Check your connection and try again.', variant: 'error' }));
  }, [push]);

  React.useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '', isActive: true });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      name: customer.name,
      contactPerson: customer.contactPerson ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
      isActive: customer.isActive,
    });
    setError(null);
    setDialogOpen(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        await apiPatch(`/api/customers/${editing.id}`, form);
        push({ title: 'Customer updated.', variant: 'success' });
      } else {
        await apiPost('/api/customers', { ...form, isActive: true });
        push({ title: 'Customer added.', variant: 'success' });
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        {can(PERMISSIONS.CUSTOMER_MANAGE) && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Add customer
          </Button>
        )}
      </div>

      {customers && customers.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <UsersIcon className="h-8 w-8" aria-hidden />
          <p className="text-sm">No customers have been added yet.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {customers?.map((customer) => (
          <Card key={customer.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{customer.name}</p>
                  {customer.contactPerson && <p className="text-sm text-muted-foreground">{customer.contactPerson}</p>}
                </div>
                <Badge variant={customer.isActive ? 'ok' : 'default'}>{customer.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-2 grid gap-0.5 text-sm text-muted-foreground">
                {customer.phone && <p>{customer.phone}</p>}
                {customer.email && <p>{customer.email}</p>}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{customer.purchaseCount} purchase{customer.purchaseCount === 1 ? '' : 's'}</span>
                {can(PERMISSIONS.CUSTOMER_MANAGE) && (
                  <Button size="sm" variant="outline" onClick={() => openEdit(customer)}>Edit</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit customer' : 'Add customer'}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Customer name</Label>
              <Input id="c-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-contact">Contact person</Label>
              <Input id="c-contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input id="c-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="c-address">Address</Label>
              <Input id="c-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
            )}
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>{editing ? 'Save changes' : 'Add customer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
