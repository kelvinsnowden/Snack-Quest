'use client';

import { useState } from 'react';
import { CalendarCheck, CalendarDays, Handshake, Tag, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MEETING_FIRST_DATE, MEETING_LAST_DATE, type MeetingDay } from '@/lib/leads/meetingSlots';
import { longDate, MeetingCalendar } from '@/components/marketing/leads/MeetingCalendar';
import { ORDER_MEETING_MODES, type OrderMeetingMode } from '@/types/vendingOrderMeeting';

const TZ = 'Africa/Nairobi';

/** The founding-orders offer this page books meetings for — change here if the offer changes. */
const FOUNDING_PRICE = 'KSh 360,000';
const FOUNDING_ORDERS = 10;
const DELIVERY_DAYS = 60;

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

/** "1–30 November", or "28 November – 4 December" across two months. */
function meetingWindowLabel(): string {
  const label = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (MEETING_FIRST_DATE.slice(0, 7) === MEETING_LAST_DATE.slice(0, 7)) {
    return `${Number(MEETING_FIRST_DATE.slice(8))}–${label(MEETING_LAST_DATE)}`;
  }
  return `${label(MEETING_FIRST_DATE)} – ${label(MEETING_LAST_DATE)}`;
}

export function MeetingBooking({ days }: { days: MeetingDay[] }) {
  const [mode, setMode] = useState<OrderMeetingMode>('in_person');
  const [selectedDate, setSelectedDate] = useState<string | null>(days.find((day) => !day.booked)?.date ?? null);
  const [slot, setSlot] = useState<number | null>(null);
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<number | null>(null);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (slot === null) {
      setError('Pick a day and a time first.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/leads/meeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, whatsapp, email, location, mode, atMs: slot }),
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

  if (booked !== null) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="bg-success/10 text-success flex size-14 items-center justify-center rounded-full">
          <CalendarCheck className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">You&rsquo;re booked</h1>
        <p className="text-muted-foreground max-w-md text-pretty text-base">
          We&rsquo;ll meet on <span className="text-foreground font-medium">{fullLabel(booked)}</span>
          {mode === 'in_person' ? ', in person' : ', by video call'}. We&rsquo;ll message you on WhatsApp to confirm{' '}
          {mode === 'in_person' ? 'where we’ll meet' : 'the call link'}.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setBooked(null);
            setSlot(null);
          }}
        >
          Change the day
        </Button>
      </div>
    );
  }

  const day = days.find((entry) => entry.date === selectedDate && !entry.booked) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 text-center">
        <span className="bg-primary/10 text-primary mx-auto flex size-14 items-center justify-center rounded-full">
          <Handshake className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">Book your order meeting</h1>
        <p className="text-muted-foreground text-pretty text-base">
          Pick the day you&rsquo;ll be ready to meet us and place your machine order. Meetings take about an hour.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3">
        <li className="border-border flex items-start gap-2.5 rounded-xl border p-3 text-sm">
          <Tag className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="text-foreground font-semibold">{FOUNDING_PRICE}</span>
            <span className="text-muted-foreground"> per machine for the first {FOUNDING_ORDERS} orders</span>
          </span>
        </li>
        <li className="border-border flex items-start gap-2.5 rounded-xl border p-3 text-sm">
          <Truck className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="text-muted-foreground">
            About <span className="text-foreground font-semibold">{DELIVERY_DAYS} days</span> from order to delivery in Kenya
          </span>
        </li>
        <li className="border-border flex items-start gap-2.5 rounded-xl border p-3 text-sm">
          <CalendarDays className="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="text-muted-foreground">
            Weekday meetings, <span className="text-foreground font-semibold whitespace-nowrap">{meetingWindowLabel()}</span>
          </span>
        </li>
      </ul>

      {days.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground text-sm">No meeting times are open right now. Please message us on WhatsApp instead.</p>
        </Card>
      ) : (
        <Card className="p-4 sm:p-6">
          <form onSubmit={confirm} className="flex flex-col gap-5">
            <fieldset className="flex min-w-0 flex-col gap-2">
              <legend className="text-foreground mb-2 text-sm font-medium">How would you like to meet?</legend>
              <div className="grid grid-cols-2 gap-2">
                {ORDER_MEETING_MODES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={mode === option.value}
                    onClick={() => setMode(option.value)}
                    className={cn(
                      'min-h-11 rounded-lg border px-3 text-sm font-medium transition-colors',
                      mode === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-foreground hover:bg-border/30',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="text-foreground mb-2 text-sm font-medium">Day and time (Nairobi time)</legend>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start">
                <MeetingCalendar
                  days={days}
                  selected={selectedDate}
                  onSelect={(date) => {
                    setSelectedDate(date);
                    setSlot(null);
                  }}
                />
                <div className="flex min-w-0 flex-col gap-2">
                  <p className="text-muted-foreground text-sm">
                    {day ? `Times on ${longDate(day.date)}` : 'Pick a day to see the times.'}
                  </p>
                  {day ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
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
                  ) : null}
                </div>
              </div>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meet-name">Your name</Label>
                <Input
                  id="meet-name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meet-whatsapp">Your WhatsApp number</Label>
                <Input
                  id="meet-whatsapp"
                  inputMode="tel"
                  autoComplete="tel"
                  value={whatsapp}
                  onChange={(event) => setWhatsapp(event.target.value)}
                  placeholder="07XX XXX XXX"
                  required
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meet-location">Where would the machine go?</Label>
              <Input
                id="meet-location"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="e.g. Student hostel in Madaraka, Nairobi"
                maxLength={200}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meet-email">Email (optional, for a confirmation)</Label>
              <Input
                id="meet-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            {error ? (
              <p role="alert" className="text-danger text-sm">
                {error}
              </p>
            ) : null}

            <Button type="submit" loading={saving}>
              {slot === null ? 'Book your meeting' : `Book ${fullLabel(slot)}`}
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
