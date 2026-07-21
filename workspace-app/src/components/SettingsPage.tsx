'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsersMap } from '@/lib/types';
import { CLUSTERS } from '@/lib/types';
import { empColor } from '@/lib/ui';
import Pava from '@/components/Pava';

// Settings — first live section: the Cluster Directory. Every member sees
// their own cluster's roster, categorized by position (Partner down to
// Junior Associate); the admin sees every cluster.

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
        {p?.position && <span className="dir-pos">{p.position}</span>}
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

      <div className="sum-section-title" style={{ fontSize: '1rem' }}>Cluster Directory</div>
      <div className="sum-sub" style={{ margin: '-4px 0 14px' }}>
        {isAdmin ? 'All clusters, categorized by position.' : 'Your cluster’s members, categorized by position.'}
      </div>

      {!clustersToShow.length && (
        <div className="soonboard">
          <b>No cluster assigned yet</b>Ask the administrator to add your email to a cluster in the Members module.
        </div>
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
          <div className="sum-card" style={{ marginBottom: 14 }} key={cl}>
            <div className="sum-section-title">
              {cl === 'INTERN' ? 'Interns' : `${cl} Cluster`}{' '}
              <span className="gs-sub" style={{ fontWeight: 400 }}>
                — {inCluster.length} member{inCluster.length === 1 ? '' : 's'}
              </span>
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

      <div className="empty-note" style={{ marginTop: 6 }}>
        More settings — roles, preferences, and module options — arrive with the full build.
      </div>
    </>
  );
}
