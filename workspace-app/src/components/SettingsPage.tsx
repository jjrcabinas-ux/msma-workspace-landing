'use client';

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsersMap } from '@/lib/types';
import { CLUSTERS } from '@/lib/types';
import { MON, fmtShort, todayISO, weekRange } from '@/lib/dates';
import { newTaskId } from '@/lib/ui';
import DatePicker from '@/components/DatePicker';
import Select from '@/components/Select';

const DEST_OPTIONS = [
  { label: 'My Deliverables', value: 'mine' },
  { label: 'Team Summary', value: 'summary' },
  { label: 'Calendar', value: 'calendar' },
  { label: 'Intern tab', value: 'interns' },
];
const TYPE_OPTIONS = [
  { label: 'Show to everyone', value: 'general' },
  { label: 'Hide for members done encoding this week', value: 'weekly-encode' },
];

type Announcement = { id: string; title: string; sub: string; dest: string; type: string; expires: string };

// Settings is a list of entries (more arrive later). The Cluster Directory
// popup mirrors the firm's standard printed directory: title band, position
// bands, and a Name / Nickname / DOB / Mobile / Work Email table, with the
// cluster's interns as the last section.

const POSITION_ORDER = ['Partner', 'Associate Director', 'Senior Associate', 'Junior Associate'];

type MemberEntry = { email: string; cluster: string; internOf: string };

export default function SettingsPage({
  isAdmin,
  myCluster,
  usersMap,
  emailToUid,
}: {
  isAdmin: boolean;
  myCluster: string; // uppercase, '' when unassigned
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
}) {
  const [members, setMembers] = useState<MemberEntry[]>([]);
  const [dirOpen, setDirOpen] = useState(false);
  const [annOpen, setAnnOpen] = useState(false);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [annTitle, setAnnTitle] = useState('');
  const [annSub, setAnnSub] = useState('');
  const [annDest, setAnnDest] = useState('mine');
  const [annType, setAnnType] = useState('general');
  const [annExpires, setAnnExpires] = useState(weekRange(todayISO()).end);
  const [annError, setAnnError] = useState('');
  const [annSent, setAnnSent] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    return onSnapshot(
      collection(db, 'announcements'),
      (snap) => {
        const list: Announcement[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            title: (v.title as string) || '',
            sub: (v.sub as string) || '',
            dest: (v.dest as string) || 'mine',
            type: (v.type as string) || 'general',
            expires: (v.expires as string) || '',
          });
        });
        list.sort((a, b) => b.expires.localeCompare(a.expires));
        setAnns(list);
      },
      () => {}
    );
  }, [isAdmin]);

  async function sendAnnouncement() {
    setAnnError('');
    setAnnSent(false);
    if (!annTitle.trim()) {
      setAnnError('Please write the reminder title.');
      return;
    }
    if (!annExpires) {
      setAnnError('Pick an expiry date.');
      return;
    }
    try {
      await setDoc(doc(db, 'announcements', newTaskId()), {
        title: annTitle.trim(),
        sub: annSub.trim(),
        dest: annDest,
        type: annType,
        expires: annExpires,
        createdAt: serverTimestamp(),
      });
      setAnnTitle('');
      setAnnSub('');
      setAnnSent(true);
    } catch {
      setAnnError('Couldn’t send right now — try again.');
    }
  }

  useEffect(() => {
    return onSnapshot(
      collection(db, 'members'),
      (snap) => {
        const list: MemberEntry[] = [];
        snap.forEach((d) =>
          list.push({
            email: d.id,
            cluster: ((d.data().cluster as string) || '').toUpperCase(),
            internOf: ((d.data().internOf as string) || '').toUpperCase(),
          })
        );
        list.sort((a, b) => a.email.localeCompare(b.email));
        setMembers(list);
      },
      () => {}
    );
  }, []);

  const clustersToShow = isAdmin ? [...CLUSTERS].filter((c) => c !== 'INTERN') : myCluster ? [myCluster] : [];

  const profileOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid] : undefined;
  };

  const dobOf = (email: string) => {
    const b = profileOf(email)?.birthdate;
    if (!b) return '—';
    const [, m, d] = b.split('-').map(Number);
    return `${MON[m - 1]} ${d}`;
  };

  const trow = (email: string) => {
    const p = profileOf(email);
    const name = p?.fullName || p?.label || email.split('@')[0];
    const nick = p && p.label && p.label !== name ? p.label : '—';
    return (
      <div className="dirt-row" key={email}>
        <div className="dirt-name">{name}</div>
        <div>{nick}</div>
        <div className="c">{dobOf(email)}</div>
        <div className="c">{p?.mobile || '—'}</div>
        <div className="e">{email}</div>
      </div>
    );
  };

  const band = (label: string) => <div className="dirt-band">{label}</div>;

  const clusterSection = (cl: string) => {
    const inCluster = members.filter((m) => m.cluster === cl);
    const interns = cl === 'INTERN' ? [] : members.filter((m) => m.cluster === 'INTERN' && (!m.internOf || m.internOf === cl));
    const grouped = POSITION_ORDER.map((pos) => ({
      pos,
      rows: inCluster.filter((m) => profileOf(m.email)?.position === pos),
    }));
    const others = inCluster.filter((m) => !POSITION_ORDER.includes(profileOf(m.email)?.position || ''));
    return (
      <div key={cl}>
        <div className="dirt-title">MSMA {cl === 'INTERN' ? 'INTERNS' : `${cl} CLUSTER`} DIRECTORY</div>
        <div className="dirt-wrap">
          <div className="dirt-min">
            <div className="dirt-cols">
              <div /><div /><div className="c">DOB</div><div className="c">Mobile</div><div className="e">Work Email</div>
            </div>
            {!inCluster.length && !interns.length && <div className="empty-note">No members in this cluster yet.</div>}
            {grouped.map(({ pos, rows }) =>
              rows.length ? (
                <div key={pos}>
                  {band(`${pos.toUpperCase()}${rows.length > 1 ? 'S' : ''}`)}
                  {rows.map((m) => trow(m.email))}
                </div>
              ) : null
            )}
            {others.length > 0 && (
              <div>
                {band('OTHERS / NOT YET REGISTERED')}
                {others.map((m) => trow(m.email))}
              </div>
            )}
            {interns.length > 0 && (
              <div>
                {band(`INTERN${interns.length > 1 ? 'S' : ''}`)}
                {interns.map((m) => trow(m.email))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="board-head">
        <h1>Settings</h1>
        <div className="desc">Workspace-wide settings and references.</div>
      </div>
      <div style={{ height: 18 }} />

      <div className="set-list">
        <button className="set-item" onClick={() => setDirOpen(true)}>
          <div>
            <div className="set-title">Cluster Directory</div>
            <div className="set-sub">
              {isAdmin ? 'All clusters, categorized by position' : 'Your cluster’s members, categorized by position'}
            </div>
          </div>
          <span className="set-arrow">›</span>
        </button>
        {isAdmin && (
          <button className="set-item" onClick={() => { setAnnSent(false); setAnnOpen(true); }}>
            <div>
              <div className="set-title">Send Announcement</div>
              <div className="set-sub">Broadcast a reminder to everyone’s notification bell</div>
            </div>
            <span className="set-arrow">›</span>
          </button>
        )}
      </div>
      <div className="empty-note" style={{ marginTop: 12 }}>
        More settings — roles, preferences, and module options — arrive with the full build.
      </div>

      {annOpen && (
        <div
          className="uname-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAnnOpen(false);
          }}
        >
          <div className="uname-card prof-card" role="dialog" aria-modal="true" aria-labelledby="ann-title">
            <h3 id="ann-title">Send Announcement</h3>
            <p>Shows in every member’s notification bell until it expires; tapping it opens the destination tab.</p>
            <div className="prof-grid">
              <div className="prof-field full">
                <label htmlFor="ann-t">Title</label>
                <input id="ann-t" className="mem-input" placeholder="e.g. Reminder: encode your weekly deliverables"
                  value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} />
              </div>
              <div className="prof-field full">
                <label htmlFor="ann-s">Message</label>
                <input id="ann-s" className="mem-input" placeholder="Optional details shown under the title"
                  value={annSub} onChange={(e) => setAnnSub(e.target.value)} />
              </div>
              <div className="prof-field">
                <label>Destination</label>
                <Select
                  value={DEST_OPTIONS.find((o) => o.value === annDest)?.label || 'My Deliverables'}
                  options={DEST_OPTIONS.map((o) => o.label)}
                  ariaLabel="Announcement destination"
                  onChange={(label) => {
                    const hit = DEST_OPTIONS.find((o) => o.label === label);
                    if (hit) setAnnDest(hit.value);
                  }}
                />
              </div>
              <div className="prof-field">
                <label>Expires</label>
                <div className="mem-input">
                  <DatePicker value={annExpires} ariaLabel="Announcement expiry" onChange={setAnnExpires} />
                </div>
              </div>
              <div className="prof-field full">
                <label>Behavior</label>
                <Select
                  value={TYPE_OPTIONS.find((o) => o.value === annType)?.label || TYPE_OPTIONS[0].label}
                  options={TYPE_OPTIONS.map((o) => o.label)}
                  ariaLabel="Announcement behavior"
                  onChange={(label) => {
                    const hit = TYPE_OPTIONS.find((o) => o.label === label);
                    if (hit) setAnnType(hit.value);
                  }}
                />
              </div>
            </div>
            {annError && (
              <div className="mem-error" role="alert" style={{ margin: '12px 0 0' }}>{annError}</div>
            )}
            {annSent && (
              <div className="ann-sent" role="status">Sent! It’s now live in everyone’s bell.</div>
            )}
            <div className="uname-actions">
              <button className="tool-new" onClick={sendAnnouncement}>Send to everyone</button>
              <button className="uname-skip" onClick={() => setAnnOpen(false)}>Close</button>
            </div>
            {anns.length > 0 && (
              <div className="ann-list">
                <div className="gs-group">Announcements</div>
                {anns.map((a) => {
                  const active = a.expires >= todayISO();
                  return (
                    <div className="ann-row" key={a.id}>
                      <div className="ann-body">
                        {a.title}
                        <span className="ann-sub">
                          {active ? `until ${fmtShort(a.expires)}` : 'expired'}
                          {a.type === 'weekly-encode' ? ' · hides when encoded' : ''}
                        </span>
                      </div>
                      <button className="mem-del" onClick={() => deleteDoc(doc(db, 'announcements', a.id)).catch(() => {})}>
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {dirOpen && (
        <div
          className="cal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDirOpen(false);
          }}
        >
          <div className="cal-modal dir-modal" role="dialog" aria-modal="true" aria-label="Cluster Directory">
            <div className="dir-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="MSMA logo" />
              <div style={{ flex: 1 }}>
                <div className="dir-firm">Mora Sanchez Meñoza &amp; Associates</div>
                <div className="dir-subtitle">Cluster Directory · as of {fmtShort(todayISO())}</div>
              </div>
              <button className="cal-modal-close" aria-label="Close" onClick={() => setDirOpen(false)}>×</button>
            </div>
            <div className="cal-modal-body">
              {!clustersToShow.length && (
                <div className="empty-note">No cluster assigned yet — ask the administrator to add you in Members.</div>
              )}
              {clustersToShow.map((cl) => clusterSection(cl))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
