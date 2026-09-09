'use client';

import * as React from 'react';
import { Plus, Warehouse } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost, apiPatch, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface LocationRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export default function LocationsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const [locations, setLocations] = React.useState<LocationRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<LocationRow | null>(null);
  const [form, setForm] = React.useState({ code: '', name: '', address: '', isDefault: false, isActive: true });
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ locations: LocationRow[] }>('/api/locations')
      .then((data) => setLocations(data.locations))
      .catch(() => push({ title: 'Could not load locations. Check your connection and try again.', variant: 'error' }));
  }, [push]);
  React.useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({ code: '', name: '', address: '', isDefault: false, isActive: true });
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(loc: LocationRow) {
    setEditing(loc);
    setForm({ code: loc.code, name: loc.name, address: loc.address ?? '', isDefault: loc.isDefault, isActive: loc.isActive });
    setError(null);
    setDialogOpen(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        await apiPatch(`/api/locations/${editing.id}`, form);
        push({ title: 'Location updated.', variant: 'success' });
      } else {
        await apiPost('/api/locations', { ...form, isActive: true });
        push({ title: 'Location added.', variant: 'success' });
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
        {can(PERMISSIONS.LOCATION_MANAGE) && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Add location
          </Button>
        )}
      </div>

      {locations && locations.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Warehouse className="h-8 w-8" aria-hidden />
          <p className="text-sm">No locations yet. Add one to start recording stock.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {locations?.map((loc) => (
          <Card key={loc.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{loc.name}</p>
                  <p className="text-sm text-muted-foreground">{loc.code}{loc.address ? ` · ${loc.address}` : ''}</p>
                </div>
                <div className="flex gap-1">
                  {loc.isDefault && <Badge>Default</Badge>}
                  {!loc.isActive && <Badge variant="destructive">Inactive</Badge>}
                </div>
              </div>
              {can(PERMISSIONS.LOCATION_MANAGE) && (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => openEdit(loc)}>Edit</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? 'Edit location' : 'Add location'}</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="l-code">Code</Label>
                <Input id="l-code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="l-name">Name</Label>
                <Input id="l-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="l-address">Address</Label>
              <Input id="l-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Make this the default location
            </label>
            {editing && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
            )}
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>{editing ? 'Save changes' : 'Add location'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}