'use client';

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SheetStatus, SheetTask, UsersMap } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import { empColor, newTaskId } from '@/lib/ui';
import Pava from '@/components/Pava';
import EtmCalendar from '@/components/EtmCalendar';

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
  search,
}: {
  cluster: string; // uppercase, '' when none picked/assigned
  clusterKnown: boolean;
  isAdmin: boolean;
  myEmail: string;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  search: string;
}) {
  const [tab, setTab] = useState<'table' | 'calendar'>('table');
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

  const head = (
    <div className="board-head">
      <h1>
        Employee Task Monitoring
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
            ? 'Choose RPM, ADS, VCM, or Interns from the Employee Task Monitoring dropdown in the sidebar.'
            : clusterKnown
              ? 'Ask the administrator to add your email to a cluster in the Members module.'
              : 'Checking your cluster assignment.'}
        </div>
      </>
    );
  }

  const q = search.trim().toLowerCase();

  return (
    <>
      {head}
      <div className="board-tabs">
        <div className={`btab${tab === 'table' ? ' on' : ''}`} onClick={() => setTab('table')}>Main table</div>
        <div className={`btab${tab === 'calendar' ? ' on' : ''}`} onClick={() => setTab('calendar')}>Calendar</div>
      </div>
      {tab === 'calendar' ? (
        <EtmCalendar />
      ) : (
        <>
          <div style={{ height: 16 }} />
          {!roster.length ? (
            <div className="soonboard">
              <b>No members in this cluster yet</b>Add member emails in the Members module and assign them here.
            </div>
          ) : (
            roster.map((email, idx) => {
              const uid = emailToUid[email];
              const label = (uid && usersMap[uid]?.label) || email.split('@')[0];
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
                          <input className="etm-input" type="date" defaultValue={t.date} aria-label="Date" disabled={!editable}
                            onChange={(e) => mutate(email, i, { date: e.target.value })} />
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
                          <input className="etm-input" type="date" defaultValue={t.due} aria-label="Due date" disabled={!editable}
                            onChange={(e) => mutate(email, i, { due: e.target.value })} />
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
            })
          )}
        </>
      )}
    </>
  );
}
