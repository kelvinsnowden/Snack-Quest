'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ImageOff, Minus, Plus, Save } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { SerializedSnackItem } from '@/lib/recipes/serialize';

export interface RecipeBuilderLine {
  snackItemId: string;
  quantity: number;
}

/**
 * Builds one box's recipe (§ Box Recipes).
 *
 * Shows the running cost to fill the box against what the box sells
 * for, live, as snacks are added. That comparison is the actual reason
 * anyone opens this screen: a recipe is not finished when it contains
 * nice snacks, it is finished when it contains nice snacks and still
 * makes money, and finding that out after a shopping trip is expensive.
 */
export function BoxRecipeBuilder({
  packageId,
  packageName,
  priceKes,
  catalogue,
  initialItems,
  initialNotes,
}: {
  packageId: string;
  packageName: string;
  priceKes: number;
  catalogue: SerializedSnackItem[];
  initialItems: RecipeBuilderLine[];
  initialNotes: string;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<RecipeBuilderLine[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const byId = useMemo(() => new Map(catalogue.map((item) => [item.id, item])), [catalogue]);

  const totalCostKes = lines.reduce(
    (total, line) => total + (byId.get(line.snackItemId)?.expectedUnitCostKes ?? 0) * line.quantity,
    0,
  );
  const marginKes = priceKes - totalCostKes;

  const available = catalogue.filter(
    (item) =>
      item.isActive &&
      !lines.some((line) => line.snackItemId === item.id) &&
      item.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function setQuantity(snackItemId: string, quantity: number) {
    setSaved(false);
    setLines((prev) =>
      quantity < 1
        ? prev.filter((line) => line.snackItemId !== snackItemId)
        : prev.map((line) => (line.snackItemId === snackItemId ? { ...line, quantity } : line)),
    );
  }

  function add(snackItemId: string) {
    setSaved(false);
    setLines((prev) => [...prev, { snackItemId, quantity: 1 }]);
    setSearch('');
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/recipes/${packageId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: lines, notes }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? 'Could not save this recipe.');
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this recipe.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <Card className="flex items-start gap-2.5 border-danger/40 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <p className="text-sm text-foreground">{error}</p>
        </Card>
      ) : null}

      <Card className="grid grid-cols-3 gap-4 p-5">
        <Stat label="Box sells for" value={priceKes} />
        <Stat label="Costs to fill" value={totalCostKes} />
        <Stat
          label="Margin"
          value={marginKes}
          tone={marginKes < 0 ? 'danger' : marginKes < priceKes * 0.3 ? 'warning' : 'good'}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <p className="text-card-title font-semibold text-foreground">In {packageName}</p>

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet. Add snacks from the catalogue below.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lines.map((line) => {
              const item = byId.get(line.snackItemId);
              return (
                <li key={line.snackItemId} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-border/30">
                    {item?.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.name} fill sizes="56px" className="object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-4" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {item?.name ?? 'Snack no longer in the catalogue'}
                    </span>
                    <span className="text-caption text-muted-foreground tabular-nums">
                      KES {((item?.expectedUnitCostKes ?? 0) * line.quantity).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setQuantity(line.snackItemId, line.quantity - 1)}>
                      <Minus className="size-4" aria-hidden="true" />
                      <span className="sr-only">One fewer</span>
                    </Button>
                    <span className="w-8 text-center font-semibold tabular-nums text-foreground">{line.quantity}</span>
                    <Button variant="outline" size="sm" onClick={() => setQuantity(line.snackItemId, line.quantity + 1)}>
                      <Plus className="size-4" aria-hidden="true" />
                      <span className="sr-only">One more</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <p className="text-card-title font-semibold text-foreground">Add a snack</p>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the catalogue…"
          className="min-h-11"
        />
        <ul className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {available.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => add(item.id)}
                className="flex w-full items-center gap-2.5 rounded-lg border border-border p-2 text-left hover:bg-border/30"
              >
                <div className="relative size-11 shrink-0 overflow-hidden rounded-md bg-border/30">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.name} fill sizes="44px" className="object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <ImageOff className="size-4" aria-hidden="true" />
                    </div>
                  )}
                </div>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
                  <span className="text-caption tabular-nums text-muted-foreground">
                    KES {item.expectedUnitCostKes.toLocaleString()}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {search ? 'Nothing matches that.' : 'Every active snack is already in this box.'}
          </p>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-2 p-5">
        <label htmlFor="recipe-notes" className="text-card-title font-semibold text-foreground">
          Packing notes
        </label>
        <Textarea
          id="recipe-notes"
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="Bubble-wrap the Ramune. Swap the KitKat flavour if matcha is out."
        />
        <p className="text-caption text-muted-foreground">Shown to whoever packs or shops for this box.</p>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} className="min-h-11">
          <Save className="size-4" aria-hidden="true" />
          Save recipe
        </Button>
        {saved ? <span className="text-sm text-success">Saved.</span> : null}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warning' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : tone === 'good' ? 'text-success' : 'text-foreground';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className={`text-xl font-bold tabular-nums ${toneClass}`}>KES {value.toLocaleString()}</span>
    </div>
  );
}
