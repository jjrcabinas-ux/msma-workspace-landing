'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, isAdminEmail } from '@/lib/firebase';
import Shell from '@/components/Shell';

function Gate() {
  return (
    <div id="gate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="MSMA logo" />
      <div className="msg">Loading your workspace…</div>
    </div>
  );
}

/** Auth gate: admin enters directly; everyone else must be in the Members registry. */
export default function Workspace() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) {
        window.location.replace('/');
        return;
      }
      const em = (u.email || '').toLowerCase();
      if (isAdminEmail(em)) {
        setUser(u);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'members', em));
        if (snap.exists()) {
          setUser(u);
        } else {
          await signOut(auth);
          window.location.replace('/');
        }
      } catch {
        window.location.replace('/');
      }
    });
  }, []);

  if (!user) return <Gate />;
  return <Shell user={user} />;
}
