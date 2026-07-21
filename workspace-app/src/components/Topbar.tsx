'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { initialsOf } from '@/lib/ui';
import type { UsersMap } from '@/lib/types';
import GlobalSearch from '@/components/GlobalSearch';
import type { BoardKey } from '@/components/Sidebar';

export type Notif = { id: string; title: string; sub: string };

export default function Topbar({
  myLabel,
  myEmail,
  isAdmin,
  photo,
  notifs,
  onNotifClick,
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
  notifs: Notif[];
  onNotifClick: () => void;
  usersMap: UsersMap;
  emailToUid: Record<string, string>;
  onNavigate: (board: BoardKey) => void;
  onOpenTasks: (clusterUpper: string) => void;
  onBurger: () => void;
  onOpenProfile: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return;
    const close = () => {
      setMenuOpen(false);
      setNotifOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen, notifOpen]);

  return (
    <header className="topbar">
      <button className="tb-icon tb-burger" aria-label="Toggle sidebar" onClick={onBurger}>☰</button>
      <a className="tb-brand" href="/">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="MSMA logo" /> MSMA Workspace
      </a>
      <GlobalSearch usersMap={usersMap} emailToUid={emailToUid} onNavigate={onNavigate} onOpenTasks={onOpenTasks} />
      <div className="tb-right">
        <button
          className="tb-icon tb-bell"
          title="Notifications"
          aria-label={`Notifications${notifs.length ? ` (${notifs.length})` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(false);
            setNotifOpen((v) => !v);
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
          {notifs.length > 0 && <span className="tb-badge">{notifs.length > 9 ? '9+' : notifs.length}</span>}
        </button>
        <button className="tb-icon" title="Settings" aria-label="Settings" onClick={() => onNavigate('settings')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="avatar"
          aria-label="Account menu"
          style={photo ? { backgroundImage: `url(${photo})` } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setNotifOpen(false);
            setMenuOpen((v) => !v);
          }}
        >
          {photo ? '' : initialsOf(myLabel) || '?'}
        </button>
      </div>
      {notifOpen && (
        <div className="notif-menu" onClick={(e) => e.stopPropagation()}>
          <div className="notif-head">Notifications</div>
          {notifs.length === 0 && <div className="notif-empty">You’re all caught up 🎉</div>}
          {notifs.map((n) => (
            <button
              key={n.id}
              className="notif-item"
              onClick={() => {
                setNotifOpen(false);
                onNotifClick();
              }}
            >
              <span className="notif-dot" />
              <span className="notif-body">
                {n.title}
                <span className="notif-sub">{n.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
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
