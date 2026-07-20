'use client';

import { useState } from 'react';
import type { User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** One-time username prompt for accounts created before the username system. */
export default function UsernamePrompt({
  user,
  onDone,
}: {
  user: User;
  onDone: (saved: { username?: string }) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  async function save() {
    setError('');
    const uname = value.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(uname)) {
      setError('3–20 characters: letters, numbers, dots, dashes, or underscores.');
      return;
    }
    try {
      const ref = doc(db, 'usernames', uname);
      const existing = await getDoc(ref);
      if (existing.exists() && existing.data().uid !== user.uid) {
        setError('That username is already taken — try another.');
        return;
      }
      await setDoc(ref, { uid: user.uid, email: user.email });
      await setDoc(doc(db, 'users', user.uid), { username: uname, email: user.email }, { merge: true });
      onDone({ username: uname });
    } catch {
      setError('Couldn’t save right now — try again.');
    }
  }

  return (
    <div className="uname-overlay">
      <div className="uname-card" role="dialog" aria-modal="true" aria-labelledby="uname-title">
        <h3 id="uname-title">Choose your username</h3>
        <p>Your account doesn’t have a username yet. Pick one to use for signing in (you can always use your email too).</p>
        <input
          className="mem-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={20}
          placeholder="e.g. jcabs"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
        {error && (
          <div className="mem-error" role="alert" style={{ margin: '12px 0 0' }}>
            {error}
          </div>
        )}
        <div className="uname-actions">
          <button className="tool-new" onClick={save}>Save username</button>
          <button className="uname-skip" onClick={() => onDone({})}>Later</button>
        </div>
      </div>
    </div>
  );
}
