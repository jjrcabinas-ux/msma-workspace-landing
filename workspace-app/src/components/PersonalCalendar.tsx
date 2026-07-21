'use client';

import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PersonalEvent } from '@/lib/types';
import { MONFULL, WEEKSHORT, addDaysIso, firstWeekdayOfMonth, lastDayOfMonth, pad2, shiftMonth, todayISO } from '@/lib/dates';
import { newTaskId } from '@/lib/ui';
import ListModal from '@/components/ListModal';

// Personal calendar: the member's own private events. Nobody else can
// read them — Firestore rules limit the doc to the owner (and admin).

export default function PersonalCalendar({ myEmail }: { myEmail: string }) {
  const today = todayISO();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<PersonalEvent[]>([]);
  const [draft, setDraft] = useState('');

  const ref = doc(db, 'members', myEmail, 'personal', 'main');

  useEffect(() => {
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        setEvents((snap.exists() && (snap.data().events as PersonalEvent[])) || []);
      },
      () => {}
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myEmail]);

  const eventsOn = (iso: string) => events.filter((e) => e.date === iso);

  function addEvent(iso: string) {
    const title = draft.trim();
    if (!title) return;
    const ev: PersonalEvent = { id: `p${newTaskId()}`, date: iso, title };
    setEvents((list) => [...list, ev]);
    setDraft('');
    setDoc(ref, { events: arrayUnion(ev) }, { merge: true }).catch(() => {});
  }

  function removeEvent(ev: PersonalEvent) {
    setEvents((list) => list.filter((e) => e.id !== ev.id));
    setDoc(ref, { events: arrayRemove(ev) }, { merge: true }).catch(() => {});
  }

  function step(delta: number) {
    const s = shiftMonth(year, month, delta);
    setYear(s.year);
    setMonth(s.monthIndex0);
  }

  const first = firstWeekdayOfMonth(year, month);
  const dim = lastDayOfMonth(year, month);

  const eventRow = (ev: PersonalEvent, canDelete: boolean) => (
    <div className="pe-row" key={ev.id}>
      <span className="pe-dot" />
      <div className="pe-title">{ev.title}</div>
      {canDelete && (
        <button className="pe-del" title="Remove event" onClick={() => removeEvent(ev)}>✕</button>
      )}
    </div>
  );

  const daySection = (secTitle: string, iso: string) => {
    const list = eventsOn(iso);
    return (
      <div className="due-wrap">
        <div className="due-head">
          {secTitle}
          {list.length > 0 && <span className="due-count">{list.length}</span>}
        </div>
        {list.length ? list.map((e) => eventRow(e, false)) : <div className="empty-note">No personal events.</div>}
      </div>
    );
  };

  return (
    <>
      <div className="cal-card">
        <div className="cal-sub">
          <b style={{ color: 'var(--white)' }}>Personal</b> — your private calendar; click a date to add or remove events. Only you can see them.
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
            const n = eventsOn(iso).length;
            return (
              <div
                key={iso}
                className={`cal-day sch${n ? ' sch-on-violet' : ''}${iso === today ? ' today' : ''}`}
                title={n ? `${n} event${n === 1 ? '' : 's'}` : undefined}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(iso)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(iso);
                  }
                }}
              >
                {day}
              </div>
            );
          })}
        </div>
        {daySection('Today', today)}
        {daySection('Tomorrow', addDaysIso(today, 1))}
      </div>

      {selected && (
        <ListModal
          title={`Personal — ${MONFULL[Number(selected.split('-')[1]) - 1]} ${Number(selected.split('-')[2])}, ${selected.split('-')[0]}`}
          onClose={() => {
            setSelected(null);
            setDraft('');
          }}
        >
          {eventsOn(selected).length ? (
            eventsOn(selected).map((e) => eventRow(e, true))
          ) : (
            <div className="empty-note">No events on this date yet.</div>
          )}
          <div className="pe-add">
            <input
              className="mem-input"
              style={{ flex: 1 }}
              placeholder="e.g. Dentist appointment, 3 PM"
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addEvent(selected);
              }}
            />
            <button className="tool-new" onClick={() => addEvent(selected)}>Add event</button>
          </div>
        </ListModal>
      )}
    </>
  );
}
