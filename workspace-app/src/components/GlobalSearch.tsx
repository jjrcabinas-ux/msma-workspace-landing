'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SheetTask, UsersMap } from '@/lib/types';
import { birFilingsForMonth, type BirFiling } from '@/lib/birCalendar';
import { fmtShort, shiftMonth, todayISO } from '@/lib/dates';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';
import type { BoardKey } from '@/components/Sidebar';

// True workspace-wide search (Slack-style topbar placement): tasks across
// every cluster's sheets, people, BIR calendar filings, and module
// navigation. Sheet data is fetched on demand and cached briefly.

type TaskHit = { t: SheetTask; email: string; cluster: string };

const NAV_ITEMS: { board: BoardKey; label: string }[] = [
  { board: 'dashboard', label: 'Dashboard' },
  { board: 'tasks', label: 'Task Monitoring' },
  { board: 'tax', label: 'Tax Compliance' },
  { board: 'books', label: 'Bookkeeping' },
  { board: 'audit', label: 'Audit' },
  { board: 'clients', label: 'Client Masterlist' },
  { board: 'settings', label: 'Settings' },
];

const STATUS_COLOR: Record<string, string> = {
  Pending: 'var(--amber)',
  Ongoing: 'var(--blue)',
  Done: 'var(--lime)',
};

export default function GlobalSearch({
  usersMap,
  emailToUid,
  onNavigate,
  onOpenTasks,
}: {
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  onNavigate: (board: BoardKey) => void;
  onOpenTasks: (clusterUpper: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<TaskHit[] | null>(null);
  const [clusters, setClusters] = useState<Record<string, string>>({});
  const loadedAt = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (Date.now() - loadedAt.current < 60_000) return;
    loadedAt.current = Date.now();
    try {
      const ms = await getDocs(collection(db, 'members'));
      const members: { email: string; cluster: string }[] = [];
      ms.forEach((d) => members.push({ email: d.id, cluster: ((d.data().cluster as string) || '').toUpperCase() }));
      const clusterMap: Record<string, string> = {};
      members.forEach((m) => (clusterMap[m.email] = m.cluster));
      setClusters(clusterMap);
      const sheets = await Promise.all(
        members.map((m) =>
          getDoc(doc(db, 'members', m.email, 'sheet', 'main'))
            .then((s) => ({ m, tasks: ((s.exists() && s.data().tasks) || []) as SheetTask[] }))
            .catch(() => ({ m, tasks: [] as SheetTask[] }))
        )
      );
      const all: TaskHit[] = [];
      sheets.forEach(({ m, tasks }) => tasks.forEach((t) => all.push({ t, email: m.email, cluster: m.cluster })));
      setHits(all);
    } catch {
      setHits([]);
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };
  const photoOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid]?.photo : null;
  };

  const query = q.trim().toLowerCase();

  const results = useMemo(() => {
    if (!query) return null;
    const tasks = (hits || [])
      .filter((h) => `${h.t.task} ${h.t.details} ${h.t.help} ${labelOf(h.email)}`.toLowerCase().includes(query))
      .slice(0, 8);
    const seen = new Set<string>();
    const people = Object.entries(usersMap)
      .filter(([, u]) => {
        const key = u.email || u.label;
        if (seen.has(key)) return false;
        seen.add(key);
        return `${u.label} ${u.email} ${u.position}`.toLowerCase().includes(query);
      })
      .slice(0, 6);
    const today = todayISO();
    const [y, m] = today.split('-').map(Number);
    const next = shiftMonth(y, m - 1, 1);
    const filings = [...birFilingsForMonth(y, m - 1), ...birFilingsForMonth(next.year, next.monthIndex0)]
      .filter((f) => `${f.code} ${f.label}`.toLowerCase().includes(query))
      .filter((f) => f.dueDate >= today)
      .slice(0, 6);
    const nav = NAV_ITEMS.filter((n) => n.label.toLowerCase().includes(query));
    return { tasks, people, filings, nav };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hits, usersMap]);

  const loading = query !== '' && hits === null;

  return (
    <div className="tb-search" ref={wrapRef}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        placeholder="Search the workspace…"
        aria-label="Search the workspace"
        value={q}
        onFocus={() => {
          setOpen(true);
          load();
        }}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          load();
        }}
      />
      {open && query && (
        <div className="gs-panel">
          {loading && <div className="gs-empty">Searching the workspace…</div>}
          {results && !loading && (
            <>
              {results.tasks.length > 0 && (
                <>
                  <div className="gs-group">Tasks</div>
                  {results.tasks.map((h, i) => (
                    <button
                      key={`t${i}`}
                      className="gs-row"
                      onClick={() => {
                        setOpen(false);
                        onOpenTasks(h.cluster);
                      }}
                    >
                      <Pava photo={photoOf(h.email)} label={labelOf(h.email)} color={empColor(i)} />
                      <div className="gs-body">
                        {h.t.task || '(untitled)'}
                        <div className="gs-sub">
                          {labelOf(h.email)} · {h.cluster || '—'}
                          {h.t.due ? ` · due ${fmtShort(h.t.due)}` : ''}
                        </div>
                      </div>
                      <span className="gs-sub" style={{ color: STATUS_COLOR[h.t.status] || 'var(--dim)', fontWeight: 700 }}>
                        {h.t.status}
                      </span>
                    </button>
                  ))}
                </>
              )}
              {results.people.length > 0 && (
                <>
                  <div className="gs-group">People</div>
                  {results.people.map(([uid, u], i) => (
                    <div key={uid} className="gs-row">
                      <Pava photo={u.photo} label={u.label} color={empColor(i + 2)} />
                      <div className="gs-body">
                        {u.label}
                        <div className="gs-sub">
                          {u.email}
                          {u.position ? ` · ${u.position}` : ''}
                          {clusters[u.email] ? ` · ${clusters[u.email]}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {results.filings.length > 0 && (
                <>
                  <div className="gs-group">BIR Calendar</div>
                  {results.filings.map((f: BirFiling) => (
                    <div key={f.id} className="gs-row">
                      <span className="form-chip">{f.code}</span>
                      <div className="gs-body">
                        {f.label}
                        <div className="gs-sub">{f.periodLabel} · due {fmtShort(f.dueDate)}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {results.nav.length > 0 && (
                <>
                  <div className="gs-group">Go to</div>
                  {results.nav.map((n) => (
                    <button
                      key={n.board}
                      className="gs-row"
                      onClick={() => {
                        setOpen(false);
                        onNavigate(n.board);
                      }}
                    >
                      <div className="gs-body">{n.label}</div>
                      <span className="gs-sub">module</span>
                    </button>
                  ))}
                </>
              )}
              {!results.tasks.length && !results.people.length && !results.filings.length && !results.nav.length && (
                <div className="gs-empty">Walang tumugma sa “{q.trim()}”.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
