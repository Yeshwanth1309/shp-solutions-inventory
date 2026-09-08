'use client';

import * as React from 'react';
import { Plus, Truck } from 'lucide-react';
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

interface Supplier {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  productCount: number;
}

export default function SuppliersPage() {
  const { can } = useSession();
  const { push } = useToast();
  const [suppliers, setSuppliers] = React.useState<Supplier[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Supplier | null>(null);
  const [form, setForm] = React.useState({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ suppliers: Supplier[] }>('/api/suppliers').then((data) => setSuppliers(data.suppliers));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ name: '', contactPerson: '', phone: '', email: '', address: '', notes: '' });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      notes: supplier.notes ?? '',
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
        await apiPatch(`/api/suppliers/${editing.id}`, form);
        push({ title: 'Supplier updated.', variant: 'success' });
      } else {
        await apiPost('/api/suppliers', { ...form, isActive: true });
        push({ title: 'Supplier added.', variant: 'success' });
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
        {can(PERMISSIONS.SUPPLIER_MANAGE) && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Add supplier
          </Button>
        )}
      </div>

      {suppliers && suppliers.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Truck className="h-8 w-8" aria-hidden />
          <p className="text-sm">No suppliers have been added yet.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {suppliers?.map((supplier) => (
          <Card key={supplier.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{supplier.name}</p>
                  {supplier.contactPerson && <p className="text-sm text-muted-foreground">{supplier.contactPerson}</p>}
                </div>
                <Badge variant={supplier.isActive ? 'ok' : 'default'}>{supplier.isActive ? 'Active' : 'Inactive'}</Badge>
              </div>
              <div className="mt-2 grid gap-0.5 text-sm text-muted-foreground">
                {supplier.phone && <p>{supplier.phone}</p>}
                {supplier.email && <p>{supplier.email}</p>}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{supplier.productCount} product{supplier.productCount === 1 ? '' : 's'}</span>
                {can(PERMISSIONS.SUPPLIER_MANAGE) && (
                  <Button size="sm" variant="outline" onClick={() => openEdit(supplier)}>Edit</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit supplier' : 'Add supplier'}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="s-name">Supplier name</Label>
              <Input id="s-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-contact">Contact person</Label>
              <Input id="s-contact" value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="s-phone">Phone</Label>
                <Input id="s-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="s-email">Email</Label>
                <Input id="s-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="s-address">Address</Label>
              <Input id="s-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>{editing ? 'Save changes' : 'Add supplier'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
