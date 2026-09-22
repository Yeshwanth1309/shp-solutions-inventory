'use client';

import * as React from 'react';
import { Plus, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface BrandRow {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
}

export default function BrandsPage() {
  const { can } = useSession();
  const { push } = useToast();
  const [brands, setBrands] = React.useState<BrandRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [editingItem, setEditingItem] = React.useState<BrandRow | null>(null);

  const load = React.useCallback(() => {
    apiGet<{ brands: BrandRow[] }>('/api/brands')
      .then((data) => setBrands(data.brands))
      .catch(() => push({ title: 'Could not load brands.', variant: 'error' }));
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditingItem(null);
    setName('');
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(brand: BrandRow) {
    setEditingItem(brand);
    setName(brand.name);
    setError(null);
    setDialogOpen(true);
  }

  async function handleDelete(id: string, brandName: string) {
    if (!window.confirm(`Are you sure you want to remove "${brandName}"?`)) return;
    
    try {
      await apiDelete(`/api/brands/${id}`);
      push({ title: `Brand "${brandName}" removed.`, variant: 'success' });
      load();
    } catch (err) {
      push({ 
        title: err instanceof ApiError ? err.message : 'Failed to remove brand.', 
        variant: 'error' 
      });
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editingItem) {
        await apiPatch(`/api/brands/${editingItem.id}`, { name });
        push({ title: `Brand "${name}" updated.`, variant: 'success' });
      } else {
        await apiPost('/api/brands', { name, isActive: true });
        push({ title: `Brand "${name}" added.`, variant: 'success' });
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
        {can(PERMISSIONS.PRODUCT_CREATE) && (
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" aria-hidden /> Add brand
          </Button>
        )}
      </div>

      {brands && brands.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Tag className="h-8 w-8" aria-hidden />
          <p className="text-sm">No brands have been added yet.</p>
        </div>
      )}

      {/* Changed to flex-col for a single-column list view */}
      <div className="flex flex-col gap-3">
        {brands?.map((brand) => (
          <Card key={brand.id}>
            {/* Changed flex layout to push text to the left and buttons to the right */}
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{brand.name}</p>
                <p className="text-sm text-muted-foreground">
                  {brand.productCount} product{brand.productCount === 1 ? '' : 's'}
                </p>
              </div>
              
              {can(PERMISSIONS.PRODUCT_CREATE) && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openEdit(brand)}
                  >
                    Edit
                  </Button>
                  <Button 
                    variant="destructive"
                    size="sm" 
                    onClick={() => handleDelete(brand.id, brand.name)}
                  >
                    Remove
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit brand' : 'Add brand'}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="b-name">Brand name</Label>
              <Input 
                id="b-name" 
                required 
                autoFocus 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="e.g. HP" 
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="submit" disabled={submitting || name.trim().length < 1}>
                {editingItem ? 'Save changes' : 'Add brand'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}