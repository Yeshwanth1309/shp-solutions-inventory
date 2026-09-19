'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { apiGet } from '@/lib/api-client';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
}

/**
 * Tag input for the product form's "Compatible with" field, with live
 * search-as-you-type suggestions pulled from printer models already used
 * elsewhere (GET /api/products/compatibility-suggestions).
 *
 * This exists to keep model naming consistent — the dashboard's "Printer
 * Models & Their Stock" panel groups by exact string match, so "Canon
 * G3010" and "Canon PIXMA G3010" would silently become two different rows
 * for what's really one printer. Picking from a suggestion guarantees the
 * spelling matches whatever's already in use.
 *
 * Typing a model that doesn't match anything existing is still allowed —
 * press Enter or comma to add it as-is. The very first product to use a
 * brand-new model has nothing to suggest from yet, and that's fine.
 */
export function CompatibilityInput({ value, onChange, id }: Props) {
  const [term, setTerm] = React.useState('');
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [open, setOpen] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const debouncedTerm = useDebouncedValue(term, 200);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!debouncedTerm.trim()) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    apiGet<{ models: string[] }>(`/api/products/compatibility-suggestions?q=${encodeURIComponent(debouncedTerm)}`)
      .then((data) => {
        if (!cancelled) setSuggestions(data.models.filter((m) => !value.includes(m)));
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, value]);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function addModel(model: string) {
    const trimmed = model.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setTerm('');
    setSuggestions([]);
    setOpen(false);
    setHighlighted(0);
  }

  function removeModel(model: string) {
    onChange(value.filter((m) => m !== model));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && term.trim()) {
      e.preventDefault();
      addModel(open && suggestions[highlighted] ? suggestions[highlighted]! : term);
    } else if (e.key === 'Backspace' && !term && value.length > 0) {
      removeModel(value[value.length - 1]!);
    } else if (e.key === 'ArrowDown' && suggestions.length > 0) {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length > 0) {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring">
        {value.map((model) => (
          <span
            key={model}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-xs font-medium"
          >
            {model}
            <button
              type="button"
              onClick={() => removeModel(model)}
              aria-label={`Remove ${model}`}
              className="rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
            setHighlighted(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={value.length === 0 ? 'Type a printer model…' : ''}
          className="min-w-[10ch] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((model, i) => (
            <li key={model}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => addModel(model)}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-sm hover:bg-accent',
                  i === highlighted && 'bg-accent',
                )}
              >
                {model}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}