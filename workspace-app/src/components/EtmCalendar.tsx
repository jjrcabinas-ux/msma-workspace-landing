'use client';

import { useState } from 'react';
import { birFilingsForDate, birFilingsForMonth, type BirFiling } from '@/lib/birCalendar';
import { MONFULL, WEEKSHORT, addDaysIso, firstWeekdayOfMonth, lastDayOfMonth, pad2, shiftMonth, todayISO } from '@/lib/dates';
import ListModal from '@/components/ListModal';

export type Assignee = { email: string; label: string };

/** BIR tax calendar, ported from msma-task-monitor's TaxCalendarCard.
 *  Clicking a filing expands an assignment list that adds the filing as a
 *  task on the picked member's sheet (members: own sheet only). */
export default function EtmCalendar({
  assignees,
  onAssign,
}: {
  assignees: Assignee[];
  onAssign: (email: string, filing: BirFiling) => void;
}) {
  const today = todayISO();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    setExpandedId(null);
  }

  function assign(email: string, f: BirFiling) {
    setExpandedId(null);
    setSelected(null);
    onAssign(email, f);
  }

  const filingRow = (f: BirFiling) => (
    <div key={f.id}>
      <button
        type="button"
        className="cal-filing cal-filing-btn"
        onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
      >
        <span className="cal-code">{f.code}</span>
        <div className="cal-filing-body">
          <div className="cal-label">{f.label}</div>
          <div className="cal-period">{f.periodLabel}</div>
        </div>
      </button>
      {expandedId === f.id && (
        <div className="cal-assign">
          <div className="cal-assign-title">Add task for</div>
          {assignees.length ? (
            assignees.map((a) => (
              <div className="cal-assign-row" key={a.email} onClick={() => assign(a.email, f)}>
                {a.label}
              </div>
            ))
          ) : (
            <div className="empty-note">No one you can assign to in this cluster.</div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="cal-card">
        <div className="cal-sub">
          <b style={{ color: 'var(--white)' }}>BIR Tax Calendar</b> — click a marked date to see what’s due, click a filing to add it as a task
        </div>
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
        <div className="due-wrap">
          <div className="due-head hot">
            Due Today
            {birFilingsForDate(today).length > 0 && <span className="due-count">{birFilingsForDate(today).length}</span>}
          </div>
          {birFilingsForDate(today).length ? birFilingsForDate(today).map(filingRow) : <div className="empty-note">Nothing due today.</div>}
        </div>
        <div className="due-wrap">
          <div className="due-head">
            Upcoming — Tomorrow
            {birFilingsForDate(addDaysIso(today, 1)).length > 0 && (
              <span className="due-count">{birFilingsForDate(addDaysIso(today, 1)).length}</span>
            )}
          </div>
          {birFilingsForDate(addDaysIso(today, 1)).length ? (
            birFilingsForDate(addDaysIso(today, 1)).map(filingRow)
          ) : (
            <div className="empty-note">Nothing due tomorrow.</div>
          )}
        </div>
      </div>

      {selected && (
        <ListModal
          title={`${MONFULL[Number(selected.split('-')[1]) - 1]} ${Number(selected.split('-')[2])}, ${selected.split('-')[0]}`}
          onClose={() => {
            setSelected(null);
            setExpandedId(null);
          }}
        >
          {birFilingsForDate(selected).map(filingRow)}
        </ListModal>
      )}
    </>
  );
}
