'use client';

import { useEffect, useState } from 'react';
import { Timestamp, collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { SheetStatus, SheetTask } from '@/lib/types';
import { toIso } from '@/lib/dates';

/** Live subscription to the signed-in member's own deliverables —
 *  powers the notification bell. Pass '' to disable (not in the registry). */
export function useMyTasks(email: string): SheetTask[] {
  const [tasks, setTasks] = useState<SheetTask[]>([]);

  useEffect(() => {
    setTasks([]);
    if (!email) return;
    return onSnapshot(
      collection(db, 'members', email, 'tasks'),
      (snap) => {
        const list: SheetTask[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            date: (v.date as string) || '',
            task: (v.task as string) || '',
            details: (v.details as string) || '',
            due: v.due instanceof Timestamp ? toIso(v.due.toDate()) : '',
            status: (v.status as SheetStatus) || 'Pending',
            help: (v.help as string) || '',
          });
        });
        setTasks(list);
      },
      () => {}
    );
  }, [email]);

  return tasks;
}
