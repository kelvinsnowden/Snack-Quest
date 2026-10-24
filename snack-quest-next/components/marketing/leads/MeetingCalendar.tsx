'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MeetingDay } from '@/lib/leads/meetingSlots';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const DAY_MS = 24 * 60 * 60 * 1000;

/** `yyyy-mm-dd` as UTC midnight. These are calendar dates, so UTC keeps the arithmetic free of time zones. */
function utc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Every cell of a month view (`yyyy-mm`), Sunday first, padded with the days either side to whole weeks. */
function monthCells(month: string): { date: string; inMonth: boolean }[] {
  const first = utc(`${month}-01`);
  const lead = new Date(first).getUTCDay();
  const [year, monthNumber] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, index) => {
    const date = isoDate(first + (index - lead) * DAY_MS);
    return { date, inMonth: date.startsWith(month) };
  });
}

function monthTitle(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function longDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-KE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/**
 * A month calendar for picking a meeting day (§ order meetings): the
 * chosen date across the top, the month with arrows to step through
 * it, and the days in a Sunday-first grid. Only days with an open time
 * can be picked. A day that already has its meeting says "Booked"; the
 * rest, and the days of the months either side, are greyed out.
 */
export function MeetingCalendar({
  days,
  selected,
  onSelect,
}: {
  days: MeetingDay[];
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const open = new Set(days.filter((day) => !day.booked).map((day) => day.date));
  const booked = new Set(days.filter((day) => day.booked).map((day) => day.date));
  const months = Array.from(new Set(days.map((day) => day.date.slice(0, 7))));
  const [monthIndex, setMonthIndex] = useState(() =>
    Math.max(0, months.indexOf((selected ?? days.find((day) => !day.booked)?.date ?? days[0]?.date ?? '').slice(0, 7))),
  );
  const month = months[Math.min(monthIndex, months.length - 1)];
  if (!month) return null;

  return (
    <div className="border-border min-w-0 overflow-hidden rounded-xl border">
      <p className="border-border text-foreground border-b px-4 py-3 text-base font-medium" aria-live="polite">
        {selected ? longDate(selected) : 'Pick a day'}
      </p>
      <div className="px-2 pb-3 pt-3 sm:px-3">
        <div className="mb-2 flex items-center justify-between gap-2 pl-2">
          <p className="text-foreground text-base font-semibold">{monthTitle(month)}</p>
          <div className="flex">
            <button
              type="button"
              aria-label="Previous month"
              disabled={monthIndex === 0}
              onClick={() => setMonthIndex((index) => index - 1)}
              className="text-muted-foreground hover:bg-border/40 flex size-9 items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronUp className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Next month"
              disabled={monthIndex >= months.length - 1}
              onClick={() => setMonthIndex((index) => index + 1)}
              className="text-muted-foreground hover:bg-border/40 flex size-9 items-center justify-center rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAYS.map((weekday) => (
            <span key={weekday} aria-hidden="true" className="text-foreground py-2 text-sm font-semibold">
              {weekday}
            </span>
          ))}
          {monthCells(month).map((cell) => {
            const day = Number(cell.date.slice(8));
            const isOpen = cell.inMonth && open.has(cell.date);
            const isSelected = cell.date === selected;
            return (
              <div key={cell.date} className="flex items-center justify-center">
                {isOpen ? (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={longDate(cell.date)}
                    onClick={() => onSelect(cell.date)}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors',
                      isSelected ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-primary/10',
                    )}
                  >
                    {day}
                  </button>
                ) : cell.inMonth && booked.has(cell.date) ? (
                  <span
                    title={`${longDate(cell.date)}: booked`}
                    className="bg-border/50 flex size-10 flex-col items-center justify-center rounded-full leading-none"
                  >
                    <span className="text-muted-foreground text-xs tabular-nums">{day}</span>
                    <span className="text-primary mt-0.5 text-[8px] font-semibold uppercase tracking-wide">Booked</span>
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-10 items-center justify-center text-sm tabular-nums',
                      cell.inMonth ? 'text-muted-foreground/70' : 'text-muted-foreground/35',
                    )}
                  >
                    {day}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
