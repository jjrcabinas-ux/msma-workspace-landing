'use client';

import { useMemo, useState } from 'react';
import type { SheetStatus, SheetTask, UsersMap } from '@/lib/types';
import { MONFULL, daysBetween, fmtShort, todayISO } from '@/lib/dates';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';
import ListModal from '@/components/ListModal';

// Mirrors msma-task-monitor's Team Summary page, computed from the cluster's
// Firestore sheets: KPIs with drill-down modals, Today's Snapshot, status
// stacked bar, workload, leaderboard, member cards, and open blockers.

type Row = { t: SheetTask; email: string; label: string; idx: number };

const RING_C = 2 * Math.PI * 54;

const STATUS_META: Record<SheetStatus, { color: string; bg: string }> = {
  Pending: { color: 'var(--white)', bg: 'rgba(251,191,36,.15)' },
  Ongoing: { color: 'var(--white)', bg: 'rgba(96,165,250,.15)' },
  Done: { color: 'var(--white)', bg: 'var(--lime-soft)' },
};

const SNAPSHOT_ORDER: Record<SheetStatus, number> = { Done: 0, Ongoing: 1, Pending: 2 };

export default function EtmSummary({
  cluster,
  roster,
  sheets,
  usersMap,
  emailToUid,
  internsView = false,
}: {
  cluster: string;
  roster: string[];
  sheets: Record<string, SheetTask[]>;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  internsView?: boolean;
}) {
  const [modal, setModal] = useState<{ title: string; body: React.ReactNode } | null>(null);
  const today = todayISO();
  const now = new Date();

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };
  const photoOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid]?.photo : null;
  };

  const { flat, counts, per, blockers, todayRows } = useMemo(() => {
    const flat: Row[] = [];
    roster.forEach((email, idx) =>
      (sheets[email] || []).forEach((t) => flat.push({ t, email, label: labelOf(email), idx }))
    );
    const counts: Record<SheetStatus, number> = { Pending: 0, Ongoing: 0, Done: 0 };
    flat.forEach((r) => counts[r.t.status]++);
    const per = roster.map((email, idx) => {
      const tasks = sheets[email] || [];
      const c: Record<SheetStatus, number> = { Pending: 0, Ongoing: 0, Done: 0 };
      tasks.forEach((t) => c[t.status]++);
      return { email, label: labelOf(email), idx, n: tasks.length, ...c };
    });
    // Blockers: help-needed text on any task that isn't done, oldest first.
    // ADS only: blockers that mention the partner get a light-red highlight.
    const blockers = flat
      .filter((r) => r.t.help.trim() && r.t.status !== 'Done')
      .sort((a, b) => (a.t.date || '').localeCompare(b.t.date || ''))
      .map((r) => {
        const age = r.t.date ? daysBetween(r.t.date, today) : 0;
        return {
          ...r,
          dateLabel: r.t.date ? fmtShort(r.t.date) : '—',
          daysLabel: age <= 0 ? 'today' : `${age}d open`,
          aging: age >= 3,
          forPartner: cluster === 'ADS' && /\b(atty|ton|ads)\b/i.test(`${r.t.help} ${r.t.task}`),
        };
      });
    const todayRows = flat
      .filter((r) => r.t.date === today)
      .sort((a, b) => SNAPSHOT_ORDER[a.t.status] - SNAPSHOT_ORDER[b.t.status]);
    return { flat, counts, per, blockers, todayRows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, sheets, usersMap, emailToUid, cluster, today]);

  const total = flat.length;
  const pct = total ? Math.round((counts.Done / total) * 100) : 0;

  const badge = (s: SheetStatus) => (
    <span className="badge" style={{ background: STATUS_META[s].bg, color: STATUS_META[s].color }}>
      {s}
    </span>
  );

  const taskRow = (r: Row, key: string, sub?: string) => (
    <div className="snap-row" key={key}>
      <Pava photo={photoOf(r.email)} label={r.label} color={empColor(r.idx)} />
      <div className="snap-body">
        {r.t.task || '(untitled)'}{' '}
        <span className="snap-owner">
          — {r.label}
          {sub ? ` · ${sub}` : r.t.due ? ` · due ${fmtShort(r.t.due)}` : ''}
        </span>
      </div>
      {badge(r.t.status)}
    </div>
  );

  const openStatus = (s: SheetStatus) => {
    const rows = flat.filter((r) => r.t.status === s);
    setModal({
      title: `${s} Tasks (${rows.length})`,
      body: rows.length ? rows.map((r, i) => taskRow(r, `${s}${i}`)) : <div className="empty-note">No {s.toLowerCase()} tasks.</div>,
    });
  };

  const kpiCard = (label: string, n: number, color: string, onClick: () => void) => (
    <div className="sum-card kpi-card" role="button" tabIndex={0} onClick={onClick}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-number" style={{ color }}>{n}</div>
    </div>
  );

  const lb = [...per].sort((a, b) => b.Done - a.Done);
  const maxN = Math.max(1, ...per.map((p) => p.n));
  const maxD = Math.max(1, ...lb.map((p) => p.Done));

  return (
    <>
      <div className="sum-date" style={{ margin: '14px 0 0' }}>
        {MONFULL[now.getMonth()]} {now.getDate()}, {now.getFullYear()} — metrics across{' '}
        {internsView ? `${cluster} interns` : `the ${cluster}${cluster === 'INTERN' ? ' group' : ' cluster'}`}
      </div>

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
            <div className="sum-sub">{counts.Done} of {total} done</div>
          </div>
        </div>
        {kpiCard('Pending', counts.Pending, 'var(--amber)', () => openStatus('Pending'))}
        {kpiCard('Ongoing', counts.Ongoing, 'var(--blue)', () => openStatus('Ongoing'))}
        {kpiCard('Done', counts.Done, 'var(--lime)', () => openStatus('Done'))}
        {kpiCard('Open Blockers', blockers.length, 'var(--red)', () =>
          setModal({
            title: `Open Blockers (${blockers.length})`,
            body: blockers.length
              ? blockers.map((b, i) => taskRow(b, `bm${i}`, b.t.help))
              : <div className="empty-note">No blockers reported.</div>,
          })
        )}
        {kpiCard('Members', roster.length, 'var(--white)', () =>
          setModal({
            title: `Team Members (${roster.length})`,
            body: per.map((p) => (
              <div className="snap-row" key={p.email}>
                <Pava photo={photoOf(p.email)} label={p.label} color={empColor(p.idx)} />
                <div className="snap-body">
                  {p.label} <span className="snap-owner">— {p.n} tasks · {p.Done} done</span>
                </div>
              </div>
            )),
          })
        )}
      </div>

      <div className="two-col">
        <div className="sum-card">
          <div className="sum-section-title">Today’s Snapshot</div>
          <div className="sum-sub" style={{ margin: '-6px 0 10px' }}>Tasks dated today ({fmtShort(today)})</div>
          {todayRows.length ? todayRows.slice(0, 5).map((r, i) => taskRow(r, `t${i}`)) : <div className="empty-note">No tasks dated today.</div>}
          {todayRows.length > 5 && (
            <button
              className="see-more"
              onClick={() =>
                setModal({
                  title: `Today’s Snapshot (${todayRows.length})`,
                  body: todayRows.map((r, i) => taskRow(r, `tm${i}`)),
                })
              }
            >
              View more — {todayRows.length - 5} more
            </button>
          )}
        </div>
        <div className="sum-card">
          <div className="sum-section-title">Workload — Tasks per Person</div>
          {[...per].sort((a, b) => b.n - a.n).map((p) => (
            <div className="workload-row" key={p.email}>
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
          <div className="sum-sub" style={{ margin: '-6px 0 10px' }}>Tasks completed</div>
          {lb.map((p, i) => (
            <div className="lb-row" key={p.email}>
              <span className={`lb-rank${i === 0 ? ' top' : ''}`}>{i + 1}</span>
              <span className="workload-name">{p.label}</span>
              <div className="bar-track"><div className={`lb-bar-fill${i === 0 ? ' top' : ''}`} style={{ width: `${(p.Done / maxD) * 100}%` }} /></div>
              <span className="workload-count">{p.Done}</span>
            </div>
          ))}
        </div>
        <div className="sum-card">
          <div className="sum-section-title">Help Needed — Open Blockers</div>
          {blockers.length ? (
            blockers.map((b, i) => (
              <div
                className="snap-row"
                key={`b${i}`}
                style={b.forPartner ? { background: 'rgba(248,113,113,.08)', borderRadius: 8, padding: '8px 8px' } : undefined}
              >
                <Pava photo={photoOf(b.email)} label={b.label} color={empColor(b.idx)} />
                <div className="snap-body">
                  {b.label} · {b.t.task || '(untitled)'}{' '}
                  <span className="snap-owner">— {b.t.help}</span>
                </div>
                <span className="snap-owner" style={b.aging ? { color: 'var(--red)', fontWeight: 700 } : undefined}>
                  {b.dateLabel} · {b.daysLabel}
                </span>
              </div>
            ))
          ) : (
            <div className="empty-note">No blockers reported. 🎉</div>
          )}
        </div>
      </div>

      <div className="sum-heading">Team Members</div>
      <div className="emp-grid">
        {per.map((p) => {
          const pc = p.n ? Math.round((p.Done / p.n) * 100) : 0;
          const seg = (n: number, c: string) =>
            n > 0 ? <div style={{ width: `${(n / (p.n || 1)) * 100}%`, background: c, boxShadow: `0 0 8px ${c}` }} /> : null;
          return (
            <div className="sum-card" key={p.email}>
              <div className="emp-top">
                <div style={{ flex: 1 }}>
                  <div className="emp-name">{p.label}</div>
                  <div className="emp-total">{p.n} tasks</div>
                </div>
                <div className="emp-pct">{pc}%</div>
              </div>
              <div className="emp-bar">
                {seg(p.Done, 'var(--lime)')}
                {seg(p.Ongoing, 'var(--blue)')}
                {seg(p.Pending, 'var(--amber)')}
              </div>
              <div className="emp-stats">
                <span><b style={{ color: 'var(--lime)' }}>{p.Done}</b> done</span>
                <span><b style={{ color: 'var(--blue)' }}>{p.Ongoing}</b> ongoing</span>
                <span><b style={{ color: 'var(--amber)' }}>{p.Pending}</b> pending</span>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <ListModal title={modal.title} onClose={() => setModal(null)}>
          {modal.body}
        </ListModal>
      )}
    </>
  );
}
