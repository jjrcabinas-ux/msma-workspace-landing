'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';

/** Live subscription to the signed-in member's own WFH dates —
 *  powers the daily schedule reminder. Pass '' to disable. */
export function useMyWfh(email: string): string[] {
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    setDates([]);
    if (!email) return;
    return onSnapshot(
      doc(db, 'members', email, 'wfh', 'main'),
      (snap) => {
        setDates((snap.exists() && (snap.data().dates as string[])) || []);
      },
      () => {}
    );
  }, [email]);

  return dates;
}
