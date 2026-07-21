'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { CLUSTERS } from '@/lib/types';
import { fmtShort } from '@/lib/dates';
import { initialsOf } from '@/lib/ui';
import ListModal from '@/components/ListModal';
import Select from '@/components/Select';

type MemberRow = { email: string; cluster: string; internOf: string; addedAt: Timestamp | null };

// Interns also belong to a home cluster — their sheets show up in that
// cluster's Intern tab.
const HOME_CLUSTERS = ['RPM', 'VCM', 'ADS'] as const;

export default function MembersAdmin({ emailToUid }: { emailToUid: Record<string, string> }) {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState('');
  const [cluster, setCluster] = useState<string>(CLUSTERS[0]);
  const [internOf, setInternOf] = useState<string>(HOME_CLUSTERS[0]);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState<{ email: string; cluster: string; profile: UserProfile } | null>(null);

  function viewProfile(m: MemberRow) {
    const uid = emailToUid[m.email];
    if (!uid) return;
    getDoc(doc(db, 'users', uid))
      .then((s) => setViewing({ email: m.email, cluster: m.cluster, profile: (s.exists() ? s.data() : {}) as UserProfile }))
      .catch(() => {});
  }

  useEffect(() => {
    return onSnapshot(
      collection(db, 'members'),
      (snap) => {
        const list: MemberRow[] = [];
        snap.forEach((d) => {
          const m = d.data();
          list.push({
            email: d.id,
            cluster: (m.cluster as string) || '',
            internOf: (m.internOf as string) || '',
            addedAt: (m.addedAt as Timestamp) || null,
          });
        });
        list.sort((a, b) => a.email.localeCompare(b.email));
        setRows(list);
      },
      () => {}
    );
  }, []);

  async function addMember() {
    setError('');
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('Enter a valid email address.');
      return;
    }
    try {
      await setDoc(doc(db, 'members', em), {
        email: em,
        cluster,
        internOf: cluster === 'INTERN' ? internOf : '',
        addedAt: serverTimestamp(),
      });
      setEmail('');
    } catch {
      setError('Couldn’t save right now — try again.');
    }
  }

  return (
    <>
      <div className="board-head">
        <h1>Members</h1>
        <div className="desc">Who can create a workspace account, and which cluster they belong to. Only the admin sees this page.</div>
      </div>
      <div style={{ height: 16 }} />
      <div className="toolbar">
        <input
          id="mem-email"
          className="mem-input"
          type="email"
          inputMode="email"
          spellCheck={false}
          placeholder="staff.email@gmail.com"
          aria-label="Member email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addMember();
          }}
        />
        <Select value={cluster} options={CLUSTERS} onChange={setCluster} ariaLabel="Cluster" />
        {cluster === 'INTERN' && (
          <Select value={internOf} options={HOME_CLUSTERS} onChange={setInternOf} ariaLabel="Intern assigned cluster" />
        )}
        <button className="tool-new" onClick={addMember}>+ Add member</button>
      </div>
      {error && <div className="mem-error" role="alert">{error}</div>}
      <div className="gtable" style={{ ['--gcolor' as never]: 'var(--lime)' }}>
        <div className="grow head">
          <div>Email</div><div>Cluster</div><div>Added</div><div />
        </div>
        {rows.length ? (
          rows.map((m) => (
            <div className="grow item" key={m.email}>
              <div><span className="name">{m.email}</span></div>
              <div style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <Select
                  value={m.cluster}
                  options={CLUSTERS}
                  ariaLabel={`Cluster for ${m.email}`}
                  onChange={(c) => updateDoc(doc(db, 'members', m.email), { cluster: c }).catch(() => {})}
                />
                {m.cluster === 'INTERN' && (
                  <Select
                    value={m.internOf}
                    options={HOME_CLUSTERS}
                    ariaLabel={`Assigned cluster for intern ${m.email}`}
                    onChange={(c) => updateDoc(doc(db, 'members', m.email), { internOf: c }).catch(() => {})}
                  />
                )}
              </div>
              <div><span className="due">{m.addedAt ? m.addedAt.toDate().toLocaleDateString() : '—'}</span></div>
              <div>
                {emailToUid[m.email] ? (
                  <button className="mem-view" onClick={() => viewProfile(m)}>View profile</button>
                ) : (
                  <span className="mem-pending" title="No workspace account yet">Not registered</span>
                )}
                <button
                  className="mem-del"
                  onClick={() => {
                    if (confirm(`Remove ${m.email}? They will lose workspace access.`)) {
                      deleteDoc(doc(db, 'members', m.email)).catch(() => {});
                    }
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="grow item">
            <div><span className="name" style={{ color: 'var(--dim)' }}>No members yet — add the first staff email above.</span></div>
            <div /><div /><div />
          </div>
        )}
      </div>

      {viewing && (
        <ListModal title="Member profile" onClose={() => setViewing(null)}>
          <div className="mprof-head">
            <div
              className="prof-big-ava"
              style={viewing.profile.photo ? { backgroundImage: `url(${viewing.profile.photo})` } : undefined}
            >
              {viewing.profile.photo ? '' : initialsOf(viewing.profile.fullName || viewing.email) || '?'}
            </div>
            <div>
              <div className="mprof-name">{viewing.profile.fullName || '(no name yet)'}</div>
              <div className="mprof-sub">
                {viewing.profile.position || 'No position set'} · {viewing.cluster || 'No cluster'}
              </div>
            </div>
          </div>
          <div className="mprof-rows">
            <div className="mprof-row"><span>Username</span><b>{viewing.profile.username || '—'}</b></div>
            <div className="mprof-row"><span>Profile email</span><b>{viewing.profile.email || viewing.email}</b></div>
            <div className="mprof-row"><span>Registered email</span><b>{viewing.email}</b></div>
            <div className="mprof-row"><span>Birthdate</span><b>{viewing.profile.birthdate ? fmtShort(viewing.profile.birthdate) : '—'}</b></div>
            <div className="mprof-row"><span>Mobile</span><b>{viewing.profile.mobile || '—'}</b></div>
            <div className="mprof-row"><span>Position</span><b>{viewing.profile.position || '—'}</b></div>
            <div className="mprof-row">
              <span>Profile status</span>
              <b style={{ color: viewing.profile.profileComplete ? 'var(--lime)' : 'var(--amber)' }}>
                {viewing.profile.profileComplete ? 'Complete' : 'Incomplete'}
              </b>
            </div>
          </div>
          <div className="mprof-note">Passwords are hashed by Firebase Auth and can’t be viewed by anyone — including admins.</div>
        </ListModal>
      )}
    </>
  );
}
