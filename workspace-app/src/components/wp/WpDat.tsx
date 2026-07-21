'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import {
  DAT_HEADER, DAT_NT, DAT_OTHER, DAT_TX, annualizeYear, datDefaults, datFmt, datRecordKey,
  wtcFmt, wtcNum, type AnnEmp, type WtcRecord,
} from '@/lib/payroll';
import { downloadAnnualist } from '@/lib/wpExports';
import type { WpMain } from '@/hooks/useWpData';
import Select from '@/components/Select';

/* eslint-disable @typescript-eslint/no-explicit-any */

// DAT File — BIR 1604-C alphalist records (Schedule 1), pre-filled from the
// annualization; the Excel/CSV alphalist downloads here too.

export default function WpDat({
  client,
  main,
  patchMain,
  wtcRecords,
  toast,
  onBack,
  openSection,
}: {
  client: Client;
  main: WpMain;
  patchMain: (p: Partial<WpMain>) => void;
  wtcRecords: WtcRecord[];
  toast: (m: string) => void;
  onBack: () => void;
  openSection: (k: string) => void;
}) {
  const years = [...new Set(wtcRecords.map((r) => String(r.period).slice(0, 4)))].sort().reverse();
  const [yearSel, setYearSel] = useState<string | null>(null);
  const year = yearSel && years.includes(yearSel) ? yearSel : years[0] || '';
  const [rec, setRec] = useState<{ emp: AnnEmp; values: Record<string, any> } | null>(null);

  const head = (
    <>
      <div className="tc-page-head">
        <h2>DAT File</h2>
        <button className="uname-skip" onClick={onBack}>← 1601-C · {client.name}</button>
      </div>
      <div className="tc-sub-line">{client.name} · BIR 1604-C alphalist for submission via the Alphalist Data Entry tool</div>
    </>
  );

  if (!years.length) {
    return (
      <>
        {head}
        <div className="soonboard" style={{ marginTop: 14 }}>
          <b>No recorded computations yet for {client.name}</b>
          The DAT File is built from the annualized figures — record the year’s computations first.
          <div><button className="tool-new" style={{ marginTop: 12 }} onClick={() => openSection('computation')}>Open Withholding Tax Computation</button></div>
        </div>
      </>
    );
  }

  const { periods, list } = annualizeYear(wtcRecords, main.employees, main.annPrev, year);
  const saved = main.datRecords[year] || {};
  const done = list.filter((e) => saved[datRecordKey(e)]).length;

  function openRecord(e: AnnEmp) {
    const savedRec = saved[datRecordKey(e)] || {};
    const values: Record<string, any> = { ...datDefaults(e), ...savedRec };
    // money fields edit as plain strings — format once on open, parse on save
    Object.keys(values).forEach((k) => {
      if (/^(nt_|tx_|net|tax|tw|over|pera)/.test(k)) values[k] = datFmt(values[k]);
    });
    setRec({ emp: e, values });
  }
  function saveRecord() {
    if (!rec) return;
    const out: Record<string, any> = {};
    Object.keys(rec.values).forEach((k) => {
      const v = rec.values[k];
      out[k] = /^(nt_|tx_|net|tax|tw|over|pera)/.test(k) ? wtcNum(v) : v;
    });
    patchMain({ datRecords: { ...main.datRecords, [year]: { ...(main.datRecords[year] || {}), [datRecordKey(rec.emp)]: out } } });
    setRec(null);
    toast('Alphalist record saved');
  }
  const setV = (k: string, v: any) => setRec((s) => (s ? { ...s, values: { ...s.values, [k]: v } } : s));

  const money = (k: string) => (
    <input className="wtc-cell ta-r" style={{ width: '100%' }} value={String(rec!.values[k] ?? '')}
      onChange={(e) => setV(k, e.target.value)} />
  );
  const lbl = (t: string) => <div className="tc-sub" style={{ marginBottom: 2 }}>{t}</div>;
  const grid = (arr: [string, string][], prefix: string) => (
    <div className="dat-grid">
      {arr.map((f) => <div key={f[0]}>{lbl(f[1])}{money(prefix + f[0])}</div>)}
    </div>
  );

  return (
    <>
      {head}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <Select value={`TY ${year}`} options={years.map((y) => `TY ${y}`)} onChange={(v) => setYearSel(v.replace('TY ', ''))} ariaLabel="Tax year" />
        <div className="tc-sub" style={{ flex: 1, alignSelf: 'center' }}>
          {done} of {list.length} record{list.length === 1 ? '' : 's'} encoded · {periods.length} month{periods.length === 1 ? '' : 's'} recorded in {year}
        </div>
        <button className="uname-skip" onClick={() => downloadAnnualist('xlsx', client.name, year, list).catch(() => toast('Couldn’t load the Excel engine'))}>⬇ Alphalist Excel</button>
        <button className="uname-skip" onClick={() => downloadAnnualist('csv', client.name, year, list).catch(() => {})}>⬇ Alphalist CSV</button>
      </div>
      <div className="tc-card" style={{ marginTop: 4 }}>
        <div className="tc-card-title">Alphalist records — TY {year} <span className="due-count">{list.length}</span></div>
        <div className="tc-sub" style={{ marginBottom: 8 }}>
          Click an employee to encode their 1604-C Schedule 1 record (Non-Taxable / Taxable / Other Items, present &amp; previous employer) —
          pre-filled from the annualization. The machine .DAT export gets wired once a sample .DAT provides the exact schema;
          meanwhile the Excel/CSV alphalist is available above.
        </div>
        <div className="tc-scroll">
          <table className="wp-table">
            <thead><tr><th>#</th><th>Employee</th><th className="ta-c">TIN</th><th className="ta-r">Net Taxable</th><th className="ta-r">Tax Due</th><th className="ta-r">Tax Withheld</th><th>Record</th><th /></tr></thead>
            <tbody>
              {list.length ? list.map((e, i) => {
                const has = !!saved[datRecordKey(e)];
                return (
                  <tr key={i} className="wp-row" onClick={() => openRecord(e)}>
                    <td className="tc-sub">{i + 1}</td>
                    <td><div className="tc-name">{e.name || '—'}{e.prev && <span className="pm-chip" style={{ marginLeft: 6 }}>+ prev.</span>}</div></td>
                    <td className="ta-c">{e.tin || '—'}</td>
                    <td className="ta-r">{wtcFmt(e.taxable)}</td>
                    <td className="ta-r">{wtcFmt(e.due)}</td>
                    <td className="ta-r">{wtcFmt(e.withheld)}</td>
                    <td>{has ? <span className="flagchip green">Encoded ✓</span> : <span className="flagchip grey">Not yet</span>}</td>
                    <td className="ta-r"><span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: '.74rem' }}>{has ? 'Edit' : 'Encode'} record →</span></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>No employees in the recorded computations for {year}.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="uname-actions">
        <button className="uname-skip" onClick={() => openSection('annualization')}>← Back to Annualization</button>
      </div>

      {rec && (
        <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setRec(null); }}>
          <div className="cal-modal dir-modal" role="dialog" aria-modal="true" aria-label="Alphalist record">
            <div className="dir-head">
              <div style={{ flex: 1 }}>
                <div className="dir-firm">Alphalist record — {rec.emp.name || 'employee'}</div>
                <div className="dir-subtitle">Pre-filled from the annualization · layout follows the BIR 1604-C Schedule 1 data-entry form · match the employee’s 2316</div>
              </div>
              <button className="cal-modal-close" aria-label="Close" onClick={() => setRec(null)}>×</button>
            </div>
            <div className="cal-modal-body">
              <div className="dat-grid three" style={{ marginBottom: 6 }}>
                <div>{lbl('TIN')}<input className="wtc-cell" style={{ width: '100%' }} value={rec.emp.tin || ''} disabled /></div>
                <div>{lbl('Last name')}<input className="wtc-cell" style={{ width: '100%' }} value={(rec.emp.ln || '').toUpperCase()} disabled /></div>
                <div>{lbl('First name / MI')}<input className="wtc-cell" style={{ width: '100%' }} value={((rec.emp.fn || '') + ' ' + (rec.emp.mn || '')).toUpperCase().trim()} disabled /></div>
              </div>
              <div className="dat-grid three">
                {DAT_HEADER.map((f) => (
                  <div key={f[0]}>
                    {lbl(f[1])}
                    {f[2] === 'select' ? (
                      <select className="wtc-cell" style={{ width: '100%' }} value={rec.values[f[0]] || ''} onChange={(e) => setV(f[0], e.target.value)}>
                        {(f[3] || '').split('|').map((o) => <option key={o}>{o}</option>)}
                      </select>
                    ) : (
                      <input className="wtc-cell" style={{ width: '100%' }} value={rec.values[f[0]] || ''} onChange={(e) => setV(f[0], e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
              <div className="dat-sec">NON-TAXABLE · Present Employer</div>{grid(DAT_NT, 'nt_p_')}
              <div className="dat-sec">NON-TAXABLE · Previous Employer</div>{grid(DAT_NT, 'nt_v_')}
              <div className="dat-sec">TAXABLE · Present Employer</div>{grid(DAT_TX, 'tx_p_')}
              <div className="dat-sec">TAXABLE · Previous Employer</div>{grid(DAT_TX, 'tx_v_')}
              <div className="dat-sec">TAXABLE · Combined</div>
              <div style={{ maxWidth: 320 }}>{lbl('Total Compensation Income (Previous and Present)')}{money('tx_totalCombined')}</div>
              <div className="dat-sec">OTHER ITEMS</div>{grid(DAT_OTHER, '')}
              <div className="rep-actions">
                <button className="uname-skip" onClick={() => setRec(null)}>Cancel</button>
                <button className="tool-new" onClick={saveRecord}>Save record</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
