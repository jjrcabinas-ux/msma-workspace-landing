'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PersonalEvent, UsersMap } from '@/lib/types';
import { birFilingsForDate, type BirFiling } from '@/lib/birCalendar';
import { MONFULL, WEEKSHORT, addDaysIso, firstWeekdayOfMonth, lastDayOfMonth, pad2, shiftMonth, todayISO } from '@/lib/dates';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';
import ListModal from '@/components/ListModal';

// "All" calendar: consolidates every calendar in one grid — BIR deadlines,
// Work From Home, Fieldwork and Meetings, plus the viewer's own Personal
// events (other people's personal events stay private to them).

export default function AllCalendar({
  roster,
  myEmail,
  usersMap,
  emailToUid,
}: {
  roster: string[];
  myEmail: string;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
}) {
  const today = todayISO();
  const [ty, tm] = today.split('-').map(Number);
  const [year, setYear] = useState(ty);
  const [month, setMonth] = useState(tm - 1);
  const [selected, setSelected] = useState<string | null>(null);
  const [wfh, setWfh] = useState<Record<string, string[]>>({});
  const [field, setField] = useState<Record<string, string[]>>({});
  const [events, setEvents] = useState<PersonalEvent[]>([]);

  useEffect(() => {
    setWfh({});
    setField({});
    const subs: Array<() => void> = [];
    for (const email of roster) {
      for (const key of ['wfh', 'fieldwork'] as const) {
        subs.push(
          onSnapshot(
            doc(db, 'members', email, key, 'main'),
            (snap) => {
              const dates = (snap.exists() && (snap.data().dates as string[])) || [];
              (key === 'wfh' ? setWfh : setField)((s) => ({ ...s, [email]: dates }));
            },
            () => {}
          )
        );
      }
    }
    return () => subs.forEach((u) => u());
  }, [roster]);

  useEffect(() => {
    return onSnapshot(
      doc(db, 'members', myEmail, 'personal', 'main'),
      (snap) => setEvents((snap.exists() && (snap.data().events as PersonalEvent[])) || []),
      () => {}
    );
  }, [myEmail]);

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };
  const photoOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid]?.photo : null;
  };

  const onDay = (iso: string) => ({
    bir: birFilingsForDate(iso),
    wfhWho: roster.filter((e) => (wfh[e] || []).includes(iso)),
    fieldWho: roster.filter((e) => (field[e] || []).includes(iso)),
    mine: events.filter((e) => e.date === iso),
  });

  function step(delta: number) {
    const s = shiftMonth(year, month, delta);
    setYear(s.year);
    setMonth(s.monthIndex0);
  }

  const first = firstWeekdayOfMonth(year, month);
  const dim = lastDayOfMonth(year, month);

  const personRow = (email: string) => (
    <div className="snap-row" key={email}>
      <Pava photo={photoOf(email)} label={labelOf(email)} color={empColor(roster.indexOf(email))} />
      <div className="snap-body">
        {labelOf(email)}
        {email === myEmail ? <span className="snap-owner"> — you</span> : null}
      </div>
    </div>
  );

  const filingRow = (f: BirFiling) => (
    <div className="cal-filing" key={f.id}>
      <span className="cal-code">{f.code}</span>
      <div className="cal-filing-body">
        <div className="cal-label">{f.label}</div>
        <div className="cal-period">{f.periodLabel}</div>
      </div>
    </div>
  );

  const sections = (iso: string) => {
    const d = onDay(iso);
    const none = !d.bir.length && !d.wfhWho.length && !d.fieldWho.length && !d.mine.length;
    if (none) return <div className="empty-note">Nothing scheduled.</div>;
    return (
      <>
        {d.bir.length > 0 && (
          <>
            <div className="all-sec"><i className="all-dot d-bir" />BIR Deadlines<span className="due-count">{d.bir.length}</span></div>
            {d.bir.map(filingRow)}
          </>
        )}
        {d.wfhWho.length > 0 && (
          <>
            <div className="all-sec"><i className="all-dot d-wfh" />Work From Home<span className="due-count">{d.wfhWho.length}</span></div>
            {d.wfhWho.map(personRow)}
          </>
        )}
        {d.fieldWho.length > 0 && (
          <>
            <div className="all-sec"><i className="all-dot d-field" />Fieldwork and Meetings<span className="due-count">{d.fieldWho.length}</span></div>
            {d.fieldWho.map(personRow)}
          </>
        )}
        {d.mine.length > 0 && (
          <>
            <div className="all-sec"><i className="all-dot d-per" />My Personal Events<span className="due-count">{d.mine.length}</span></div>
            {d.mine.map((e) => (
              <div className="pe-row" key={e.id}>
                <span className="pe-dot" />
                <div className="pe-title">{e.title}</div>
              </div>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <>
      <div className="cal-card">
        <div className="cal-sub">
          <b style={{ color: 'var(--white)' }}>All Calendars</b> — everything in one view; click a date for the details
        </div>
        <div className="cal-legend">
          <span><i className="all-dot d-bir" />BIR deadline</span>
          <span><i className="all-dot d-wfh" />Work From Home</span>
          <span><i className="all-dot d-field" />Fieldwork / Meeting</span>
          <span><i className="all-dot d-per" />Personal (only yours)</span>
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
            const d = onDay(iso);
            const any = d.bir.length || d.wfhWho.length || d.fieldWho.length || d.mine.length;
            return (
              <div
                key={iso}
                className={`cal-day sch${any ? ' all-on' : ''}${iso === today ? ' today' : ''}`}
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
                {any ? (
                  <span className="cal-dots">
                    {d.bir.length > 0 && <i className="d-bir" />}
                    {d.wfhWho.length > 0 && <i className="d-wfh" />}
                    {d.fieldWho.length > 0 && <i className="d-field" />}
                    {d.mine.length > 0 && <i className="d-per" />}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="due-wrap">
          <div className="due-head hot">Today</div>
          {sections(today)}
        </div>
        <div className="due-wrap">
          <div className="due-head">Tomorrow</div>
          {sections(addDaysIso(today, 1))}
        </div>
      </div>

      {selected && (
        <ListModal
          className="cal-wide"
          title={`${MONFULL[Number(selected.split('-')[1]) - 1]} ${Number(selected.split('-')[2])}, ${selected.split('-')[0]}`}
          onClose={() => setSelected(null)}
        >
          {sections(selected)}
        </ListModal>
      )}
    </>
  );
}
