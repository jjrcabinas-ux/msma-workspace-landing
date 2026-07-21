'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CLUSTERS } from '@/lib/types';
import Select from '@/components/Select';

type MemberRow = { email: string; cluster: string; addedAt: Timestamp | null };

export default function MembersAdmin() {
  const [rows, setRows] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState('');
  const [cluster, setCluster] = useState<string>(CLUSTERS[0]);
  const [error, setError] = useState('');

  useEffect(() => {
    return onSnapshot(
      collection(db, 'members'),
      (snap) => {
        const list: MemberRow[] = [];
        snap.forEach((d) => {
          const m = d.data();
          list.push({ email: d.id, cluster: (m.cluster as string) || '', addedAt: (m.addedAt as Timestamp) || null });
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
      await setDoc(doc(db, 'members', em), { email: em, cluster, addedAt: serverTimestamp() });
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
              <div>
                <Select
                  value={m.cluster}
                  options={CLUSTERS}
                  ariaLabel={`Cluster for ${m.email}`}
                  onChange={(c) => updateDoc(doc(db, 'members', m.email), { cluster: c }).catch(() => {})}
                />
              </div>
              <div><span className="due">{m.addedAt ? m.addedAt.toDate().toLocaleDateString() : '—'}</span></div>
              <div>
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
    </>
  );
}
