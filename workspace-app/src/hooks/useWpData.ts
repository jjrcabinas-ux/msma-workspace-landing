'use client';

import { useEffect, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { DraftRecord, Employee, PrevEmp, WtcRecord } from '@/lib/payroll';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Working-paper data for one client. The main wpdata/{clientId} doc holds the
// employee masterlist, the manual-sheet cells, draft adjustments, and the
// annualization extras; the (potentially large) recorded computations and
// saved draft returns live in subcollections so the doc stays small.

export type WpMain = {
  employees: Employee[];
  wtcManual: Record<string, Record<string, string>>;
  wtcDrafts: Record<string, Record<string, string>>;
  annPrev: Record<string, Record<string, PrevEmp>>;
  datRecords: Record<string, Record<string, Record<string, any>>>;
};
const EMPTY: WpMain = { employees: [], wtcManual: {}, wtcDrafts: {}, annPrev: {}, datRecords: {} };

export function useWpData(cluster: string, clientId: string | null) {
  const [main, setMain] = useState<WpMain>(EMPTY);
  const [wtcRecords, setWtcRecords] = useState<WtcRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);

  useEffect(() => {
    setMain(EMPTY);
    setWtcRecords([]);
    setDrafts([]);
    if (!clientId) return;
    const u1 = onSnapshot(
      doc(db, 'wpdata', clientId),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const v = snap.exists() ? snap.data() : {};
        setMain({
          employees: (v.employees as Employee[]) || [],
          wtcManual: (v.wtcManual as WpMain['wtcManual']) || {},
          wtcDrafts: (v.wtcDrafts as WpMain['wtcDrafts']) || {},
          annPrev: (v.annPrev as WpMain['annPrev']) || {},
          datRecords: (v.datRecords as WpMain['datRecords']) || {},
        });
      },
      () => {}
    );
    const u2 = onSnapshot(
      collection(db, 'wpdata', clientId, 'wtcRecords'),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const list: WtcRecord[] = [];
        snap.forEach((d) => list.push(d.data() as WtcRecord));
        setWtcRecords(list);
      },
      () => {}
    );
    const u3 = onSnapshot(
      collection(db, 'wpdata', clientId, 'drafts'),
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        const list: DraftRecord[] = [];
        snap.forEach((d) => list.push(d.data() as DraftRecord));
        setDrafts(list);
      },
      () => {}
    );
    return () => { u1(); u2(); u3(); };
  }, [clientId]);

  // Optimistic partial update of the main doc.
  function patchMain(patch: Partial<WpMain>) {
    if (!clientId) return;
    setMain((s) => ({ ...s, ...patch }));
    setDoc(doc(db, 'wpdata', clientId), { cluster, clientId, ...patch }, { merge: true }).catch(() => {});
  }
  function addWtcRecord(rec: WtcRecord) {
    if (!clientId) return;
    setWtcRecords((s) => [...s, rec]);
    setDoc(doc(db, 'wpdata', clientId, 'wtcRecords', rec.id), rec).catch(() => {});
  }
  function addDraft(d: DraftRecord) {
    if (!clientId) return;
    setDrafts((s) => [...s, d]);
    setDoc(doc(db, 'wpdata', clientId, 'drafts', d.id), d).catch(() => {});
  }
  function removeWtcRecord(id: string) {
    if (!clientId) return;
    setWtcRecords((s) => s.filter((r) => r.id !== id));
    deleteDoc(doc(db, 'wpdata', clientId, 'wtcRecords', id)).catch(() => {});
  }

  return { main, wtcRecords, drafts, patchMain, addWtcRecord, addDraft, removeWtcRecord };
}
