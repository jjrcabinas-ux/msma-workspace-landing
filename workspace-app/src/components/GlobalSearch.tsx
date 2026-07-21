'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Timestamp, collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client, SheetStatus, SheetTask, UsersMap } from '@/lib/types';
import { birFilingsForMonth, type BirFiling } from '@/lib/birCalendar';
import { RETURNS, TAX_KEYS, TAX_PAGES } from '@/lib/birReturns';
import { fmtShort, shiftMonth, toIso, todayISO } from '@/lib/dates';
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

// Deep links into module-internal views: the target board mounts first, then
// the module hears the event and switches to the requested view.
function fire(name: string, detail: string) {
  setTimeout(() => window.dispatchEvent(new CustomEvent(name, { detail })), 150);
}

type ClientHit = Pick<Client, 'id' | 'name' | 'tin' | 'cluster' | 'channel' | 'preparer'>;

export default function GlobalSearch({
  usersMap,
  emailToUid,
  onNavigate,
  onOpenTasks,
  onOpenTab,
  onOpenProfile,
}: {
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  onNavigate: (board: BoardKey) => void;
  onOpenTasks: (clusterUpper: string) => void;
  onOpenTab: (tab: 'summary' | 'mine' | 'calendar' | 'interns') => void;
  onOpenProfile: () => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<TaskHit[] | null>(null);
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [clusters, setClusters] = useState<Record<string, string>>({});
  const loadedAt = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function load() {
    if (Date.now() - loadedAt.current < 60_000) return;
    loadedAt.current = Date.now();
    getDocs(collection(db, 'clients'))
      .then((snap) => {
        const list: ClientHit[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            name: (v.name as string) || '',
            tin: (v.tin as string) || '',
            cluster: ((v.cluster as string) || '').toUpperCase(),
            channel: (v.channel as Client['channel']) || '',
            preparer: (v.preparer as string) || '',
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setClientHits(list);
      })
      .catch(() => {});
    try {
      const ms = await getDocs(collection(db, 'members'));
      const members: { email: string; cluster: string }[] = [];
      ms.forEach((d) => members.push({ email: d.id, cluster: ((d.data().cluster as string) || '').toUpperCase() }));
      const clusterMap: Record<string, string> = {};
      members.forEach((m) => (clusterMap[m.email] = m.cluster));
      setClusters(clusterMap);
      const sheets = await Promise.all(
        members.map((m) =>
          getDocs(collection(db, 'members', m.email, 'tasks'))
            .then((snap) => {
              const tasks: SheetTask[] = [];
              snap.forEach((d) => {
                const v = d.data();
                tasks.push({
                  id: d.id,
                  date: (v.date as string) || '',
                  task: (v.task as string) || '',
                  details: (v.details as string) || '',
                  due: v.due instanceof Timestamp ? toIso(v.due.toDate()) : '',
                  status: (v.status as SheetStatus) || 'Pending',
                  help: (v.help as string) || '',
                });
              });
              return { m, tasks };
            })
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

  // Preload so suggestions appear from the very first keystroke.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Everything reachable in the workspace is suggestible.
    const gotos: { label: string; kw: string; run: () => void }[] = [
      ...NAV_ITEMS.map((n) => ({ label: n.label, kw: n.label.toLowerCase(), run: () => onNavigate(n.board) })),
      { label: 'My Deliverables', kw: 'my deliverables encode add task sheet', run: () => onOpenTab('mine') },
      { label: 'Team Summary', kw: 'team summary kpi leaderboard workload blockers snapshot completion', run: () => onOpenTab('summary') },
      { label: 'BIR Tax Calendar', kw: 'bir tax calendar deadline filing due', run: () => { onOpenTab('calendar'); fire('msma-cal-view', 'bir'); } },
      { label: 'Work From Home Schedule', kw: 'wfh work from home schedule onsite', run: () => { onOpenTab('calendar'); fire('msma-cal-view', 'wfh'); } },
      { label: 'Fieldwork and Meetings — Calendar', kw: 'fieldwork field work meetings mtg calendar out', run: () => { onOpenTab('calendar'); fire('msma-cal-view', 'field'); } },
      { label: 'Personal Calendar', kw: 'personal calendar private events my calendar', run: () => { onOpenTab('calendar'); fire('msma-cal-view', 'personal'); } },
      { label: 'All Calendars', kw: 'all calendars consolidated combined calendar view', run: () => { onOpenTab('calendar'); fire('msma-cal-view', 'all'); } },
      { label: 'Tax Compliance — Overview', kw: 'tax compliance overview dashboard filings needs attention company summary', run: () => { onNavigate('tax'); fire('msma-tax-view', 'overview'); } },
      ...TAX_KEYS.map((t) => ({
        label: `${TAX_PAGES[t].title} — Tax Compliance`,
        kw: `${t} ${TAX_PAGES[t].returns.map((r) => `${RETURNS[r].form} ${RETURNS[r].name}`).join(' ')} pipeline return`.toLowerCase(),
        run: () => { onNavigate('tax'); fire('msma-tax-view', t); },
      })),
      { label: 'Working Paper — 1601-C suite', kw: 'working paper wp employee masterlist withholding tax computation draft return annualization dat file alphalist payroll 1601c 2316 1604c', run: () => { onNavigate('tax'); fire('msma-tax-view', 'wp'); } },
      { label: 'Generate client report', kw: 'generate report client masterlist pdf excel export a4 print', run: () => onNavigate('clients') },
      { label: 'Intern tab', kw: 'intern interns monitoring', run: () => onOpenTab('interns') },
      { label: 'Cluster Directory', kw: 'cluster directory contacts mobile birthday dob email', run: () => onNavigate('settings') },
      { label: 'Send Announcement', kw: 'send announcement broadcast reminder bell', run: () => onNavigate('settings') },
      { label: 'My profile', kw: 'profile photo username position birthdate mobile', run: () => onOpenProfile() },
      { label: 'RPM Cluster — Task Monitoring', kw: 'rpm cluster', run: () => onOpenTasks('RPM') },
      { label: 'ADS Cluster — Task Monitoring', kw: 'ads cluster', run: () => onOpenTasks('ADS') },
      { label: 'VCM Cluster — Task Monitoring', kw: 'vcm cluster', run: () => onOpenTasks('VCM') },
      { label: 'Interns — Task Monitoring', kw: 'intern interns group', run: () => onOpenTasks('INTERN') },
    ];
    const nav = gotos.filter((g) => `${g.label} ${g.kw}`.toLowerCase().includes(query)).slice(0, 6);
    const clientsRes = clientHits
      .filter((c) => `${c.name} ${c.tin} ${c.preparer} ${c.cluster}`.toLowerCase().includes(query))
      .slice(0, 6);
    return { tasks, people, filings, nav, clients: clientsRes };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hits, usersMap, clientHits]);

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
              {results.clients.length > 0 && (
                <>
                  <div className="gs-group">Clients</div>
                  {results.clients.map((c) => (
                    <button
                      key={c.id}
                      className="gs-row"
                      onClick={() => {
                        setOpen(false);
                        onNavigate('clients');
                        fire('msma-clients-cluster', c.cluster);
                      }}
                    >
                      {c.channel ? <span className={`chan-chip ${c.channel === 'eBIR' ? 'ebir' : 'efps'}`}>{c.channel}</span> : <span className="form-chip">C</span>}
                      <div className="gs-body">
                        {c.name}
                        <div className="gs-sub">
                          TIN {c.tin || '—'} · {c.cluster || '—'}{c.preparer ? ` · ${c.preparer}` : ''}
                        </div>
                      </div>
                    </button>
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
                      key={n.label}
                      className="gs-row"
                      onClick={() => {
                        setOpen(false);
                        n.run();
                      }}
                    >
                      <div className="gs-body">{n.label}</div>
                      <span className="gs-sub">go</span>
                    </button>
                  ))}
                </>
              )}
              {!results.tasks.length && !results.people.length && !results.filings.length && !results.nav.length && !results.clients.length && (
                <div className="gs-empty">Walang tumugma sa “{q.trim()}”.</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
