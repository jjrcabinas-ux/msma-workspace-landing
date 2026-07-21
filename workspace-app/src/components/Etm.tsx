'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SheetStatus, SheetTask, UsersMap } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import { empColor, newTaskId } from '@/lib/ui';
import type { BirFiling } from '@/lib/birCalendar';
import Pava from '@/components/Pava';
import DatePicker from '@/components/DatePicker';
import EtmCalendar from '@/components/EtmCalendar';
import EtmSummary from '@/components/EtmSummary';

const STATUS_CYCLE: SheetStatus[] = ['Pending', 'Ongoing', 'Done'];

function sheetDoc(email: string) {
  return doc(db, 'members', email, 'sheet', 'main');
}

export default function Etm({
  cluster,
  clusterKnown,
  isAdmin,
  myEmail,
  usersMap,
  emailToUid,
  tab,
  onTab,
}: {
  cluster: string; // uppercase, '' when none picked/assigned
  clusterKnown: boolean;
  isAdmin: boolean;
  myEmail: string;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  tab: 'summary' | 'mine' | 'calendar';
  onTab: (t: 'summary' | 'mine' | 'calendar') => void;
}) {
  const [search, setSearch] = useState('');
  const [roster, setRoster] = useState<string[]>([]);
  const [sheets, setSheets] = useState<Record<string, SheetTask[]>>({});

  useEffect(() => {
    setRoster([]);
    setSheets({});
    if (!cluster) return;
    return onSnapshot(
      query(collection(db, 'members'), where('cluster', '==', cluster)),
      (snap) => {
        const emails: string[] = [];
        snap.forEach((d) => emails.push(d.id));
        emails.sort();
        setRoster(emails);
      },
      () => {}
    );
  }, [cluster]);

  useEffect(() => {
    const unsubs = roster.map((email) =>
      onSnapshot(
        sheetDoc(email),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          const tasks = (snap.exists() && (snap.data().tasks as SheetTask[])) || [];
          setSheets((s) => ({ ...s, [email]: tasks }));
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [roster]);

  const canEdit = (email: string) => isAdmin || email === myEmail;

  function persist(email: string, tasks: SheetTask[]) {
    setSheets((s) => ({ ...s, [email]: tasks }));
    setDoc(sheetDoc(email), { tasks }).catch(() => {});
  }

  function mutate(email: string, i: number, patch: Partial<SheetTask>) {
    const tasks = [...(sheets[email] || [])];
    if (!tasks[i]) return;
    tasks[i] = { ...tasks[i], ...patch };
    persist(email, tasks);
  }

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };

  // Calendar → sheet: a filing becomes a Pending task due on its BIR date.
  // Members can only assign to themselves; admin can assign to anyone.
  const assignees = (isAdmin ? roster : roster.filter((e) => e === myEmail)).map((email) => ({
    email,
    label: email === myEmail ? `${labelOf(email)} (me)` : labelOf(email),
  }));

  function assignFiling(email: string, f: BirFiling) {
    if (!canEdit(email)) return;
    persist(email, [
      ...(sheets[email] || []),
      {
        id: newTaskId(),
        date: todayISO(),
        task: `${f.code} — ${f.label} (${f.periodLabel})`,
        details: '',
        due: f.dueDate,
        status: 'Pending',
        help: '',
      },
    ]);
    onTab(email === myEmail ? 'mine' : 'summary');
  }

  const head = (
    <div className="board-head">
      <h1>
        Task Monitoring
        {cluster ? ` — ${cluster}${cluster === 'INTERN' ? 's' : ' Cluster'}` : ''}
      </h1>
      <div className="desc">Weekly deliverables per member. Everyone sees the cluster; you edit only your own sheet.</div>
    </div>
  );

  if (!cluster) {
    return (
      <>
        {head}
        <div style={{ height: 20 }} />
        <div className="soonboard">
          <b>{isAdmin ? 'Pick a cluster' : clusterKnown ? 'No cluster assigned yet' : 'Loading…'}</b>
          {isAdmin
            ? 'Choose RPM, ADS, VCM, or Interns from the Task Monitoring dropdown in the sidebar.'
            : clusterKnown
              ? 'Ask the administrator to add your email to a cluster in the Members module.'
              : 'Checking your cluster assignment.'}
        </div>
      </>
    );
  }

  const q = search.trim().toLowerCase();

  const sheetFor = (email: string, idx: number) => {
    const uid = emailToUid[email];
    const label = labelOf(email);
    const allTasks = sheets[email] || [];
    const editable = canEdit(email);
    const visible = q
      ? allTasks
          .map((t, i) => ({ t, i }))
          .filter(({ t }) => `${t.task} ${t.details} ${t.help}`.toLowerCase().includes(q))
      : allTasks.map((t, i) => ({ t, i }));
    return (
      <div className="etm-emp" key={email}>
        <div className="etm-emp-head">
          <Pava photo={uid ? usersMap[uid]?.photo : null} label={label} color={empColor(idx)} />
          <div>
            <div className="etm-emp-name">{label}</div>
            <div className="etm-emp-sub">
              {email} · {allTasks.length} task{allTasks.length === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div className="etm-table">
          <div className="etm-row head">
            <div>Date</div><div>Task</div><div>Details</div><div>Due</div><div>Status</div><div>Help needed</div><div />
          </div>
          {visible.map(({ t, i }) => (
            <div
              className="etm-row"
              key={`${t.id}|${t.date}|${t.task}|${t.details}|${t.due}|${t.status}|${t.help}`}
            >
              <div>
                <DatePicker value={t.date} ariaLabel="Date" disabled={!editable}
                  onChange={(iso) => mutate(email, i, { date: iso })} />
              </div>
              <div>
                <input className="etm-input" defaultValue={t.task} placeholder="Task" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.task) mutate(email, i, { task: e.target.value }); }} />
              </div>
              <div>
                <input className="etm-input" defaultValue={t.details} placeholder="Details" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.details) mutate(email, i, { details: e.target.value }); }} />
              </div>
              <div>
                <DatePicker value={t.due} ariaLabel="Due date" disabled={!editable}
                  onChange={(iso) => mutate(email, i, { due: iso })} />
              </div>
              <div>
                <button className="etm-status" data-s={t.status} title="Click to change status" disabled={!editable}
                  onClick={() => mutate(email, i, { status: STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length] })}>
                  {t.status}
                </button>
              </div>
              <div>
                <input className="etm-input" defaultValue={t.help} placeholder="Help needed?" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.help) mutate(email, i, { help: e.target.value }); }} />
              </div>
              <div>
                {editable && (
                  <button className="etm-del" title="Delete row" aria-label="Delete row"
                    onClick={() => {
                      const tasks = [...(sheets[email] || [])];
                      tasks.splice(i, 1);
                      persist(email, tasks);
                    }}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          {editable && (
            <div className="etm-add"
              onClick={() =>
                persist(email, [
                  ...(sheets[email] || []),
                  { id: newTaskId(), date: todayISO(), task: '', details: '', due: '', status: 'Pending', help: '' },
                ])
              }>
              ＋ Add task…
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {head}
      <div className="board-tabs">
        <div className={`btab${tab === 'summary' ? ' on' : ''}`} onClick={() => onTab('summary')}>Team Summary</div>
        <div className={`btab${tab === 'mine' ? ' on' : ''}`} onClick={() => onTab('mine')}>My Deliverables</div>
        <div className={`btab${tab === 'calendar' ? ' on' : ''}`} onClick={() => onTab('calendar')}>Calendar</div>
        {tab === 'mine' && (
          <div className="etm-search">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="search"
              placeholder="Search tasks…"
              aria-label="Search tasks"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>
      {tab === 'summary' && (
        <EtmSummary
          cluster={cluster}
          roster={roster}
          sheets={sheets}
          usersMap={usersMap}
          emailToUid={emailToUid}
        />
      )}
      {tab === 'calendar' && <EtmCalendar assignees={assignees} onAssign={assignFiling} />}
      {tab === 'mine' && (
        <>
          <div style={{ height: 16 }} />
          {roster.includes(myEmail) ? (
            sheetFor(myEmail, roster.indexOf(myEmail))
          ) : (
            <div className="soonboard">
              <b>No sheet of yours here</b>Your account isn’t a member of the {cluster}
              {cluster === 'INTERN' ? ' group' : ' cluster'}, so you don’t have a deliverables sheet in it.
            </div>
          )}
        </>
      )}
    </>
  );
}
