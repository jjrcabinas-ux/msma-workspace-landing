'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsersMap } from '@/lib/types';
import { CLUSTERS } from '@/lib/types';
import { fmtShort, todayISO } from '@/lib/dates';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';

// Settings is a list of entries (more arrive later). The first one, the
// Cluster Directory, opens a standard-format popup: company header, then
// the cluster, then members categorized by position.

const POSITION_ORDER = ['Partner', 'Associate Director', 'Senior Associate', 'Junior Associate'];

type MemberEntry = { email: string; cluster: string };

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

  useEffect(() => {
    return onSnapshot(
      collection(db, 'members'),
      (snap) => {
        const list: MemberEntry[] = [];
        snap.forEach((d) => list.push({ email: d.id, cluster: ((d.data().cluster as string) || '').toUpperCase() }));
        list.sort((a, b) => a.email.localeCompare(b.email));
        setMembers(list);
      },
      () => {}
    );
  }, []);

  const clustersToShow = isAdmin ? [...CLUSTERS] : myCluster ? [myCluster] : [];

  const profileOf = (email: string) => {
    const uid = emailToUid[email];
    return uid ? usersMap[uid] : undefined;
  };

  const row = (email: string, idx: number) => {
    const p = profileOf(email);
    const name = p?.fullName || p?.label || email.split('@')[0];
    return (
      <div className="snap-row" key={email}>
        <Pava photo={p?.photo} label={name} color={empColor(idx)} />
        <div className="snap-body">
          {name}
          <div className="gs-sub">
            {email}
            {p?.mobile ? ` · ${p.mobile}` : ''}
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
      </div>
      <div className="empty-note" style={{ marginTop: 12 }}>
        More settings — roles, preferences, and module options — arrive with the full build.
      </div>

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
              {clustersToShow.map((cl) => {
                const inCluster = members.filter((m) => m.cluster === cl);
                const grouped = POSITION_ORDER.map((pos) => ({
                  pos,
                  rows: inCluster.filter((m) => profileOf(m.email)?.position === pos),
                }));
                const others = inCluster.filter(
                  (m) => !POSITION_ORDER.includes(profileOf(m.email)?.position || '') && profileOf(m.email)
                );
                const unregistered = inCluster.filter((m) => !profileOf(m.email));
                return (
                  <div key={cl}>
                    <div className="dir-clu">
                      {cl === 'INTERN' ? 'Interns' : `${cl} Cluster`} · {inCluster.length} member{inCluster.length === 1 ? '' : 's'}
                    </div>
                    {!inCluster.length && <div className="empty-note">No members in this cluster yet.</div>}
                    {grouped.map(({ pos, rows }) =>
                      rows.length ? (
                        <div key={pos}>
                          <div className="gs-group">{pos}{rows.length > 1 ? 's' : ''}</div>
                          {rows.map((m, i) => row(m.email, i))}
                        </div>
                      ) : null
                    )}
                    {others.length > 0 && (
                      <div>
                        <div className="gs-group">No position set</div>
                        {others.map((m, i) => row(m.email, i + 1))}
                      </div>
                    )}
                    {unregistered.length > 0 && (
                      <div>
                        <div className="gs-group">Not registered yet</div>
                        {unregistered.map((m, i) => row(m.email, i + 2))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
