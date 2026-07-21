'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Client } from '@/lib/types';
import { TAX_TYPES } from '@/lib/types';
import { MONFULL, todayISO } from '@/lib/dates';
import { REPORT_FIELDS, fieldValue, generateClientsPdf, generateClientsXlsx } from '@/lib/reportExport';
import ClientModal from '@/components/ClientModal';
import ListModal from '@/components/ListModal';
import Select from '@/components/Select';

// Client Masterlist — ported from the tax compliance system: search,
// channel filter, add/edit with the Upload COR auto-fill, per cluster.

const HOME_CLUSTERS = ['RPM', 'VCM', 'ADS'];
const CHANNEL_FILTERS = ['All channels', 'eBIR', 'eFPS'];

export default function ClientMasterlist({
  isAdmin,
  myCluster,
}: {
  isAdmin: boolean;
  myCluster: string; // uppercase, '' when unassigned
}) {
  const memberCluster = HOME_CLUSTERS.includes(myCluster) ? myCluster : myCluster === 'INTERN' ? '' : myCluster;
  const [adminCluster, setAdminCluster] = useState(HOME_CLUSTERS[0]);
  const cluster = isAdmin ? adminCluster : memberCluster;

  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const [chan, setChan] = useState('All channels');
  const [editing, setEditing] = useState<Client | null | 'new'>(null);
  const [viewing, setViewing] = useState<Client | null>(null);
  const [repOpen, setRepOpen] = useState(false);
  const [repFields, setRepFields] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(REPORT_FIELDS.map((f) => [f.key, true]))
  );
  const [repPreview, setRepPreview] = useState(false);
  const [repBusy, setRepBusy] = useState('');
  const [repError, setRepError] = useState('');

  // Deep link from the global search: an admin clicking a client hit lands
  // on that client's cluster.
  useEffect(() => {
    if (!isAdmin) return;
    const h = (e: Event) => {
      const v = (e as CustomEvent).detail as string;
      if (HOME_CLUSTERS.includes(v)) setAdminCluster(v);
    };
    window.addEventListener('msma-clients-cluster', h);
    return () => window.removeEventListener('msma-clients-cluster', h);
  }, [isAdmin]);

  // Close the report dropdown on outside clicks only — clicks inside it
  // (toggling the field checkboxes) must keep it open.
  const repRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!repOpen) return;
    const close = (e: MouseEvent) => {
      if (repRef.current && e.target instanceof Node && repRef.current.contains(e.target)) return;
      setRepOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [repOpen]);

  useEffect(() => {
    setClients([]);
    if (!cluster) return;
    return onSnapshot(
      query(collection(db, 'clients'), where('cluster', '==', cluster)),
      (snap) => {
        const list: Client[] = [];
        snap.forEach((d) => {
          const v = d.data();
          list.push({
            id: d.id,
            cluster: (v.cluster as string) || '',
            name: (v.name as string) || '',
            tin: (v.tin as string) || '',
            rdo: (v.rdo as string) || '',
            address: (v.address as string) || '',
            channel: (v.channel as Client['channel']) || '',
            preparer: (v.preparer as string) || '',
            reviewer: (v.reviewer as string) || '',
            contacts: (v.contacts as Client['contacts']) || [],
            taxTypes: (v.taxTypes as Record<string, boolean>) || {},
          });
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setClients(list);
      },
      () => {}
    );
  }, [cluster]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return clients
      .filter((c) => chan === 'All channels' || c.channel === chan)
      .filter((c) => !q || `${c.name} ${c.tin} ${c.preparer} ${c.reviewer}`.toLowerCase().includes(q));
  }, [clients, search, chan]);

  const taxCount = (c: Client) => Object.values(c.taxTypes).filter(Boolean).length;

  if (!cluster) {
    return (
      <>
        <div className="board-head"><h1>Client Masterlist</h1></div>
        <div style={{ height: 20 }} />
        <div className="soonboard">
          <b>No cluster assigned yet</b>Ask the administrator to add your email to a cluster in the Members module.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="board-head">
        <h1>Client Masterlist</h1>
        <div className="desc">
          {filtered.length} client{filtered.length === 1 ? '' : 's'} in the {cluster} Cluster · click a row to view details
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 16 }}>
        <div className="etm-search" style={{ marginLeft: 0, flex: 1, maxWidth: 420 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            placeholder="Search client, TIN, or staff…"
            aria-label="Search clients"
            style={{ width: '100%' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={chan} options={CHANNEL_FILTERS} onChange={setChan} ariaLabel="Filter by channel" />
        {isAdmin && <Select value={adminCluster} options={HOME_CLUSTERS} onChange={setAdminCluster} ariaLabel="Cluster" />}
        <button className="tool-new" onClick={() => setEditing('new')}>+ Add client</button>
        <div className="rep-wrap" style={{ marginLeft: 'auto' }} ref={repRef}>
          <button className="uname-skip" onClick={(e) => { e.stopPropagation(); setRepOpen((v) => !v); }}>
            ⎙ Generate report
          </button>
          {repOpen && (
            <div className="rep-pop" onClick={(e) => e.stopPropagation()}>
              <div className="rep-title">Include in the report</div>
              {REPORT_FIELDS.map((f) => (
                <button
                  key={f.key}
                  className={`rep-opt${repFields[f.key] ? ' on' : ''}`}
                  onClick={() => setRepFields((s) => ({ ...s, [f.key]: !s[f.key] }))}
                >
                  <span className="rep-check">✓</span>
                  {f.label}
                </button>
              ))}
              <div className="rep-note">
                Covers the {filtered.length} client{filtered.length === 1 ? '' : 's'} currently shown (search and channel filters apply).
              </div>
              <button
                className="tool-new"
                style={{ width: '100%', marginTop: 10 }}
                disabled={!filtered.length}
                onClick={() => {
                  setRepOpen(false);
                  setRepError('');
                  setRepPreview(true);
                }}
              >
                Proceed
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="cl-table">
        <div className="cl-row head">
          <div>Client</div><div>Channel</div><div>Tax types</div><div>Assigned</div><div>Contact person</div>
        </div>
        {filtered.length ? (
          filtered.map((c) => (
            <button className="cl-row item" key={c.id} onClick={() => setViewing(c)}>
              <div>
                <div className="cl-name">{c.name}</div>
                <div className="cl-sub">TIN {c.tin || '—'}</div>
              </div>
              <div>{c.channel ? <span className={`chan-chip ${c.channel === 'eBIR' ? 'ebir' : 'efps'}`}>{c.channel}</span> : '—'}</div>
              <div>{taxCount(c) ? <span className="tt-chip">{taxCount(c)} tax type{taxCount(c) === 1 ? '' : 's'}</span> : '—'}</div>
              <div>
                <div className="cl-name" style={{ fontWeight: 500 }}>{c.preparer || '—'}</div>
                {c.reviewer && <div className="cl-sub">Reviewer: {c.reviewer}</div>}
              </div>
              <div>{c.contacts[0]?.name ? <span className="ct-link">{c.contacts[0].name}</span> : '—'}</div>
            </button>
          ))
        ) : (
          <div className="cl-row item empty">
            <div className="cl-sub" style={{ gridColumn: '1 / -1' }}>
              No clients yet — add the first one with the button above (Upload COR auto-fills the details).
            </div>
          </div>
        )}
      </div>

      {viewing && (
        <ListModal className="dir-modal" title={viewing.name} onClose={() => setViewing(null)}>
          <div className="mprof-rows">
            <div className="mprof-row"><span>TIN</span><b>{viewing.tin || '—'}</b></div>
            <div className="mprof-row"><span>RDO code</span><b>{viewing.rdo || '—'}</b></div>
            <div className="mprof-row"><span>Registered address</span><b>{viewing.address || '—'}</b></div>
            <div className="mprof-row"><span>Filing channel</span><b>{viewing.channel || '—'}</b></div>
            <div className="mprof-row">
              <span>Tax types</span>
              <b>{TAX_TYPES.filter((t) => viewing.taxTypes[t]).join(', ') || '—'}</b>
            </div>
            <div className="mprof-row"><span>Junior Associate</span><b>{viewing.preparer || '—'}</b></div>
            <div className="mprof-row"><span>Senior / Team Leader</span><b>{viewing.reviewer || '—'}</b></div>
          </div>
          {viewing.contacts.length > 0 && (
            <>
              <div className="gs-group">Contact person{viewing.contacts.length === 1 ? '' : 's'}</div>
              {viewing.contacts.map((ct, i) => (
                <div className="snap-row" key={i}>
                  <div className="snap-body">
                    {ct.name || '(unnamed)'}
                    <div className="gs-sub">
                      {[ct.position, ct.phone, ct.email].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          <button
            className="tool-new"
            style={{ width: '100%', marginTop: 14 }}
            onClick={() => {
              setEditing(viewing);
              setViewing(null);
            }}
          >
            Edit client
          </button>
        </ListModal>
      )}

      {editing && (
        <ClientModal cluster={cluster} initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}

      {repPreview && (() => {
        const sel = REPORT_FIELDS.filter((f) => repFields[f.key]);
        const t = todayISO().split('-').map(Number);
        const asOf = `${MONFULL[t[1] - 1]} ${t[2]}, ${t[0]}`;
        return (
          <div
            className="cal-overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget && !repBusy) setRepPreview(false);
            }}
          >
            <div className="cal-modal dir-modal" role="dialog" aria-modal="true" aria-label="Client Masterlist report preview">
              <div className="dir-head">
                <div style={{ flex: 1 }}>
                  <div className="dir-firm">Report preview</div>
                  <div className="dir-subtitle">A4 · Client Masterlist — {cluster} Cluster · {filtered.length} client{filtered.length === 1 ? '' : 's'}</div>
                </div>
                <button className="cal-modal-close" aria-label="Close" onClick={() => setRepPreview(false)}>×</button>
              </div>
              <div className="cal-modal-body">
                <div className="a4-paper">
                  <div className="a4-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo.png" alt="MSMA logo" />
                    <div>
                      <div className="a4-firm">Mora Sanchez Meñoza &amp; Associates</div>
                      <div className="a4-subtitle">Certified Public Accountants</div>
                    </div>
                  </div>
                  <div className="a4-band">CLIENT MASTERLIST — {cluster} CLUSTER · AS OF {asOf.toUpperCase()}</div>
                  <div className="a4-scroll">
                    <table className="a4-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          {sel.map((f) => <th key={f.key}>{f.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((c) => (
                          <tr key={c.id}>
                            <td><b>{c.name}</b></td>
                            {sel.map((f) => <td key={f.key}>{fieldValue(c, f.key)}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="a4-foot">
                    <span>Generated from the MSMA Workspace · {asOf}</span>
                    <span>Page 1</span>
                  </div>
                </div>
                {repError && <div className="mem-error" role="alert" style={{ marginTop: 12 }}>{repError}</div>}
                <div className="rep-actions">
                  <button className="uname-skip" disabled={!!repBusy} onClick={() => setRepPreview(false)}>Close</button>
                  <button
                    className="tool-new"
                    disabled={!!repBusy}
                    onClick={async () => {
                      setRepError('');
                      setRepBusy('pdf');
                      try {
                        await generateClientsPdf(cluster, sel, filtered);
                      } catch {
                        setRepError('Couldn’t generate the PDF — check your connection and try again.');
                      } finally {
                        setRepBusy('');
                      }
                    }}
                  >
                    {repBusy === 'pdf' ? 'Generating…' : '⬇ Generate PDF'}
                  </button>
                  <button
                    className="tool-new"
                    disabled={!!repBusy}
                    onClick={async () => {
                      setRepError('');
                      setRepBusy('xlsx');
                      try {
                        await generateClientsXlsx(cluster, sel, filtered);
                      } catch {
                        setRepError('Couldn’t generate the Excel file — check your connection and try again.');
                      } finally {
                        setRepBusy('');
                      }
                    }}
                  >
                    {repBusy === 'xlsx' ? 'Generating…' : '⬇ Generate Excel File'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
