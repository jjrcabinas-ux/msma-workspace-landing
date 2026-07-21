'use client';

import { useState } from 'react';

export type BoardKey =
  | 'dashboard'
  | 'tasks'
  | 'tax'
  | 'audit'
  | 'books'
  | 'clients'
  | 'members'
  | 'settings';

const ETM_CLUSTERS: { slug: string; label: string }[] = [
  { slug: 'rpm', label: 'RPM Cluster' },
  { slug: 'ads', label: 'ADS Cluster' },
  { slug: 'vcm', label: 'VCM Cluster' },
  { slug: 'intern', label: 'Interns' },
];

export default function Sidebar({
  board,
  etmCluster,
  isAdmin,
  open,
  onPick,
}: {
  board: BoardKey;
  etmCluster: string | null;
  isAdmin: boolean;
  open: boolean;
  onPick: (b: BoardKey, cluster?: string) => void;
}) {
  const [etmOpen, setEtmOpen] = useState(false);

  const item = (key: BoardKey, label: string, active?: boolean) => (
    <button className={`sb-item${(active ?? board === key) ? ' active' : ''}`} onClick={() => onPick(key)}>
      {label}
    </button>
  );

  return (
    <nav className={`sidebar${open ? ' open' : ''}`}>
      {item('dashboard', 'Dashboard')}
      <button
        className={`sb-item${board === 'tasks' && (!isAdmin || etmCluster === null) ? ' active' : ''}`}
        onClick={() => {
          // Admin: toggles the cluster dropdown; members go straight in —
          // their cluster is already assigned in Members.
          if (isAdmin) setEtmOpen((v) => !v);
          else onPick('tasks');
        }}
      >
        Task Monitoring
        {isAdmin && <span className={`sb-caret${etmOpen ? ' open' : ''}`}>▾</span>}
      </button>
      {isAdmin && (
        <div className={`sb-sub-wrap${etmOpen ? ' open' : ''}`}>
          <div className="sb-sub">
            {ETM_CLUSTERS.map((c) => (
              <button
                key={c.slug}
                className={`sb-item${board === 'tasks' && etmCluster === c.slug ? ' active' : ''}`}
                onClick={() => onPick('tasks', c.slug)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {item('tax', 'Tax Compliance')}
      {item('books', 'Bookkeeping')}
      {item('audit', 'Audit')}
      {item('clients', 'Client Masterlist')}
      {isAdmin && item('members', 'Members')}
    </nav>
  );
}
