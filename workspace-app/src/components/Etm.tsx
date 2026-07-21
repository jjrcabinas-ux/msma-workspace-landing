'use client';

import { useEffect, useState } from 'react';
import { Timestamp, collection, deleteDoc, doc, getDoc, onSnapshot, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SheetStatus, SheetTask, UsersMap } from '@/lib/types';
import { daysBetween, toIso, todayISO } from '@/lib/dates';
import ListModal from '@/components/ListModal';
import { empColor, newTaskId } from '@/lib/ui';
import type { BirFiling } from '@/lib/birCalendar';
import Pava from '@/components/Pava';
import AddDeliverableModal from '@/components/AddDeliverableModal';
import DatePicker from '@/components/DatePicker';
import EtmCalendar from '@/components/EtmCalendar';
import EtmProfile from '@/components/EtmProfile';
import EtmSummary from '@/components/EtmSummary';

const STATUS_CYCLE: SheetStatus[] = ['Pending', 'Ongoing', 'Done'];

function taskRef(email: string, id: string) {
  return doc(db, 'members', email, 'tasks', id);
}

// The rules enforce the overdue lock against a real timestamp, so `due`
// is stored as a Timestamp (local midnight of the picked date) and shown
// as an ISO string in the UI.
function dueToTs(iso: string): Timestamp | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return Timestamp.fromDate(new Date(y, m - 1, d));
}

function docToTask(id: string, v: Record<string, unknown>): SheetTask {
  return {
    id,
    date: (v.date as string) || '',
    task: (v.task as string) || '',
    details: (v.details as string) || '',
    due: v.due instanceof Timestamp ? toIso(v.due.toDate()) : '',
    status: (v.status as SheetStatus) || 'Pending',
    help: (v.help as string) || '',
    order: v.createdAt instanceof Timestamp ? v.createdAt.toMillis() : 0,
  };
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
  const [addFor, setAddFor] = useState<string | null>(null); // email the add popup targets
  const [lockNotice, setLockNotice] = useState<string | null>(null); // task name whose status is locked

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
        collection(db, 'members', email, 'tasks'),
        (snap) => {
          if (snap.metadata.hasPendingWrites) return;
          const tasks: SheetTask[] = [];
          snap.forEach((d) => tasks.push(docToTask(d.id, d.data())));
          tasks.sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
          setSheets((s) => ({ ...s, [email]: tasks }));
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [roster]);

  const canEdit = (email: string) => isAdmin || email === myEmail;

  // One-time migration: move any legacy sheet doc (tasks array) into the
  // per-task docs the rules can actually police, then delete it.
  useEffect(() => {
    roster.forEach(async (email) => {
      if (!canEdit(email)) return;
      try {
        const legacy = await getDoc(doc(db, 'members', email, 'sheet', 'main'));
        if (!legacy.exists()) return;
        const tasks = ((legacy.data().tasks as SheetTask[]) || []).filter(Boolean);
        await Promise.all(
          tasks.map((t, i) =>
            setDoc(taskRef(email, t.id || `m${i}`), {
              date: t.date || '',
              task: t.task || '',
              details: t.details || '',
              due: dueToTs(t.due || ''),
              status: t.status || 'Pending',
              help: t.help || '',
              createdAt: Timestamp.fromMillis(Date.now() + i),
            })
          )
        );
        await deleteDoc(doc(db, 'members', email, 'sheet', 'main'));
      } catch {
        /* leave the legacy doc for a later attempt */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster]);

  function updateTask(email: string, t: SheetTask, patch: Partial<SheetTask>) {
    const data: Record<string, unknown> = { ...patch };
    delete data.order;
    if (patch.due !== undefined) data.due = dueToTs(patch.due);
    updateDoc(taskRef(email, t.id), data).catch(() => {});
    setSheets((s) => ({ ...s, [email]: (s[email] || []).map((x) => (x.id === t.id ? { ...x, ...patch } : x)) }));
  }

  function removeTask(email: string, id: string) {
    deleteDoc(taskRef(email, id)).catch(() => {});
    setSheets((s) => ({ ...s, [email]: (s[email] || []).filter((x) => x.id !== id) }));
  }

  function createTask(email: string, t: Omit<SheetTask, 'id'>) {
    const id = newTaskId();
    setDoc(taskRef(email, id), {
      date: t.date,
      task: t.task,
      details: t.details,
      due: dueToTs(t.due),
      status: t.status,
      help: t.help,
      createdAt: Timestamp.now(),
    }).catch(() => {});
    setSheets((s) => ({ ...s, [email]: [...(s[email] || []), { id, ...t }] }));
  }

  const labelOf = (email: string) => {
    const uid = emailToUid[email];
    return (uid && usersMap[uid]?.label) || email.split('@')[0];
  };

  function addTask(email: string) {
    if (!canEdit(email)) return;
    setAddFor(email);
  }

  const rankOf = (email: string) => {
    const dones = roster
      .map((e) => ({ e, d: (sheets[e] || []).filter((t) => t.status === 'Done').length }))
      .sort((a, b) => b.d - a.d);
    return dones.findIndex((x) => x.e === email) + 1;
  };

  // Calendar → sheet: a filing becomes a Pending task due on its BIR date.
  // Members can only assign to themselves; admin can assign to anyone.
  const assignees = (isAdmin ? roster : roster.filter((e) => e === myEmail)).map((email) => ({
    email,
    label: email === myEmail ? `${labelOf(email)} (me)` : labelOf(email),
  }));

  function assignFiling(email: string, f: BirFiling) {
    if (!canEdit(email)) return;
    createTask(email, {
      date: todayISO(),
      task: `${f.code} — ${f.label} (${f.periodLabel})`,
      details: '',
      due: f.dueDate,
      status: 'Pending',
      help: '',
    });
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

  const sheetFor = (email: string, idx: number, showHead = true) => {
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
        {showHead && (
          <div className="etm-emp-head">
            <Pava photo={uid ? usersMap[uid]?.photo : null} label={label} color={empColor(idx)} />
            <div>
              <div className="etm-emp-name">{label}</div>
              <div className="etm-emp-sub">
                {email} · {allTasks.length} task{allTasks.length === 1 ? '' : 's'}
              </div>
            </div>
          </div>
        )}
        <div className="etm-table">
          <div className="etm-row head">
            <div>Date</div><div>Task</div><div>Details</div><div>Due</div><div>Status</div><div>Help needed</div>
            <div>
              {editable && (
                <button className="etm-add-btn" onClick={() => addTask(email)}>＋ Add Task</button>
              )}
            </div>
          </div>
          {visible.map(({ t, i }) => {
            // Policy: 3+ days past due and still not Done — members can no
            // longer change the status; the supervisor (admin) updates it.
            const locked =
              editable && !isAdmin && !!t.due && t.status !== 'Done' && daysBetween(t.due, todayISO()) >= 3;
            return (
            <div
              className="etm-row"
              key={`${t.id}|${t.date}|${t.task}|${t.details}|${t.due}|${t.status}|${t.help}`}
            >
              <div>
                <DatePicker value={t.date} ariaLabel="Date" disabled={!editable}
                  onChange={(iso) => updateTask(email, t, { date: iso })} />
              </div>
              <div>
                <input className="etm-input" defaultValue={t.task} placeholder="Task" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.task) updateTask(email, t, { task: e.target.value }); }} />
              </div>
              <div>
                <input className="etm-input" defaultValue={t.details} placeholder="Details" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.details) updateTask(email, t, { details: e.target.value }); }} />
              </div>
              <div>
                <DatePicker value={t.due} ariaLabel="Due date" disabled={!editable}
                  onChange={(iso) => updateTask(email, t, { due: iso })} />
              </div>
              <div>
                <button
                  className="etm-status"
                  data-s={t.status}
                  title={locked ? 'Status locked — 3+ days past due. Ask your supervisor.' : 'Click to change status'}
                  disabled={!editable}
                  onClick={() => {
                    if (locked) {
                      setLockNotice(t.task || '(untitled)');
                      return;
                    }
                    updateTask(email, t, { status: STATUS_CYCLE[(STATUS_CYCLE.indexOf(t.status) + 1) % STATUS_CYCLE.length] });
                  }}
                >
                  {locked ? '🔒 ' : ''}{t.status}
                </button>
              </div>
              <div>
                <input className="etm-input" defaultValue={t.help} placeholder="Help needed?" disabled={!editable}
                  onBlur={(e) => { if (e.target.value !== t.help) updateTask(email, t, { help: e.target.value }); }} />
              </div>
              <div>
                {editable && (
                  <button className="etm-del" title="Delete row" aria-label="Delete row"
                    onClick={() => removeTask(email, t.id)}>
                    ✕
                  </button>
                )}
              </div>
            </div>
            );
          })}
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
            <>
              <EtmProfile
                label={labelOf(myEmail)}
                email={myEmail}
                photo={(emailToUid[myEmail] && usersMap[emailToUid[myEmail]]?.photo) || null}
                tasks={sheets[myEmail] || []}
                rank={rankOf(myEmail)}
                onAddTask={() => addTask(myEmail)}
              />
              {sheetFor(myEmail, roster.indexOf(myEmail), false)}
            </>
          ) : (
            <div className="soonboard">
              <b>No sheet of yours here</b>Your account isn’t a member of the {cluster}
              {cluster === 'INTERN' ? ' group' : ' cluster'}, so you don’t have a deliverables sheet in it.
            </div>
          )}
        </>
      )}
      {addFor && (
        <AddDeliverableModal
          onClose={() => setAddFor(null)}
          onAdd={(t) => {
            createTask(addFor, t);
            setAddFor(null);
          }}
        />
      )}
      {lockNotice !== null && (
        <ListModal title="Status locked" onClose={() => setLockNotice(null)}>
          <div style={{ padding: '4px 2px 8px', fontSize: '.85rem', color: 'var(--grey)', lineHeight: 1.6 }}>
            <b style={{ color: 'var(--white)' }}>{lockNotice}</b> is 3 or more days past its due date without being
            marked Done, so its status can no longer be changed from here. Please coordinate with your{' '}
            <b style={{ color: 'var(--white)' }}>direct supervisor</b> — the workspace admin can update the status for
            you.
          </div>
        </ListModal>
      )}
    </>
  );
}
