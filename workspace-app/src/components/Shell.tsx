'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db, isAdminEmail } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { useUsersMap } from '@/hooks/useUsersMap';
import Topbar from '@/components/Topbar';
import Sidebar, { type BoardKey } from '@/components/Sidebar';
import Etm from '@/components/Etm';
import MembersAdmin from '@/components/MembersAdmin';
import SettingsPage from '@/components/SettingsPage';
import UsernamePrompt from '@/components/UsernamePrompt';
import ProfileModal from '@/components/ProfileModal';

export type EtmTab = 'summary' | 'mine' | 'calendar';

const BOARD_KEYS: BoardKey[] = ['dashboard', 'tasks', 'tax', 'books', 'audit', 'clients', 'members', 'settings'];
const CLUSTER_SLUGS = ['rpm', 'ads', 'vcm', 'intern'];
const ETM_TABS: EtmTab[] = ['summary', 'mine', 'calendar'];

// Hash routing (#tasks/ads/mine) so a refresh restores the last location.
function parseHash(hash: string): { board: BoardKey; cluster: string | null; tab: EtmTab } {
  const parts = hash.replace(/^#/, '').split('/').filter(Boolean);
  const board = BOARD_KEYS.includes(parts[0] as BoardKey) ? (parts[0] as BoardKey) : 'dashboard';
  let cluster: string | null = null;
  let tab: EtmTab = 'summary';
  if (board === 'tasks') {
    for (const p of parts.slice(1)) {
      if (CLUSTER_SLUGS.includes(p)) cluster = p;
      else if (ETM_TABS.includes(p as EtmTab)) tab = p as EtmTab;
    }
  }
  return { board, cluster, tab };
}

const SOON: Partial<Record<BoardKey, { title: string; note: string }>> = {
  // Deliberately parked: the Dashboard gets finalized after all the module
  // tabs are done (Dashboard.tsx holds the earlier draft).
  dashboard: { title: 'Dashboard', note: 'The firm-wide dashboard is being finalized last — module summaries live inside each tab for now.' },
  tax: { title: 'Tax Compliance', note: 'This module is being built next — the BIR filing pipeline will live here.' },
  books: { title: 'Bookkeeping', note: 'This module is being built next — monthly closings and bookkeeping runs will live here.' },
  audit: { title: 'Audit', note: 'This module is being built next — engagement stages across clients will live here.' },
  clients: { title: 'Client Masterlist', note: 'This module is being built next — engagement coverage per client will live here.' },
};

export default function Shell({ user }: { user: User }) {
  const isAdmin = isAdminEmail(user.email);
  const myEmail = (user.email || '').toLowerCase();
  const { usersMap, emailToUid } = useUsersMap();

  const [initial] = useState(() =>
    typeof window !== 'undefined'
      ? parseHash(window.location.hash)
      : { board: 'dashboard' as BoardKey, cluster: null, tab: 'summary' as EtmTab }
  );
  const [board, setBoard] = useState<BoardKey>(initial.board);
  const [etmCluster, setEtmCluster] = useState<string | null>(initial.cluster); // admin-picked, lowercase
  const [etmTab, setEtmTab] = useState<EtmTab>(initial.tab);
  const [myCluster, setMyCluster] = useState<string | null>(null); // from Members registry
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keep the URL hash in sync so refresh (and bookmarks) restore this spot.
  // In-app moves PUSH history entries so the browser Back button walks back
  // through boards/tabs before ever leaving to the landing page; the very
  // first sync replaces so there's no phantom extra entry.
  const hashInit = useRef(false);
  useEffect(() => {
    const parts: string[] = [board];
    if (board === 'tasks') {
      if (isAdmin && etmCluster) parts.push(etmCluster);
      if (etmTab !== 'summary') parts.push(etmTab);
    }
    const h = `#${parts.join('/')}`;
    if (window.location.hash === h) {
      hashInit.current = true;
      return;
    }
    if (!hashInit.current) {
      hashInit.current = true;
      window.history.replaceState(null, '', h);
    } else {
      window.history.pushState(null, '', h);
    }
  }, [board, etmCluster, etmTab, isAdmin]);

  // Back/Forward: restore state from the hash the browser navigated to.
  useEffect(() => {
    const onPop = () => {
      const p = parseHash(window.location.hash);
      setBoard(p.board);
      setEtmCluster(p.cluster);
      setEtmTab(p.tab);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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
    if (b === 'tasks') {
      setEtmCluster(cluster ?? null);
      setEtmTab('summary');
    }
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
        usersMap={usersMap}
        emailToUid={emailToUid}
        onNavigate={(b) => pickBoard(b)}
        onOpenTasks={(clusterUpper) => {
          if (isAdmin && clusterUpper) pickBoard('tasks', clusterUpper.toLowerCase());
          else pickBoard('tasks');
        }}
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
          {board === 'tasks' && (
            <Etm
              cluster={activeCluster}
              clusterKnown={isAdmin ? etmCluster !== null : myCluster !== null}
              isAdmin={isAdmin}
              myEmail={myEmail}
              usersMap={usersMap}
              emailToUid={emailToUid}
              tab={etmTab}
              onTab={setEtmTab}
            />
          )}
          {board === 'settings' && (
            <SettingsPage isAdmin={isAdmin} myCluster={(myCluster || '').toUpperCase()} usersMap={usersMap} emailToUid={emailToUid} />
          )}
          {board === 'members' &&
            (isAdmin ? (
              <MembersAdmin emailToUid={emailToUid} />
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
