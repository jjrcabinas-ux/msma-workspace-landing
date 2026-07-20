'use client';

import { useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile } from '@/lib/types';
import { POSITIONS } from '@/lib/types';
import { initialsOf } from '@/lib/ui';

// Photo approach ported from msma-task-monitor's AvatarUpload:
// canvas cover-crop to a 200px square JPEG data URL.
function resizePhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const S = 200;
      const canvas = document.createElement('canvas');
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext('2d')!;
      const scale = Math.max(S / img.width, S / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.src = url;
  });
}

export default function ProfileModal({
  user,
  initial,
  myLabel,
  onClose,
  onSaved,
}: {
  user: User;
  initial: UserProfile;
  myLabel: string;
  onClose: () => void;
  onSaved: (d: UserProfile) => void;
}) {
  const [fullName, setFullName] = useState(initial.fullName || '');
  const [email, setEmail] = useState(initial.email || user.email || '');
  const [birthdate, setBirthdate] = useState(initial.birthdate || '');
  const [mobile, setMobile] = useState(initial.mobile || '');
  const [position, setPosition] = useState(initial.position || '');
  const [photo, setPhoto] = useState<string | null>(initial.photo || null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setError('');
    const em = email.trim().toLowerCase();
    if (!fullName.trim()) { setError('Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) { setError('Enter a valid email address.'); return; }
    if (!position) { setError('Please select your position.'); return; }
    if (mobile && !/^[0-9+()\-\s]{7,16}$/.test(mobile)) { setError('That mobile number doesn’t look right.'); return; }
    const data: UserProfile = {
      fullName: fullName.trim(),
      email: em,
      birthdate,
      mobile: mobile.trim(),
      position,
      profileComplete: true,
    };
    if (photo) data.photo = photo;
    try {
      await setDoc(doc(db, 'users', user.uid), data, { merge: true });
      onSaved(data);
    } catch {
      setError('Couldn’t save right now — try again.');
    }
  }

  return (
    <div className="uname-overlay">
      <div className="uname-card prof-card" role="dialog" aria-modal="true" aria-labelledby="prof-title">
        <h3 id="prof-title">Update your profile</h3>
        <p>Tell the team who you are — this shows across the workspace.</p>
        <div className="prof-ava-row">
          <div className="prof-ava-wrap">
            <div className="prof-ava" style={photo ? { backgroundImage: `url(${photo})` } : undefined}>
              {photo ? '' : initialsOf(myLabel) || '?'}
            </div>
            <button
              className="prof-ava-badge"
              title="Upload photo"
              aria-label="Upload photo"
              onClick={() => fileRef.current?.click()}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPhoto(await resizePhotoToDataUrl(file));
                e.target.value = '';
              }}
            />
          </div>
          <div className="prof-ava-note">Upload a photo — it’s cropped to a square and shown beside your name.</div>
        </div>
        <div className="prof-grid">
          <div className="prof-field full">
            <label htmlFor="prof-name">Full name</label>
            <input id="prof-name" className="mem-input" autoComplete="name" placeholder="Juan A. Dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="prof-field full">
            <label htmlFor="prof-email">Email</label>
            <input id="prof-email" className="mem-input" type="email" inputMode="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="prof-field">
            <label htmlFor="prof-bday">Birthdate</label>
            <input id="prof-bday" className="mem-input" type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          </div>
          <div className="prof-field">
            <label htmlFor="prof-mobile">Mobile number</label>
            <input id="prof-mobile" className="mem-input" type="tel" inputMode="tel" placeholder="0917 123 4567" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="prof-field full">
            <label htmlFor="prof-pos">Position</label>
            <select id="prof-pos" className="mem-input" value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">Select position…</option>
              {POSITIONS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="mem-error" role="alert" style={{ margin: '12px 0 0' }}>
            {error}
          </div>
        )}
        <div className="uname-actions">
          <button className="tool-new" onClick={save}>Save profile</button>
          <button className="uname-skip" onClick={onClose}>Later</button>
        </div>
      </div>
    </div>
  );
}
