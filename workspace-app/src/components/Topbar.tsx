'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { initialsOf } from '@/lib/ui';
import type { UsersMap } from '@/lib/types';
import GlobalSearch from '@/components/GlobalSearch';
import type { BoardKey } from '@/components/Sidebar';

export default function Topbar({
  myLabel,
  myEmail,
  isAdmin,
  photo,
  usersMap,
  emailToUid,
  onNavigate,
  onOpenTasks,
  onBurger,
  onOpenProfile,
}: {
  myLabel: string;
  myEmail: string;
  isAdmin: boolean;
  photo: string | null;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  onNavigate: (board: BoardKey) => void;
  onOpenTasks: (clusterUpper: string) => void;
  onBurger: () => void;
  onOpenProfile: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  return (
    <header className="topbar">
      <button className="tb-icon tb-burger" aria-label="Toggle sidebar" onClick={onBurger}>☰</button>
      <a className="tb-brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MSMA logo" /> MSMA Workspace
      </a>
      <GlobalSearch usersMap={usersMap} emailToUid={emailToUid} onNavigate={onNavigate} onOpenTasks={onOpenTasks} />
      <div className="tb-right">
        <button className="tb-icon" title="Notifications" aria-label="Notifications">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </button>
        <button
          className="avatar"
          aria-label="Account menu"
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
        >
          {photo ? '' : initialsOf(myLabel) || '?'}
        </button>
      </div>
      {menuOpen && (
        <div className="avatar-menu" ref={menuRef}>
          <div className="who">
            <b>{myLabel}{isAdmin ? ' · Admin' : ''}</b>
            <span>{myEmail}</span>
          </div>
          <button onClick={onOpenProfile}>My profile</button>
          <button
            onClick={() => {
              signOut(auth).then(() => window.location.replace('/'));
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
