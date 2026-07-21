'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, isAdminEmail } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { daysBetween, todayISO, weekRange } from '@/lib/dates';
import { useMyTasks } from '@/hooks/useMyTasks';
import { useMyWfh } from '@/hooks/useMyWfh';
import { useUsersMap } from '@/hooks/useUsersMap';
import Topbar from '@/components/Topbar';
import Sidebar, { type BoardKey } from '@/components/Sidebar';
import Etm from '@/components/Etm';
import MembersAdmin from '@/components/MembersAdmin';
import SettingsPage from '@/components/SettingsPage';
import UsernamePrompt from '@/components/UsernamePrompt';
import ProfileModal from '@/components/ProfileModal';

export type EtmTab = 'summary' | 'mine' | 'calendar' | 'interns';

const BOARD_KEYS: BoardKey[] = ['dashboard', 'tasks', 'tax', 'books', 'audit', 'clients', 'members', 'settings'];
const CLUSTER_SLUGS = ['rpm', 'ads', 'vcm', 'intern'];
const ETM_TABS: EtmTab[] = ['summary', 'mine', 'calendar', 'interns'];

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

  // Notifications, computed live from the member's own sheet: a weekly
  // encode reminder plus due-today and overdue nudges. They disappear on
  // their own the moment the user acts (adds a deliverable / marks Done).
  // Personal obligation reminders (weekly encode, WFH, due/overdue) apply
  // to members only — the admin has no sheet duties.
  const personal = !isAdmin;
  const myTasks = useMyTasks(personal ? myEmail : '');
  const myWfh = useMyWfh(personal ? myEmail : '');

  // Admin-sent broadcasts (announcements collection). weekly-encode ones
  // hide themselves for users who already encoded this week.
  type Ann = { id: string; title: string; sub: string; dest: EtmTab; type: string; expires: string };
  const [anns, setAnns] = useState<Ann[]>([]);
  useEffect(() => {
    return onSnapshot(
      collection(db, 'announcements'),
      (snap) => {
        const list: Ann[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            title: (v.title as string) || '',
            sub: (v.sub as string) || '',
            dest: ((v.dest as string) || 'mine') as EtmTab,
            type: (v.type as string) || 'general',
            expires: (v.expires as string) || '9999-12-31',
          });
        });
        setAnns(list);
      },
      () => {}
    );
  }, []);

  const notifs = useMemo(() => {
    const today0 = todayISO();
    const wk0 = weekRange(today0);
    const hasThisWeek0 = myTasks.some((t) => t.date >= wk0.start && t.date <= wk0.end);
    const annList = anns
      .filter((a) => a.title && a.expires >= today0)
      .filter((a) => a.type !== 'weekly-encode' || (personal && !hasThisWeek0))
      .map((a) => ({ id: `ann-${a.id}`, title: a.title, sub: a.sub, dest: a.dest }));
    if (!personal) return annList.slice(0, 8);
    const today = today0;
    const wk = wk0;
    const list: { id: string; title: string; sub: string; dest: EtmTab }[] = [...annList];
    const hasThisWeek = hasThisWeek0;
    const hasWeeklyAnn = anns.some((a) => a.type === 'weekly-encode' && a.expires >= today0);
    if (!hasThisWeek && !hasWeeklyAnn) {
      list.push({
        id: 'week',
        title: 'No deliverables encoded for this week yet',
        sub: 'Add what you’re working on — tap to open My Deliverables.',
        dest: 'mine',
      });
    }
    const hasWfhThisWeek = myWfh.some((d) => d >= wk.start && d <= wk.end);
    if (!hasWfhThisWeek) {
      list.push({
        id: 'wfh',
        title: 'Update your Work From Home schedule',
        sub: 'No WFH dates marked this week — tap to open the calendar.',
        dest: 'calendar',
      });
    }
    myTasks
      .filter((t) => t.status !== 'Done' && t.due === today)
      .forEach((t) =>
        list.push({ id: `due-${t.id}`, title: `“${t.task || '(untitled)'}” is due today`, sub: 'Tap to update its status.', dest: 'mine' })
      );
    myTasks
      .filter((t) => t.status !== 'Done' && t.due && t.due < today)
      .forEach((t) => {
        const n = daysBetween(t.due, today);
        list.push({
          id: `over-${t.id}`,
          title: `“${t.task || '(untitled)'}” is ${n} day${n === 1 ? '' : 's'} overdue`,
          sub: n >= 3 ? 'Status is locked — coordinate with your supervisor.' : 'Tap to update its status.',
          dest: 'mine',
        });
      });
    return list.slice(0, 8);
  }, [personal, myTasks, myWfh, anns]);

  const openTaskTab = useCallback((dest: EtmTab) => {
    setBoard('tasks');
    setEtmCluster(null);
    setEtmTab(dest);
    setSidebarOpen(false);
  }, []);

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
        notifs={notifs}
        onNotifClick={openTaskTab}
        usersMap={usersMap}
        emailToUid={emailToUid}
        onNavigate={(b) => pickBoard(b)}
        onOpenTasks={(clusterUpper) => {
          if (isAdmin && clusterUpper) pickBoard('tasks', clusterUpper.toLowerCase());
          else pickBoard('tasks');
        }}
        onOpenTab={openTaskTab}
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
