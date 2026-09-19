'use client';

import * as React from 'react';
import { Plus, Tags } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost, ApiError } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/use-session';
import { PERMISSIONS } from '@/lib/permissions';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  isActive: boolean;
  productCount: number;
}

/** Auto-generates a URL-safe slug from a display name, e.g. "Toners & Ink" -> "toners-ink". */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function CategoriesPage() {
  const { can } = useSession();
  const { push } = useToast();
  const [categories, setCategories] = React.useState<CategoryRow[] | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const load = React.useCallback(() => {
    apiGet<{ categories: CategoryRow[] }>('/api/categories')
      .then((data) => setCategories(data.categories))
      .catch(() => push({ title: 'Could not load categories. Check your connection and try again.', variant: 'error' }));
  }, [push]);

  React.useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setName('');
    setError(null);
    setDialogOpen(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiPost('/api/categories', { name, slug: slugify(name), isActive: true });
      push({ title: `Category "${name}" added.`, variant: 'success' });
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
            <Plus className="h-4 w-4" aria-hidden /> Add category
          </Button>
        )}
      </div>

      {categories && categories.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <Tags className="h-8 w-8" aria-hidden />
          <p className="text-sm">No categories have been added yet.</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories?.map((category) => (
          <Card key={category.id}>
            <CardContent className="p-4">
              <p className="font-medium">{category.name}</p>
              <p className="text-sm text-muted-foreground">
                {category.productCount} product{category.productCount === 1 ? '' : 's'}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add category</DialogTitle></DialogHeader>
          <form className="grid gap-3" onSubmit={onSubmit} noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="c-name">Category name</Label>
              <Input id="c-name" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Toners & Ink" />
            </div>
            {error && <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting || name.trim().length < 2}>Add category</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
