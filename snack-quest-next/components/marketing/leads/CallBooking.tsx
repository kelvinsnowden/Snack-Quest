'use client';

import { useState } from 'react';
import { CalendarCheck, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { CallDay } from '@/lib/leads/callSlots';

const TZ = 'Africa/Nairobi';

function dayLabel(date: string): { weekday: string; day: string } {
  const at = new Date(`${date}T12:00:00+03:00`);
  return {
    weekday: at.toLocaleDateString('en-KE', { weekday: 'short', timeZone: TZ }),
    day: at.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', timeZone: TZ }),
  };
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit', timeZone: TZ });
}

function fullLabel(ms: number): string {
  return new Date(ms).toLocaleString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: TZ,
  });
}

/** `254712345678` → `0712 345 678`, the way people write their own number. */
function localNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (!/^254\d{9}$/.test(digits)) return digits;
  const local = `0${digits.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export function CallBooking({
  token,
  firstName,
  defaultWhatsapp,
  bookedAtMs,
  days,
}: {
  token: string;
  firstName: string;
  defaultWhatsapp: string;
  bookedAtMs: number | null;
  days: CallDay[];
}) {
  const [dayIndex, setDayIndex] = useState(0);
  const [slot, setSlot] = useState<number | null>(null);
  const [whatsapp, setWhatsapp] = useState(localNumber(defaultWhatsapp));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<number | null>(null);
  const [changing, setChanging] = useState(false);

  async function confirm() {
    if (slot === null) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/leads/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, atMs: slot, whatsapp }),
      });
      const data = (await response.json().catch(() => null)) as { atMs?: number; error?: string } | null;
      if (!response.ok || !data?.atMs) throw new Error(data?.error ?? 'That didn’t work. Please try again.');
      setBooked(data.atMs);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That didn’t work. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const confirmedAt = booked ?? (changing ? null : bookedAtMs);
  if (confirmedAt !== null) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="bg-success/10 text-success flex size-14 items-center justify-center rounded-full">
          <CalendarCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">You&rsquo;re booked</h1>
        <p className="text-muted-foreground max-w-md text-pretty text-base">
          We&rsquo;ll call you on WhatsApp on <span className="text-foreground font-medium">{fullLabel(confirmedAt)}</span>.
          You&rsquo;ll get a reminder on the day.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setBooked(null);
            setChanging(true);
            setSlot(null);
          }}
        >
          Change the time
        </Button>
      </div>
    );
  }

  const day = days[dayIndex];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <span className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-full">
          <MessageCircle className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
          Book a WhatsApp call, {firstName}
        </h1>
        <p className="text-muted-foreground text-pretty text-base">30 minutes with the Snack Quest team. Times are Nairobi time.</p>
      </div>

      {days.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground text-sm">No times are open right now. Please message us on WhatsApp instead.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-5 p-4 sm:p-6">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Day">
            {days.map((entry, index) => {
              const label = dayLabel(entry.date);
              return (
                <button
                  key={entry.date}
                  type="button"
                  role="tab"
                  aria-selected={index === dayIndex}
                  onClick={() => {
                    setDayIndex(index);
                    setSlot(null);
                  }}
                  className={cn(
                    'flex min-w-16 shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-sm transition-colors',
                    index === dayIndex
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:bg-border/30',
                  )}
                >
                  <span className="text-xs font-medium uppercase">{label.weekday}</span>
                  <span className="font-semibold">{label.day}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((at) => (
              <button
                key={at}
                type="button"
                aria-pressed={slot === at}
                onClick={() => setSlot(at)}
                className={cn(
                  'min-h-11 rounded-lg border text-sm font-medium tabular-nums transition-colors',
                  slot === at
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-foreground hover:bg-border/30',
                )}
              >
                {timeLabel(at)}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="whatsapp">Your WhatsApp number</Label>
            <Input
              id="whatsapp"
              inputMode="tel"
              autoComplete="tel"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="07XX XXX XXX"
            />
          </div>

          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}

          <Button type="button" onClick={confirm} disabled={slot === null} loading={saving}>
            {slot === null ? 'Pick a time' : `Book ${fullLabel(slot)}`}
          </Button>
        </Card>
      )}
    </div>
  );
}
