'use client';

import { useState } from 'react';
import { birFilingsForDate, birFilingsForMonth, type BirFiling } from '@/lib/birCalendar';
import { MONFULL, WEEKSHORT, addDaysIso, firstWeekdayOfMonth, lastDayOfMonth, pad2, shiftMonth, todayISO } from '@/lib/dates';
import ListModal from '@/components/ListModal';

function FilingRow({ f }: { f: BirFiling }) {
  return (
    <div className="cal-filing">
      <span className="cal-code">{f.code}</span>
      <div className="cal-filing-body">
        <div className="cal-label">{f.label}</div>
        <div className="cal-period">{f.periodLabel}</div>
      </div>
    </div>
  );
}

function DueSection({ title, filings, hot, empty }: { title: string; filings: BirFiling[]; hot?: boolean; empty: string }) {
  return (
    <div className="due-wrap">
      <div className={`due-head${hot ? ' hot' : ''}`}>
        {title}
        {filings.length > 0 && <span className="due-count">{filings.length}</span>}
      </div>
      {filings.length ? filings.map((f) => <FilingRow key={f.id} f={f} />) : <div className="empty-note">{empty}</div>}
    </div>
  );
}

/** BIR tax calendar, ported from msma-task-monitor's TaxCalendarCard. */
export default function EtmCalendar() {
  const today = todayISO();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState<string | null>(null);

  const filings = birFilingsForMonth(year, month);
  const byDay = new Map<number, BirFiling[]>();
  for (const f of filings) {
    const d = Number(f.dueDate.split('-')[2]);
    byDay.set(d, [...(byDay.get(d) || []), f]);
  }

  const first = firstWeekdayOfMonth(year, month);
  const dim = lastDayOfMonth(year, month);

  function step(delta: number) {
    const s = shiftMonth(year, month, delta);
    setYear(s.year);
    setMonth(s.monthIndex0);
  }

  return (
    <>
      <div className="cal-card">
        <div className="cal-sub">BIR Tax Calendar — click a marked date to see what’s due</div>
        <div className="cal-header">
          <button className="cal-nav" aria-label="Previous month" onClick={() => step(-1)}>‹</button>
          <div className="cal-month">{MONFULL[month]} {year}</div>
          <button className="cal-nav" aria-label="Next month" onClick={() => step(1)}>›</button>
        </div>
        <div className="cal-weekdays">
          {WEEKSHORT.map((w) => (
            <div className="cal-weekday" key={w}>{w}</div>
          ))}
        </div>
        <div className="cal-days">
          {Array.from({ length: first }).map((_, i) => (
            <div key={`pad${i}`} />
          ))}
          {Array.from({ length: dim }).map((_, i) => {
            const day = i + 1;
            const iso = `${year}-${pad2(month + 1)}-${pad2(day)}`;
            const marked = byDay.has(day);
            return (
              <div
                key={iso}
                className={`cal-day${marked ? ' marked' : ''}${iso === today ? ' today' : ''}`}
                role={marked ? 'button' : undefined}
                tabIndex={marked ? 0 : undefined}
                onClick={() => marked && setSelected(iso)}
                onKeyDown={(e) => {
                  if (marked && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setSelected(iso);
                  }
                }}
              >
                {day}
                {marked && <span className="cal-dot" />}
              </div>
            );
          })}
        </div>
        <DueSection title="Due Today" filings={birFilingsForDate(today)} hot empty="Nothing due today." />
        <DueSection title="Upcoming — Tomorrow" filings={birFilingsForDate(addDaysIso(today, 1))} empty="Nothing due tomorrow." />
      </div>

      {selected && (
        <ListModal
          title={`${MONFULL[Number(selected.split('-')[1]) - 1]} ${Number(selected.split('-')[2])}, ${selected.split('-')[0]}`}
          onClose={() => setSelected(null)}
        >
          {birFilingsForDate(selected).map((f) => (
            <FilingRow key={f.id} f={f} />
          ))}
        </ListModal>
      )}
    </>
  );
}
