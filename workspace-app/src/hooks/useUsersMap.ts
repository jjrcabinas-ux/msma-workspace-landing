'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UsersMap } from '@/lib/types';

/** Live map of uid -> {label, photo, email} from the staff-readable users collection. */
export function useUsersMap(): { usersMap: UsersMap; emailToUid: Record<string, string> } {
  const [usersMap, setUsersMap] = useState<UsersMap>({});
  const [emailToUid, setEmailToUid] = useState<Record<string, string>>({});

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const map: UsersMap = {};
        const emails: Record<string, string> = {};
        snap.forEach((d) => {
          const u = d.data() as UserProfile;
          const email = (u.email || '').toLowerCase();
          map[d.id] = {
            label: u.username || u.fullName || u.email || d.id.slice(0, 6),
            photo: u.photo || null,
            email,
          };
          if (email) emails[email] = d.id;
        });
        setUsersMap(map);
        setEmailToUid(emails);
      },
      () => {
        /* labels are cosmetic — ignore */
      }
    );
  }, []);

  return { usersMap, emailToUid };
}
