'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/types';
import { RETURNS, TAX_PAGES, TAX_KEYS, type RetKey } from '@/lib/birReturns';
import { useWpData } from '@/hooks/useWpData';
import WpEmployees from '@/components/wp/WpEmployees';
import WpComputation from '@/components/wp/WpComputation';
import WpDraft from '@/components/wp/WpDraft';
import WpAnnualization from '@/components/wp/WpAnnualization';
import WpDat from '@/components/wp/WpDat';

// Working Paper — supporting working papers per BIR return. 1601-C has the
// full structured module suite; the other returns are starter pages.

export type WpJump = { ret: RetKey; clientId: string; section: string; ask?: boolean } | null;

const MODULES = [
  { key: 'employees', label: 'Employee Masterlist', desc: 'Company employees covered by payroll withholding' },
  { key: 'computation', label: 'Withholding Tax Computation', desc: 'Verify payroll data, then compute withholding' },
  { key: 'draft', label: 'Draft Return', desc: '1601-C drafted from the recorded computation' },
  { key: 'annualization', label: 'Annualization', desc: 'Year-end annualized withholding adjustment' },
  { key: 'dat', label: 'DAT File', desc: 'Alphalist DAT file generation' },
];

export default function WorkingPaper({
  cluster,
  clients,
  myName,
  jump,
  onJumpDone,
  toast,
  onDraftSaved,
  taxRecordStage,
}: {
  cluster: string;
  clients: Client[];
  myName: string;
  jump: WpJump;
  onJumpDone: () => void;
  toast: (m: string) => void;
  onDraftSaved: (client: Client, period: string) => void;
  taxRecordStage: (clientId: string, period: string) => { stage: number; dates: Record<string, string> };
}) {
  const [ret, setRet] = useState<RetKey | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [autoAsk, setAutoAsk] = useState(false);
  const [search, setSearch] = useState('');
  const wp = useWpData(cluster, clientId);

  useEffect(() => {
    if (!jump) return;
    setRet(jump.ret);
    setClientId(jump.clientId);
    setSection(jump.section);
    setAutoAsk(!!jump.ask);
    onJumpDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump]);

  const client = clientId ? clients.find((c) => c.id === clientId) || null : null;
  const clientsFor = (tax: string) => clients.filter((c) => c.taxTypes && c.taxTypes[tax]).sort((a, b) => a.name.localeCompare(b.name));

  /* level 1 — pick the return */
  if (!ret) {
    const ordered = TAX_KEYS.flatMap((t) => TAX_PAGES[t].returns);
    return (
      <>
        <div className="tc-page-head" style={{ marginTop: 4 }}>
          <h2>Working Paper</h2>
        </div>
        <div className="tc-sub-line">Supporting working papers per BIR return · {cluster} Cluster · click a return to open</div>
        <div className="ret-grid">
          {ordered.map((r) => {
            const R = RETURNS[r];
            return (
              <button className="ret-card" key={r} onClick={() => { setRet(r); setClientId(null); setSection(null); setSearch(''); }}>
                <div className="rc-head">
                  <span className="rc-form">{R.form}</span>
                  <span className="rc-tax">{R.tax}</span>
                </div>
                <div className="rc-meta" style={{ marginTop: 6 }}>{R.name}</div>
                <div className="rc-meta" style={{ marginTop: 8 }}>
                  {R.freq === 'M' ? 'Monthly' : R.freq === 'Q' ? 'Quarterly' : 'Annual'}
                  <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontWeight: 600 }}>Open →</span>
                </div>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const R = RETURNS[ret];

  /* level 2 — pick the company */
  if (!client) {
    const all = clientsFor(R.tax);
    const q = search.trim().toLowerCase();
    const list = !q ? all : all.filter((c) => `${c.name} ${c.tin} ${c.preparer}`.toLowerCase().includes(q));
    return (
      <>
        <div className="tc-page-head" style={{ marginTop: 4 }}>
          <h2>{R.form} · Working Paper</h2>
          <button className="uname-skip" onClick={() => setRet(null)}>← All returns</button>
        </div>
        <div className="tc-sub-line">{R.name} · select the company to work on · {all.length} applicable client{all.length === 1 ? '' : 's'} in the {cluster} Cluster</div>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="etm-search" style={{ marginLeft: 0, flex: 1, maxWidth: 380 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            <input type="search" placeholder="Search company, TIN, or staff…" aria-label="Search companies" style={{ width: '100%' }}
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        {list.length ? (
          <div className="ret-grid">
            {list.map((c) => (
              <button className="ret-card" key={c.id} onClick={() => { setClientId(c.id); setSection(null); }}>
                <div className="rc-head">
                  <span className="rc-form" style={{ fontSize: '.85rem' }}>{c.name}</span>
                  {c.channel ? <span className={`chan-chip ${c.channel === 'eBIR' ? 'ebir' : 'efps'}`}>{c.channel}</span> : null}
                </div>
                <div className="rc-meta" style={{ marginTop: 6 }}>TIN {c.tin || '—'}{c.preparer ? ` · ${c.preparer}` : ''}</div>
                <div className="rc-meta" style={{ marginTop: 8 }}>
                  {R.form}
                  <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontWeight: 600 }}>Open →</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-note" style={{ marginTop: 14 }}>
            {all.length
              ? `No company matches “${search}”.`
              : `No clients tagged for ${R.tax} — tag them with the ${R.tax} tax type in the Client Masterlist first.`}
          </div>
        )}
      </>
    );
  }

  /* level 3 — a company's working paper */
  if (ret !== '1601C') {
    return (
      <>
        <div className="tc-page-head" style={{ marginTop: 4 }}>
          <h2>{R.form} · {client.name}</h2>
          <button className="uname-skip" onClick={() => setClientId(null)}>← Companies</button>
        </div>
        <div className="tc-sub-line">{R.name} · TIN {client.tin || '—'} · {cluster} Cluster</div>
        <div className="soonboard" style={{ marginTop: 14 }}>
          <b>Working paper for {R.form} · {client.name} starts here</b>
          The 1601-C suite is fully built — tell us what this return’s working paper should contain and we’ll build it next.
        </div>
      </>
    );
  }

  const back = () => setSection(null);
  const openSection = (k: string) => { setAutoAsk(false); setSection(k); };

  if (section === 'employees') {
    return <WpEmployees client={client} cluster={cluster} main={wp.main} patchMain={wp.patchMain} toast={toast} onBack={back} />;
  }
  if (section === 'computation') {
    return (
      <WpComputation
        client={client} main={wp.main} patchMain={wp.patchMain}
        wtcRecords={wp.wtcRecords} addWtcRecord={wp.addWtcRecord}
        myName={myName} autoAsk={autoAsk} toast={toast} onBack={back} openSection={openSection}
      />
    );
  }
  if (section === 'draft') {
    return (
      <WpDraft
        client={client} main={wp.main} patchMain={wp.patchMain}
        wtcRecords={wp.wtcRecords} drafts={wp.drafts} addDraft={wp.addDraft}
        myName={myName} toast={toast} onBack={back}
        onDraftSaved={(period) => onDraftSaved(client, period)}
        taxRecordStage={(period) => taxRecordStage(client.id, period)}
      />
    );
  }
  if (section === 'annualization') {
    return <WpAnnualization client={client} main={wp.main} patchMain={wp.patchMain} wtcRecords={wp.wtcRecords} toast={toast} onBack={back} openSection={openSection} />;
  }
  if (section === 'dat') {
    return <WpDat client={client} main={wp.main} patchMain={wp.patchMain} wtcRecords={wp.wtcRecords} toast={toast} onBack={back} openSection={openSection} />;
  }

  return (
    <>
      <div className="tc-page-head" style={{ marginTop: 4 }}>
        <h2>{R.form} · {client.name}</h2>
        <button className="uname-skip" onClick={() => setClientId(null)}>← Companies</button>
      </div>
      <div className="tc-sub-line">{R.name} · TIN {client.tin || '—'} · {cluster} Cluster</div>
      <div className="ret-grid">
        {MODULES.map((m) => (
          <button className="ret-card" key={m.key} onClick={() => { setAutoAsk(false); setSection(m.key); }}>
            <div className="rc-head"><span className="rc-form" style={{ fontSize: '.88rem' }}>{m.label}</span></div>
            <div className="rc-meta" style={{ marginTop: 6 }}>{m.desc}</div>
            <div className="rc-meta" style={{ marginTop: 8 }}>
              {R.form}
              <span style={{ marginLeft: 'auto', color: 'var(--blue)', fontWeight: 600 }}>Open →</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
