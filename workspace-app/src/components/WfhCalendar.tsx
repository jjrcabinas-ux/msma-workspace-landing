'use client';

import { useEffect, useState } from 'react';
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsersMap } from '@/lib/types';
import { MONFULL, WEEKSHORT, addDaysIso, firstWeekdayOfMonth, lastDayOfMonth, pad2, shiftMonth, todayISO } from '@/lib/dates';
import { empColor, initialsOf } from '@/lib/ui';
import Pava from '@/components/Pava';
import ListModal from '@/components/ListModal';

// Twin card beside the BIR calendar: the cluster's work-from-home
// schedule. Members mark their own WFH days by clicking a date; everyone
// sees who's home on which day.

function wfhDoc(email: string) {
  return doc(db, 'members', email, 'wfh', 'main');
}

export default function WfhCalendar({
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

  useEffect(() => {
    const unsubs = roster.map((email) =>
      onSnapshot(
        wfhDoc(email),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          setWfh((s) => ({ ...s, [email]: (snap.exists() && (snap.data().dates as string[])) || [] }));
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [roster]);

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };
  const photoOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid]?.photo : null;
  };

  const whoOn = (iso: string) => roster.filter((email) => (wfh[email] || []).includes(iso));
  const inRoster = roster.includes(myEmail);
  const mineOn = (iso: string) => (wfh[myEmail] || []).includes(iso);

  function toggleMine(iso: string) {
    if (!inRoster) return;
    const on = mineOn(iso);
    setWfh((s) => ({
      ...s,
      [myEmail]: on ? (s[myEmail] || []).filter((d) => d !== iso) : [...(s[myEmail] || []), iso],
    }));
    setDoc(wfhDoc(myEmail), { dates: on ? arrayRemove(iso) : arrayUnion(iso) }, { merge: true }).catch(() => {});
  }

  function step(delta: number) {
    const s = shiftMonth(year, month, delta);
    setYear(s.year);
    setMonth(s.monthIndex0);
  }

  const first = firstWeekdayOfMonth(year, month);
  const dim = lastDayOfMonth(year, month);

  const personRow = (email: string, i: number) => (
    <div className="snap-row" key={email}>
      <Pava photo={photoOf(email)} label={labelOf(email)} color={empColor(i)} />
      <div className="snap-body">
        {labelOf(email)}
        {email === myEmail ? <span className="snap-owner"> — you</span> : null}
      </div>
    </div>
  );

  const daySection = (title: string, iso: string, empty: string) => {
    const who = whoOn(iso);
    return (
      <div className="due-wrap">
        <div className="due-head">
          {title}
          {who.length > 0 && <span className="due-count">{who.length}</span>}
        </div>
        {who.length ? who.map(personRow) : <div className="empty-note">{empty}</div>}
      </div>
    );
  };

  return (
    <>
      <div className="cal-card">
        <div className="cal-sub">Work From Home Schedule — click a date to see who’s home{inRoster ? ' or mark your own' : ''}</div>
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
            const who = whoOn(iso);
            return (
              <div
                key={iso}
                className={`cal-day wfh${who.length ? ' marked' : ''}${iso === today ? ' today' : ''}`}
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
                {who.length > 0 && (
                  <span className="wfh-avas">
                    {who.slice(0, 2).map((email, j) => {
                      const p = photoOf(email);
                      return p ? (
                        <span key={email} className="wfh-ava" style={{ backgroundImage: `url(${p})` }} />
                      ) : (
                        <span key={email} className="wfh-ava" style={{ background: empColor(j) }}>
                          {initialsOf(labelOf(email))[0]}
                        </span>
                      );
                    })}
                    {who.length > 2 && <span className="wfh-more">+{who.length - 2}</span>}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {daySection('WFH Today', today, 'Everyone’s on site today.')}
        {daySection('WFH Tomorrow', addDaysIso(today, 1), 'Everyone’s on site tomorrow.')}
      </div>

      {selected && (
        <ListModal
          title={`WFH — ${MONFULL[Number(selected.split('-')[1]) - 1]} ${Number(selected.split('-')[2])}, ${selected.split('-')[0]}`}
          onClose={() => setSelected(null)}
        >
          {whoOn(selected).length ? (
            whoOn(selected).map(personRow)
          ) : (
            <div className="empty-note">Nobody is marked WFH on this date.</div>
          )}
          {inRoster && (
            <button className="tool-new" style={{ width: '100%', marginTop: 12 }} onClick={() => toggleMine(selected)}>
              {mineOn(selected) ? 'Remove my WFH on this date' : 'Add me — WFH this date'}
            </button>
          )}
        </ListModal>
      )}
    </>
  );
}
