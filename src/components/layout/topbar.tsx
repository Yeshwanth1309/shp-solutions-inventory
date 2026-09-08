'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

interface QuickResult {
  id: string;
  sku: string;
  name: string;
  minimumStock: number;
  stock: number;
}

/**
 * Prominent, always-visible search — the fastest path from "open the app" to
 * "see this product's stock", which is the whole point of the tool.
 */
export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const [term, setTerm] = React.useState('');
  const [results, setResults] = React.useState<QuickResult[]>([]);
  const [open, setOpen] = React.useState(false);
  const debounced = useDebouncedValue(term, 250);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!debounced.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    apiGet<{ results: QuickResult[] }>(`/api/products/search?q=${encodeURIComponent(debounced)}`).then((data) => {
      if (!cancelled) setResults(data.results);
    });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  React.useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-background/95 px-4 backdrop-blur">
      <h1 className="hidden shrink-0 text-sm font-semibold sm:block">{title}</h1>
      <div ref={containerRef} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="quick-search-results"
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search by name, SKU, barcode or part number"
          className="h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {open && results.length > 0 && (
          <ul
            id="quick-search-results"
            role="listbox"
            className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md"
          >
            {results.map((result) => (
              <li key={result.id} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setOpen(false);
                    setTerm('');
                    router.push(`/products/${result.id}`);
                  }}
                >
                  <span className="truncate">
                    <span className="font-medium">{result.name}</span>{' '}
                    <span className="text-muted-foreground">{result.sku}</span>
                  </span>
                  <span
                    className={
                      result.stock <= 0
                        ? 'shrink-0 text-xs font-medium text-destructive'
                        : result.stock <= result.minimumStock
                          ? 'shrink-0 text-xs font-medium text-warn'
                          : 'shrink-0 text-xs font-medium text-ok'
                    }
                  >
                    {result.stock} in stock
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </header>
  );
}
