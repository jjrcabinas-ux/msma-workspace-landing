'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, isAdminEmail } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { useUsersMap } from '@/hooks/useUsersMap';
import Topbar from '@/components/Topbar';
import Sidebar, { type BoardKey } from '@/components/Sidebar';
import Dashboard from '@/components/Dashboard';
import Etm from '@/components/Etm';
import MembersAdmin from '@/components/MembersAdmin';
import UsernamePrompt from '@/components/UsernamePrompt';
import ProfileModal from '@/components/ProfileModal';

const SOON: Partial<Record<BoardKey, { title: string; note: string }>> = {
  tax: { title: 'Tax Compliance System', note: 'This module is being built next — the BIR filing pipeline will live here.' },
  audit: { title: 'Audit', note: 'This module is being built next — engagement stages across clients will live here.' },
  books: { title: 'Bookkeeping', note: 'This module is being built next — monthly closings and bookkeeping runs will live here.' },
  clients: { title: 'Client Masterlist', note: 'This module is being built next — engagement coverage per client will live here.' },
  settings: { title: 'Settings', note: 'Workspace settings — user roles, clusters, and module preferences — arrive with the full build.' },
};

export default function Shell({ user }: { user: User }) {
  const isAdmin = isAdminEmail(user.email);
  const myEmail = (user.email || '').toLowerCase();
  const { usersMap, emailToUid } = useUsersMap();

  const [board, setBoard] = useState<BoardKey>('dashboard');
  const [etmCluster, setEtmCluster] = useState<string | null>(null); // admin-picked, lowercase
  const [myCluster, setMyCluster] = useState<string | null>(null); // from Members registry
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState('');

  const [profile, setProfile] = useState<UserProfile>({});
  const [showUname, setShowUname] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  // Post-login flow: username prompt first (legacy accounts), then the
  // profile modal until the profile is completed.
  useEffect(() => {
    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        const d = snap.exists() ? (snap.data() as UserProfile) : {};
        setProfile(d);
        if (!d.username) setShowUname(true);
        else if (!d.profileComplete) setShowProfile(true);
      })
      .catch(() => {});
  }, [user.uid]);

  // Member cluster assignment from the Members registry.
  useEffect(() => {
    if (isAdmin) return;
    getDoc(doc(db, 'members', myEmail))
      .then((snap) => setMyCluster((snap.exists() && (snap.data().cluster as string)) || ''))
      .catch(() => setMyCluster(''));
  }, [isAdmin, myEmail]);

  const myLabel = profile.fullName || user.displayName || myEmail.split('@')[0];
  const myPhoto = profile.photo || usersMap[user.uid]?.photo || null;

  const pickBoard = useCallback((b: BoardKey, cluster?: string) => {
    setBoard(b);
    if (b === 'tasks') setEtmCluster(cluster ?? null);
    setSidebarOpen(false);
  }, []);

  const activeCluster = useMemo(
    () => ((isAdmin ? etmCluster : myCluster) || '').toUpperCase(),
    [isAdmin, etmCluster, myCluster]
  );

  const soon = SOON[board];

  return (
    <>
      <Topbar
        myLabel={myLabel}
        myEmail={myEmail}
        isAdmin={isAdmin}
        photo={myPhoto}
        search={search}
        onSearch={setSearch}
        onBurger={() => setSidebarOpen((v) => !v)}
        onOpenProfile={() => {
          getDoc(doc(db, 'users', user.uid))
            .then((snap) => {
              setProfile(snap.exists() ? (snap.data() as UserProfile) : {});
              setShowProfile(true);
            })
            .catch(() => setShowProfile(true));
        }}
      />
      <div className="shell">
        <Sidebar board={board} etmCluster={etmCluster} isAdmin={isAdmin} open={sidebarOpen} onPick={pickBoard} />
        <main className="main">
          {board === 'dashboard' && (
            <Dashboard user={user} usersMap={usersMap} myLabel={myLabel} onOpenTasks={() => pickBoard('tasks')} />
          )}
          {board === 'tasks' && (
            <Etm
              cluster={activeCluster}
              clusterKnown={isAdmin ? etmCluster !== null : myCluster !== null}
              isAdmin={isAdmin}
              myEmail={myEmail}
              usersMap={usersMap}
              emailToUid={emailToUid}
              search={search}
            />
          )}
          {board === 'members' &&
            (isAdmin ? (
              <MembersAdmin />
            ) : (
              <>
                <div className="board-head"><h1>Members</h1></div>
                <div style={{ height: 20 }} />
                <div className="soonboard"><b>Admins only</b>This page is restricted to the workspace administrator.</div>
              </>
            ))}
          {soon && (
            <>
              <div className="board-head"><h1>{soon.title}</h1></div>
              <div className="board-tabs" />
              <div style={{ height: 20 }} />
              <div className="soonboard"><b>{soon.title} is coming soon</b>{soon.note}</div>
            </>
          )}
        </main>
      </div>

      {showUname && (
        <UsernamePrompt
          user={user}
          onDone={(saved) => {
            setShowUname(false);
            if (saved.username) setProfile((p) => ({ ...p, username: saved.username }));
            if (!profile.profileComplete) setShowProfile(true);
          }}
        />
      )}
      {showProfile && (
        <ProfileModal
          user={user}
          initial={profile}
          myLabel={myLabel}
          onClose={() => setShowProfile(false)}
          onSaved={(d) => {
            setProfile((p) => ({ ...p, ...d }));
            setShowProfile(false);
          }}
        />
      )}
    </>
  );
}
