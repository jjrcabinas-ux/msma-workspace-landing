'use client';

import { useRef, useState } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { SheetStatus, SheetTask } from '@/lib/types';
import { fmtShort } from '@/lib/dates';
import { initialsOf, resizePhotoToDataUrl } from '@/lib/ui';
import ListModal from '@/components/ListModal';

// Profile header for My Deliverables, ported from the msma-task-monitor
// employee page: big avatar with a camera badge, name + stat line, an
// Add Deliverable action, and the segmented stats bar whose Done /
// Ongoing / Pending blocks open a task list modal.

const STAT_CONFIG: { key: SheetStatus; color: string }[] = [
  { key: 'Done', color: 'var(--lime)' },
  { key: 'Ongoing', color: 'var(--blue)' },
  { key: 'Pending', color: 'var(--amber)' },
];

export default function EtmProfile({
  label,
  email,
  photo,
  tasks,
  rank,
  onAddTask,
}: {
  label: string;
  email: string;
  photo: string | null;
  tasks: SheetTask[];
  rank: number;
  onAddTask: () => void;
}) {
  const [openStatus, setOpenStatus] = useState<SheetStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const counts: Record<SheetStatus, number> = { Pending: 0, Ongoing: 0, Done: 0 };
  tasks.forEach((t) => counts[t.status]++);
  const total = tasks.length;
  const pct = total ? Math.round((counts.Done / total) * 100) : 0;
  const seg = (n: number) => (total ? (n / total) * 100 : 0);
  const matching = openStatus ? tasks.filter((t) => t.status === openStatus) : [];

  async function handlePhoto(file: File) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setSaving(true);
    const dataUrl = await resizePhotoToDataUrl(file);
    await setDoc(doc(db, 'users', uid), { photo: dataUrl }, { merge: true }).catch(() => {});
    setSaving(false);
  }

  return (
    <>
      <div className="prof-head">
        <div className="prof-id">
          <div className="prof-big">
            <div className="prof-big-ava" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
              {photo ? '' : initialsOf(label) || '?'}
            </div>
            <button
              className="prof-ava-badge"
              title="Change photo"
              aria-label="Change photo"
              disabled={saving}
              onClick={() => fileRef.current?.click()}
            >
              {saving ? (
                '…'
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handlePhoto(f);
                e.target.value = '';
              }}
            />
          </div>
          <div>
            <h2 className="prof-h1">{label}</h2>
            <div className="prof-sub">
              <b>{total}</b> task{total === 1 ? '' : 's'} · <b>{pct}%</b> completion rate · <b>#{rank}</b> leaderboard
            </div>
            <div className="etm-emp-sub">{email}</div>
          </div>
        </div>
        <button className="tool-new" onClick={onAddTask}>+ Add Deliverable</button>
      </div>

      <div className="sum-card" style={{ marginBottom: 16 }}>
        <div className="stack-bar" style={{ margin: '0 0 10px' }}>
          {counts.Done > 0 && <div style={{ width: `${seg(counts.Done)}%`, background: 'var(--lime)' }} />}
          {counts.Ongoing > 0 && <div style={{ width: `${seg(counts.Ongoing)}%`, background: 'var(--blue)' }} />}
          {counts.Pending > 0 && <div style={{ width: `${seg(counts.Pending)}%`, background: 'var(--amber)' }} />}
        </div>
        <div className="stat-blocks">
          {STAT_CONFIG.map((s) => (
            <button key={s.key} type="button" className="stat-block" onClick={() => setOpenStatus(s.key)}>
              <div className="stat-label">{s.key}</div>
              <div className="stat-value" style={{ color: s.color }}>{counts[s.key]}</div>
            </button>
          ))}
        </div>
      </div>

      {openStatus && (
        <ListModal title={`${openStatus} (${matching.length})`} onClose={() => setOpenStatus(null)}>
          {matching.length === 0 && <div className="empty-note">No {openStatus.toLowerCase()} deliverables.</div>}
          {matching.map((t) => (
            <div className="snap-row" key={t.id}>
              <div className="snap-body">
                {t.task || '(untitled)'}
                <div className="gs-sub">
                  {t.date ? fmtShort(t.date) : 'No date'}
                  {t.due ? ` · Due ${fmtShort(t.due)}` : ''}
                </div>
              </div>
            </div>
          ))}
        </ListModal>
      )}
    </>
  );
}
