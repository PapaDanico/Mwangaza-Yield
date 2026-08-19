'use client';

import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { downloadICS, type CalendarEvent } from '@/lib/ics';
import { formatKES } from '@/lib/financial-engine';
import type { PortfolioPaymentEvent } from '@/lib/portfolioCashFlows';

type CalendarMode = 'month' | 'year';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function monthLabel(date: Date) {
  return date.toLocaleString('en-KE', { month: 'long', year: 'numeric' });
}

function amountTone(amount: number, max: number): string {
  if (amount <= 0 || max <= 0) return 'bg-sand-100 text-ink-faint';
  const ratio = amount / max;
  if (ratio < 0.25) return 'bg-gold-100 text-gold-900';
  if (ratio < 0.5) return 'bg-gold-300 text-ink';
  if (ratio < 0.75) return 'bg-mint-300 text-ink';
  return 'bg-mint-700 text-sand-50';
}

function toICS(events: PortfolioPaymentEvent[]): CalendarEvent[] {
  return events.map((event) => ({
    date: event.paymentDate,
    title: `${event.issueCode} ${event.kind === 'maturity' ? 'payment + maturity' : 'coupon'}`,
    description:
      `${formatKES(event.totalAmountKES)} due on ${event.paymentDate}. `
      + `${event.issueCode} · remaining balance ${formatKES(event.remainingBalanceKES)}.`,
  }));
}

export default function CouponCalendarHeatmap({ events }: { events: PortfolioPaymentEvent[] }) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, PortfolioPaymentEvent[]>();
    for (const event of events) {
      const existing = map.get(event.paymentDate) ?? [];
      existing.push(event);
      map.set(event.paymentDate, existing);
    }
    return map;
  }, [events]);

  const visibleDates = useMemo(() => {
    if (mode === 'month') {
      const month = anchor.getMonth();
      const year = anchor.getFullYear();
      return Array.from(eventsByDate.keys()).filter((date) => {
        const d = new Date(`${date}T00:00:00Z`);
        return d.getUTCFullYear() === year && d.getUTCMonth() === month;
      });
    }
    const year = anchor.getFullYear();
    return Array.from(eventsByDate.keys()).filter((date) => date.startsWith(`${year}-`));
  }, [anchor, eventsByDate, mode]);

  const visibleEvents = useMemo(
    () => visibleDates.flatMap((date) => eventsByDate.get(date) ?? []),
    [eventsByDate, visibleDates],
  );

  const maxAmount = useMemo(
    () => Math.max(...visibleDates.map((date) => (eventsByDate.get(date) ?? []).reduce((sum, event) => sum + event.totalAmountKES, 0)), 0),
    [eventsByDate, visibleDates],
  );

  const hoveredEvents = hoveredDate ? eventsByDate.get(hoveredDate) ?? [] : [];

  function move(step: number) {
    setAnchor((current) => new Date(current.getFullYear(), current.getMonth() + (mode === 'month' ? step : step * 12), 1));
  }

  function toggleDateSelection(date: string) {
    if (!eventsByDate.has(date)) return;
    setSelectedDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function exportCalendar() {
    const chosenDates = selectedDates.size ? [...selectedDates] : visibleDates;
    const chosenEvents = chosenDates.flatMap((date) => eventsByDate.get(date) ?? []);
    if (!chosenEvents.length) return;
    downloadICS(toICS(chosenEvents), 'mwangaza-coupon-calendar.ics', 'Mwangaza Yield — Coupon Calendar');
  }

  function renderMonth(monthDate: Date, compact = false) {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({ length: 42 }, (_, index) => {
      const dayNumber = index - firstWeekday + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) return null;
      const date = new Date(year, month, dayNumber);
      const iso = date.toISOString().slice(0, 10);
      const dayEvents = eventsByDate.get(iso) ?? [];
      const total = dayEvents.reduce((sum, event) => sum + event.totalAmountKES, 0);
      const selected = selectedDates.has(iso);
      return {
        date: iso,
        dayNumber,
        total,
        hasEvents: dayEvents.length > 0,
        selected,
      };
    });

    return (
      <div className={`rounded-2xl border border-sand-300 bg-sand-50 p-3 ${compact ? '' : 'space-y-3'}`}>
        <div className="flex items-center justify-between">
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-ink`}>{monthLabel(monthDate)}</h3>
          {!compact && (
            <button
              onClick={exportCalendar}
              className="inline-flex items-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-xs font-semibold text-sand-50 hover:bg-ink-soft"
            >
              <CalendarPlus size={14} /> Export to device calendar
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-ink-faint">
          {WEEKDAYS.map((day) => <div key={day}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, index) => {
            if (!cell) return <div key={index} className="aspect-square rounded-lg bg-transparent" />;
            return (
              <button
                key={cell.date}
                onClick={() => toggleDateSelection(cell.date)}
                onMouseEnter={() => setHoveredDate(cell.hasEvents ? cell.date : null)}
                onMouseLeave={() => setHoveredDate((current) => (current === cell.date ? null : current))}
                className={`aspect-square rounded-lg border text-center ${
                  cell.selected ? 'border-ink ring-1 ring-ink' : 'border-transparent'
                } ${amountTone(cell.total, maxAmount)} ${compact ? 'text-[10px]' : 'text-xs font-medium'}`}
                aria-label={`${cell.date}${cell.hasEvents ? `, ${formatKES(cell.total)} scheduled` : ''}`}
              >
                {cell.dayNumber}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">Coupon Calendar Heatmap</h2>
          <p className="text-xs text-ink-muted">
            Click highlighted days to select payments for export. If none are selected, export uses the visible view.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-sand-300 bg-sand-50 p-1">
            {(['month', 'year'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  mode === value ? 'bg-ink text-sand-50' : 'text-ink-soft'
                }`}
              >
                {value === 'month' ? 'Month view' : 'Year view'}
              </button>
            ))}
          </div>
          <button onClick={() => move(-1)} className="rounded-xl border border-sand-400 px-3 py-2 text-sm text-ink-soft">Back</button>
          <button onClick={() => move(1)} className="rounded-xl border border-sand-400 px-3 py-2 text-sm text-ink-soft">Next</button>
        </div>
      </div>

      {mode === 'month' ? (
        renderMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1))
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {Array.from({ length: 12 }, (_, index) => renderMonth(new Date(anchor.getFullYear(), index, 1), true))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        <span className="rounded-full bg-gold-100 px-2.5 py-1 text-gold-900">Smaller inflow</span>
        <span className="rounded-full bg-gold-300 px-2.5 py-1 text-ink">Moderate</span>
        <span className="rounded-full bg-mint-300 px-2.5 py-1 text-ink">High</span>
        <span className="rounded-full bg-mint-700 px-2.5 py-1 text-sand-50">Largest inflow</span>
      </div>

      <div className="rounded-2xl border border-sand-300 bg-sand-50 p-4 text-sm text-ink-soft">
        {hoveredEvents.length > 0 ? (
          <div className="space-y-2">
            <p className="font-semibold text-ink">{hoveredDate}</p>
            {hoveredEvents.map((event) => (
              <div key={event.id}>
                <p className="font-medium text-ink">
                  {event.issueCode} · {formatKES(event.totalAmountKES)}
                </p>
                <p className="text-xs text-ink-muted">
                  {event.kind === 'maturity' ? 'Final coupon + principal' : 'Coupon payment'} · remaining balance {formatKES(event.remainingBalanceKES)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p>Hover a highlighted day to see which bonds pay, how much, and what balance remains after that payment.</p>
        )}
      </div>
    </div>
  );
}
