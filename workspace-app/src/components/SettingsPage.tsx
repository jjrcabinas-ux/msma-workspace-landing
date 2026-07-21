'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UsersMap } from '@/lib/types';
import { CLUSTERS } from '@/lib/types';
import { MON, fmtShort, todayISO } from '@/lib/dates';

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
              {clustersToShow.map((cl) => clusterSection(cl))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
