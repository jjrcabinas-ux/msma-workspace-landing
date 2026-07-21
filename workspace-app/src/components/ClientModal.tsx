'use client';

import { useState } from 'react';
import { Timestamp, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client, ClientContact } from '@/lib/types';
import { TAX_TYPES } from '@/lib/types';
import { corTextFromFile, parseCorText } from '@/lib/cor';
import { newTaskId } from '@/lib/ui';

// Add / edit client — mirrors the tax compliance system's client modal,
// including the Upload COR flow: the 2303 is read in-browser to auto-fill
// the fields and is never saved anywhere.

export default function ClientModal({
  cluster,
  initial,
  onClose,
}: {
  cluster: string;
  initial: Client | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [tin, setTin] = useState(initial?.tin || '');
  const [rdo, setRdo] = useState(initial?.rdo || '');
  const [channel, setChannel] = useState<Client['channel']>(initial?.channel || '');
  const [taxTypes, setTaxTypes] = useState<Record<string, boolean>>(initial?.taxTypes || {});
  const [preparer, setPreparer] = useState(initial?.preparer || '');
  const [reviewer, setReviewer] = useState(initial?.reviewer || '');
  const [contacts, setContacts] = useState<ClientContact[]>(
    initial?.contacts?.length ? initial.contacts : [{ name: '', position: '', phone: '', email: '' }]
  );
  const [corStatus, setCorStatus] = useState('');
  const [corBusy, setCorBusy] = useState(false);
  const [error, setError] = useState('');

  function setContact(i: number, patch: Partial<ClientContact>) {
    setContacts((list) => list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  async function handleCorUpload(input: HTMLInputElement) {
    const file = input.files && input.files[0];
    input.value = ''; // allow re-picking the same file
    if (!file) return;
    setCorBusy(true);
    setCorStatus('Reading the file…');
    try {
      const text = await corTextFromFile(file, setCorStatus); // file lives only in memory
      const r = parseCorText(text);
      if (!r.found.length) {
        setCorStatus('Couldn’t read the details automatically — please enter them manually. (The file was not saved.)');
        return;
      }
      // COR is authoritative — overwrite so a re-upload refreshes the fields
      if (r.name) setName(r.name);
      if (r.address) setAddress(r.address);
      if (r.tin) setTin(r.tin);
      if (r.rdo) setRdo(r.rdo);
      setTaxTypes((t) => ({ ...t, ...r.taxTypes }));
      setCorStatus(`Captured: ${r.found.join(' · ')}. Please verify against the COR, then Save. (The file was not saved.)`);
    } catch {
      setCorStatus('Couldn’t process that file — check it’s a clear COR/2303 PDF or image, or enter details manually. (Nothing was saved.)');
    } finally {
      setCorBusy(false);
    }
  }

  async function save() {
    setError('');
    if (!name.trim()) {
      setError('Client name is required.');
      return;
    }
    const id = initial?.id || `c${newTaskId()}`;
    try {
      await setDoc(doc(db, 'clients', id), {
        cluster,
        name: name.trim(),
        tin: tin.trim(),
        rdo: rdo.trim(),
        address: address.trim(),
        channel,
        preparer: preparer.trim(),
        reviewer: reviewer.trim(),
        contacts: contacts.filter((c) => c.name || c.position || c.phone || c.email),
        taxTypes,
        ...(initial ? {} : { createdAt: Timestamp.now() }),
      }, { merge: true });
      onClose();
    } catch {
      setError('Couldn’t save right now — try again.');
    }
  }

  async function removeClient() {
    if (!initial) return;
    if (!confirm(`Delete "${initial.name}" from the ${cluster} Cluster masterlist?`)) return;
    await deleteDoc(doc(db, 'clients', initial.id)).catch(() => {});
    onClose();
  }

  return (
    <div
      className="uname-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {corBusy && (
        <div className="scan-overlay" role="status" aria-live="polite">
          <div className="scan-card">
            <div className="scan-doc">
              <span className="scan-beam" />
            </div>
            <div className="scan-title">Scanning COR…</div>
            <div className="scan-status">{corStatus}</div>
          </div>
        </div>
      )}
      <div className="uname-card client-card" role="dialog" aria-modal="true" aria-labelledby="cl-title">
        <h3 id="cl-title">{initial ? 'Edit client' : 'Add client'}</h3>
        <div className="cor-note">
          ⓘ All information must be based on the client’s <b>latest Certificate of Registration (BIR Form 2303)</b>.
        </div>
        <div className="prof-grid">
          <div className="prof-field full">
            <label>Registered name</label>
            <input className="mem-input" placeholder="e.g. ABC Trading Corp." value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="prof-field full">
            <label>Registered business address</label>
            <input className="mem-input" placeholder="As shown on the 2303" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>TIN</label>
            <input className="mem-input" inputMode="numeric" maxLength={15} placeholder="000-000-000-000" value={tin} onChange={(e) => setTin(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>RDO code</label>
            <input className="mem-input" placeholder="e.g. 081" value={rdo} onChange={(e) => setRdo(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>Filing channel</label>
            <div className="txp-row">
              {(['eBIR', 'eFPS'] as const).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={`txp${channel === ch ? ' on' : ''}`}
                  onClick={() => setChannel(channel === ch ? '' : ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field full">
            <label>Applicable tax types</label>
            <div className="txp-row">
              {TAX_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`txp${taxTypes[t] ? ' on' : ''}`}
                  onClick={() => setTaxTypes((s) => ({ ...s, [t]: !s[t] }))}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="prof-field">
            <label>Junior Associate In-charge</label>
            <input className="mem-input" placeholder="Staff name" value={preparer} onChange={(e) => setPreparer(e.target.value)} />
          </div>
          <div className="prof-field">
            <label>Senior Associate in-charge / Team Leader</label>
            <input className="mem-input" placeholder="Senior / team leader" value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
          </div>
          <div className="prof-field full">
            <label>Client Contact Person(s)</label>
            {contacts.map((c, i) => (
              <div className="ctr" key={i}>
                <input className="mem-input" placeholder="Name" value={c.name} onChange={(e) => setContact(i, { name: e.target.value })} />
                <input className="mem-input" placeholder="Position" value={c.position} onChange={(e) => setContact(i, { position: e.target.value })} />
                <input className="mem-input" placeholder="Contact No." value={c.phone} onChange={(e) => setContact(i, { phone: e.target.value })} />
                <input className="mem-input" placeholder="Email address" value={c.email} onChange={(e) => setContact(i, { email: e.target.value })} />
                <button type="button" className="ctr-del" title="Remove contact" onClick={() => setContacts((l) => l.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <button
              type="button"
              className="ctr-add"
              onClick={() => setContacts((l) => [...l, { name: '', position: '', phone: '', email: '' }])}
            >
              + Add contact person
            </button>
          </div>
        </div>
        {corStatus && <div className="cor-status" role="status">{corStatus}</div>}
        {error && <div className="mem-error" role="alert" style={{ margin: '12px 0 0' }}>{error}</div>}
        <div className="uname-actions" style={{ flexWrap: 'wrap' }}>
          {initial && (
            <button className="mem-del" style={{ marginRight: 'auto' }} onClick={removeClient}>Delete client</button>
          )}
          <button className="uname-skip" disabled={corBusy} onClick={() => document.getElementById('cor-file')?.click()}
            title="Read a COR / BIR 2303 to auto-fill the fields — the file is not saved">
            ⬆ Upload COR
          </button>
          <input
            type="file"
            id="cor-file"
            accept="application/pdf,image/*"
            hidden
            onChange={(e) => handleCorUpload(e.target)}
          />
          <button className="uname-skip" onClick={onClose}>Cancel</button>
          <button className="tool-new" onClick={save}>Save client</button>
        </div>
      </div>
    </div>
  );
}
