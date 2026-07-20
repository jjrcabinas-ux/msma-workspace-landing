'use client';

import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { collectionGroup, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { BoardItem, BoardStatus, OwnerBoard, UsersMap } from '@/lib/types';
import { DEFAULT_GROUPS, STATUS_LABEL } from '@/lib/types';
import { MON, MONFULL } from '@/lib/dates';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';
import ListModal from '@/components/ListModal';

type Flat = { it: BoardItem; owner: string; uid: string; idx: number };

const RING_C = 2 * Math.PI * 54;

export default function Dashboard({
  user,
  usersMap,
  myLabel,
  onOpenTasks,
}: {
  user: User;
  usersMap: UsersMap;
  myLabel: string;
  onOpenTasks: () => void;
}) {
  const [view, setView] = useState<OwnerBoard[]>([]);
  const [modal, setModal] = useState<{ title: string; body: React.ReactNode } | null>(null);

  // Seed my own board; boards still holding the old empty default groups
  // migrate to the module-summary groups.
  useEffect(() => {
    const myRef = doc(db, 'users', user.uid, 'boards', 'dashboard');
    getDoc(myRef)
      .then((snap) => {
        const groups = (snap.exists() && (snap.data().groups as OwnerBoard['groups'])) || [];
        const allEmpty = groups.every((g) => !(g.items || []).length);
        const needsSeed = !snap.exists() || (allEmpty && (!groups.length || groups[0].name !== DEFAULT_GROUPS[0].name));
        if (needsSeed) setDoc(myRef, { groups: DEFAULT_GROUPS }).catch(() => {});
      })
      .catch(() => {});
  }, [user.uid]);

  useEffect(() => {
    return onSnapshot(
      collectionGroup(db, 'boards'),
      (snap) => {
        const entries: OwnerBoard[] = [];
        snap.forEach((d) => {
          if (d.id !== 'dashboard') return;
          const owner = d.ref.parent.parent;
          if (!owner || owner.parent.id !== 'users') return;
          entries.push({ uid: owner.id, groups: (d.data().groups as OwnerBoard['groups']) || [] });
        });
        entries.sort((a, b) => (a.uid === user.uid ? -1 : b.uid === user.uid ? 1 : a.uid.localeCompare(b.uid)));
        setView(entries);
      },
      () => {}
    );
  }, [user.uid]);

  const ownerLabel = (uid: string) =>
    uid === user.uid ? usersMap[uid]?.label || myLabel : usersMap[uid]?.label || uid.slice(0, 6);

  const today = new Date();
  const dueToday = `${MON[today.getMonth()].toUpperCase()} ${today.getDate()}`;

  const { all, counts, per } = useMemo(() => {
    const all: Flat[] = [];
    view.forEach((v, idx) => {
      const owner = ownerLabel(v.uid);
      (v.groups || []).forEach((g) => (g.items || []).forEach((it) => all.push({ it, owner, uid: v.uid, idx })));
    });
    const counts: Record<BoardStatus, number> = { done: 0, working: 0, stuck: 0, review: 0 };
    all.forEach((f) => {
      if (counts[f.it.s] !== undefined) counts[f.it.s]++;
    });
    const per = view.map((v, i) => {
      let n = 0, d = 0, w = 0, r = 0, st = 0;
      (v.groups || []).forEach((g) =>
        (g.items || []).forEach((it) => {
          n++;
          if (it.s === 'done') d++;
          else if (it.s === 'working') w++;
          else if (it.s === 'review') r++;
          else if (it.s === 'stuck') st++;
        })
      );
      return { uid: v.uid, label: ownerLabel(v.uid), n, d, w, r, st, i };
    });
    return { all, counts, per };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, usersMap, myLabel]);

  const total = all.length;
  const pct = total ? Math.round((counts.done / total) * 100) : 0;
  const pctOf = (n: number) => (total ? (n / total) * 100 : 0);

  const statusOrder: Record<BoardStatus, number> = { done: 0, working: 1, review: 2, stuck: 3 };
  const todayItems = all
    .filter((f) => (f.it.due || '').toUpperCase() === dueToday)
    .sort((a, b) => statusOrder[a.it.s] - statusOrder[b.it.s]);
  const stuckItems = all.filter((f) => f.it.s === 'stuck');

  const sumRow = (f: Flat, key: string) => (
    <div className="snap-row" key={key}>
      <Pava photo={usersMap[f.uid]?.photo} label={f.owner} color={empColor(f.idx)} />
      <div className="snap-body">
        {f.it.chip ? <span className="form-chip">{f.it.chip}</span> : null} {f.it.name}{' '}
        <span className="snap-owner">
          — {f.owner}
          {f.it.due && f.it.due !== '—' ? ` · ${f.it.due}` : ''}
        </span>
      </div>
      <span className={`badge ${f.it.s}`}>{STATUS_LABEL[f.it.s]}</span>
    </div>
  );

  const openKpi = (k: BoardStatus | 'members') => {
    if (k === 'members') {
      setModal({
        title: `Team Members (${per.length})`,
        body: per.map((p) => (
          <div className="snap-row" key={p.uid}>
            <Pava photo={usersMap[p.uid]?.photo} label={p.label} color={empColor(p.i)} />
            <div className="snap-body">
              {p.label} <span className="snap-owner">— {p.n} items · {p.d} done</span>
            </div>
          </div>
        )),
      });
    } else {
      const rows = all.filter((f) => f.it.s === k);
      setModal({
        title: `${STATUS_LABEL[k]} (${rows.length})`,
        body: rows.length ? rows.map((f, i) => sumRow(f, `${k}${i}`)) : <div className="empty-note">Nothing here.</div>,
      });
    }
  };

  const kpiCard = (k: BoardStatus | 'members', label: string, n: number, color: string) => (
    <div className="sum-card kpi-card" role="button" tabIndex={0} onClick={() => openKpi(k)}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-number" style={{ color }}>{n}</div>
    </div>
  );

  const legend = (color: string, label: string, n: number) => (
    <div className="legend-item">
      <span className="legend-dot" style={{ background: color }} /> {label} <span className="legend-value">{n}</span>
    </div>
  );

  const lb = [...per].sort((a, b) => b.d - a.d);
  const maxN = Math.max(1, ...per.map((p) => p.n));
  const maxD = Math.max(1, ...lb.map((p) => p.d));

  return (
    <>
      <div className="board-head">
        <h1>Dashboard</h1>
        <div className="sum-date">
          {MONFULL[today.getMonth()]} {today.getDate()}, {today.getFullYear()} — metrics across all members’ boards
        </div>
      </div>

      {!view.length ? (
        <>
          <div style={{ height: 20 }} />
          <div className="soonboard"><b>Loading team data…</b>If this doesn’t load, check your connection.</div>
        </>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="sum-card kpi-ring-card">
              <div className="ring-wrap">
                <svg viewBox="0 0 128 128" aria-hidden="true">
                  <circle cx="64" cy="64" r="54" fill="none" stroke="rgba(163,197,255,.12)" strokeWidth="13" />
                  <circle
                    cx="64" cy="64" r="54" fill="none" stroke="#A3E635" strokeWidth="13" strokeLinecap="round"
                    strokeDasharray={RING_C.toFixed(1)}
                    strokeDashoffset={(RING_C * (1 - pct / 100)).toFixed(1)}
                  />
                </svg>
                <div className="ring-label">{pct}%</div>
              </div>
              <div>
                <div className="kpi-label">Completion</div>
                <div className="sum-sub">{counts.done} of {total} done</div>
              </div>
            </div>
            {kpiCard('working', 'Working on it', counts.working, 'var(--amber)')}
            {kpiCard('review', 'For review', counts.review, 'var(--blue)')}
            {kpiCard('stuck', 'Stuck', counts.stuck, 'var(--red)')}
            {kpiCard('members', 'Members', view.length, 'var(--white)')}
          </div>

          <div className="sum-card" style={{ marginBottom: 14 }}>
            <div className="sum-section-title">Today’s Snapshot</div>
            <div className="sum-sub" style={{ margin: '-6px 0 10px' }}>Items due today ({dueToday})</div>
            {todayItems.length ? todayItems.map((f, i) => sumRow(f, `t${i}`)) : <div className="empty-note">No items due today.</div>}
          </div>

          <div className="two-col">
            <div className="sum-card">
              <div className="sum-section-title">Task Status — Whole Team</div>
              <div className="stack-bar">
                {counts.done > 0 && <div style={{ width: `${pctOf(counts.done)}%`, background: 'var(--lime)' }} />}
                {counts.working > 0 && <div style={{ width: `${pctOf(counts.working)}%`, background: 'var(--amber)' }} />}
                {counts.review > 0 && <div style={{ width: `${pctOf(counts.review)}%`, background: 'var(--blue)' }} />}
                {counts.stuck > 0 && <div style={{ width: `${pctOf(counts.stuck)}%`, background: 'var(--red)' }} />}
              </div>
              <div className="legend-row">
                {legend('var(--lime)', 'Done', counts.done)}
                {legend('var(--amber)', 'Working', counts.working)}
                {legend('var(--blue)', 'For review', counts.review)}
                {legend('var(--red)', 'Stuck', counts.stuck)}
              </div>
            </div>
            <div className="sum-card">
              <div className="sum-section-title">Workload — Items per Person</div>
              {per.map((p) => (
                <div className="workload-row" key={p.uid}>
                  <span className="workload-name">{p.label}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${(p.n / maxN) * 100}%` }} /></div>
                  <span className="workload-count">{p.n}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="two-col">
            <div className="sum-card">
              <div className="sum-section-title">Leaderboard</div>
              <div className="sum-sub" style={{ margin: '-6px 0 10px' }}>Items completed</div>
              {lb.map((p, i) => (
                <div className="lb-row" key={p.uid}>
                  <span className={`lb-rank${i === 0 ? ' top' : ''}`}>{i + 1}</span>
                  <span className="workload-name">{p.label}</span>
                  <div className="bar-track"><div className={`lb-bar-fill${i === 0 ? ' top' : ''}`} style={{ width: `${(p.d / maxD) * 100}%` }} /></div>
                  <span className="workload-count">{p.d}</span>
                </div>
              ))}
            </div>
            <div className="sum-card">
              <div className="sum-section-title">Help Needed — Stuck Items</div>
              {stuckItems.length ? stuckItems.map((f, i) => sumRow(f, `s${i}`)) : <div className="empty-note">No stuck items. 🎉</div>}
            </div>
          </div>

          <div className="sum-heading">
            Team Members <span>— click a card to open Employee Task Monitoring</span>
          </div>
          <div className="emp-grid">
            {per.map((p) => {
              const pc = p.n ? Math.round((p.d / p.n) * 100) : 0;
              const seg = (n: number, c: string) =>
                n > 0 ? <div style={{ width: `${(n / (p.n || 1)) * 100}%`, background: c }} /> : null;
              return (
                <div className="sum-card emp-card" role="button" tabIndex={0} key={p.uid} onClick={onOpenTasks}>
                  <div className="emp-top">
                    <div style={{ flex: 1 }}>
                      <div className="emp-name">{p.label}</div>
                      <div className="emp-total">{p.n} items</div>
                    </div>
                    <div className="emp-pct">{pc}%</div>
                  </div>
                  <div className="emp-bar">
                    {seg(p.d, 'var(--lime)')}
                    {seg(p.w, 'var(--amber)')}
                    {seg(p.r, 'var(--blue)')}
                    {seg(p.st, 'var(--red)')}
                  </div>
                  <div className="emp-stats">
                    <span><b style={{ color: 'var(--lime)' }}>{p.d}</b> done</span>
                    <span><b style={{ color: 'var(--amber)' }}>{p.w}</b> working</span>
                    <span><b style={{ color: 'var(--red)' }}>{p.st}</b> stuck</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal && (
        <ListModal title={modal.title} onClose={() => setModal(null)}>
          {modal.body}
        </ListModal>
      )}
    </>
  );
}
