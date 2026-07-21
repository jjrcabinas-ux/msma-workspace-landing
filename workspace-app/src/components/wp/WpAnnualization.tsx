'use client';

import { useRef, useState } from 'react';
import type { Client } from '@/lib/types';
import {
  annMidYearHires, annualizeYear, fmtDateMDY, wtcFmt, wtcNum,
  type PrevEmp, type WtcRecord,
} from '@/lib/payroll';
import { downloadAnnualist } from '@/lib/wpExports';
import type { WpMain } from '@/hooks/useWpData';
import Select from '@/components/Select';

// Annualization — year-end withholding reconciliation aggregated from the
// recorded monthly computations, with mid-year-hire previous-employer (2316)
// capture that folds into the annualized figures.

export default function WpAnnualization({
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
  const [prevOpen, setPrevOpen] = useState(false);
  const [prevEdit, setPrevEdit] = useState<Record<string, Record<string, string>>>({});
  const autoShown = useRef(false);

  const head = (
    <>
      <div className="tc-page-head">
        <h2>Annualization</h2>
        <button className="uname-skip" onClick={onBack}>← 1601-C · {client.name}</button>
      </div>
      <div className="tc-sub-line">{client.name} · year-end withholding tax reconciliation, aggregated from the recorded monthly computations</div>
    </>
  );

  if (!years.length) {
    return (
      <>
        {head}
        <div className="soonboard" style={{ marginTop: 14 }}>
          <b>No recorded Withholding Tax Computation yet for {client.name}</b>
          Annualization builds on the year’s recorded monthly computations — record some first.
          <div><button className="tool-new" style={{ marginTop: 12 }} onClick={() => openSection('computation')}>Open Withholding Tax Computation</button></div>
        </div>
      </>
    );
  }

  const { periods, list } = annualizeYear(wtcRecords, main.employees, main.annPrev, year);
  const mid = annMidYearHires(list, year);
  const savedPrev = main.annPrev[year] || {};
  const unencoded = mid.filter((e) => e.empId && !savedPrev[e.empId]);
  if (mid.length && unencoded.length && !autoShown.current) {
    autoShown.current = true;
    setTimeout(() => openPrev(), 60);
  }

  function openPrev() {
    const init: Record<string, Record<string, string>> = {};
    mid.forEach((e) => {
      if (!e.empId) return;
      const p = savedPrev[e.empId];
      init[e.empId] = p
        ? { employer: p.employer || '', employerTin: p.employerTin || '', gross: p.gross ? wtcFmt(p.gross) : '', nonTax: p.nonTax ? wtcFmt(p.nonTax) : '', taxable: p.taxable ? wtcFmt(p.taxable) : '', withheld: p.withheld ? wtcFmt(p.withheld) : '' }
        : { employer: '', employerTin: '', gross: '', nonTax: '', taxable: '', withheld: '' };
    });
    setPrevEdit(init);
    setPrevOpen(true);
  }
  function savePrev() {
    const yearMap: Record<string, PrevEmp> = {};
    Object.keys(prevEdit).forEach((id) => {
      const r = prevEdit[id];
      if ((r.employer || '').trim() || wtcNum(r.gross) || wtcNum(r.taxable) || wtcNum(r.withheld) || wtcNum(r.nonTax)) {
        yearMap[id] = {
          employer: r.employer || '', employerTin: r.employerTin || '',
          gross: wtcNum(r.gross), nonTax: wtcNum(r.nonTax), taxable: wtcNum(r.taxable), withheld: wtcNum(r.withheld),
        };
      }
    });
    patchMain({ annPrev: { ...main.annPrev, [year]: yearMap } });
    setPrevOpen(false);
    toast('Previous-employer data saved and annualized');
  }
  const setPrevField = (id: string, k: string, v: string) =>
    setPrevEdit((s) => ({ ...s, [id]: { ...(s[id] || {}), [k]: v } }));

  const F = (v: number) => (Math.abs(v) < 0.005 ? <span style={{ color: 'var(--dim)' }}>—</span> : wtcFmt(v));
  const tot = list.reduce((a, e) => ({ gross: a.gross + e.gross, nonTax: a.nonTax + e.nonTax, taxable: a.taxable + e.taxable, withheld: a.withheld + e.withheld, due: a.due + e.due, adj: a.adj + e.adj }), { gross: 0, nonTax: 0, taxable: 0, withheld: 0, due: 0, adj: 0 });

  return (
    <>
      {head}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <Select value={`TY ${year}`} options={years.map((y) => `TY ${y}`)} onChange={(v) => { setYearSel(v.replace('TY ', '')); autoShown.current = false; }} ariaLabel="Tax year" />
        <div className="tc-sub" style={{ flex: 1, alignSelf: 'center' }}>
          {periods.length} month{periods.length === 1 ? '' : 's'} recorded in {year} · {list.length} employee{list.length === 1 ? '' : 's'}
        </div>
        {mid.length > 0 && (
          <button className="uname-skip" onClick={openPrev}>
            Mid-year hires <span className="due-count" style={unencoded.length ? { background: 'var(--amber)' } : undefined}>{mid.length}</span>
          </button>
        )}
        <button className="uname-skip" onClick={() => downloadAnnualist('xlsx', client.name, year, list).catch(() => toast('Couldn’t load the Excel engine'))}>⬇ Excel</button>
        <button className="uname-skip" onClick={() => downloadAnnualist('csv', client.name, year, list).catch(() => {})}>⬇ CSV</button>
      </div>
      <div className="tc-card" style={{ marginTop: 4 }}>
        <div className="tc-card-title">Annualized withholding — TY {year} <span className="due-count">{list.length}</span></div>
        <div className="tc-sub" style={{ marginBottom: 8 }}>
          <b style={{ color: 'var(--white)' }}>Adjustment</b> = annual tax due − tax withheld. A positive figure is <b style={{ color: 'var(--white)' }}>collectible</b> (under-withheld);
          a figure in parentheses is a <b style={{ color: 'var(--white)' }}>refund</b> to the employee (over-withheld). Annual tax due uses the BIR annual graduated table.
        </div>
        <div className="wtc-scroll" style={{ maxHeight: '60vh' }}>
          <table className="wp-table">
            <thead>
              <tr>
                <th>#</th><th>Employee</th><th className="ta-c">TIN</th><th className="ta-c">Mos.</th>
                <th className="ta-r">Gross Compensation</th><th className="ta-r">Non-Taxable</th><th className="ta-r">Taxable</th>
                <th className="ta-r">Tax Withheld</th><th className="ta-r">Annual Tax Due</th><th className="ta-r">Adjustment</th>
              </tr>
            </thead>
            <tbody>
              {list.length ? list.map((e, i) => (
                <tr key={i}>
                  <td className="tc-sub">{i + 1}</td>
                  <td>
                    <div className="tc-name">
                      {e.name || '—'}
                      {e.prev && <span className="pm-chip" style={{ marginLeft: 6 }} title={`Includes previous employer: ${e.prev.employer || 'prior employer'}`}>+ prev.</span>}
                    </div>
                  </td>
                  <td className="ta-c">{e.tin || '—'}</td>
                  <td className="ta-c">{e.months}</td>
                  <td className="ta-r">{F(e.gross)}</td>
                  <td className="ta-r">{F(e.nonTax)}</td>
                  <td className="ta-r" style={{ fontWeight: 700 }}>{F(e.taxable)}</td>
                  <td className="ta-r">{F(e.withheld)}</td>
                  <td className="ta-r">{F(e.due)}</td>
                  <td className={`ta-r${e.adj > 0.009 ? ' wtc-warn' : ''}`} style={{ fontWeight: 700, ...(e.adj < -0.009 ? { color: 'var(--lime)' } : {}) }}>{F(e.adj)}</td>
                </tr>
              )) : (
                <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>No employees in the recorded computations for {year}.</td></tr>
              )}
            </tbody>
            {list.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700 }}>
                  <td /><td>TOTAL</td><td /><td />
                  <td className="ta-r">{F(tot.gross)}</td><td className="ta-r">{F(tot.nonTax)}</td><td className="ta-r">{F(tot.taxable)}</td>
                  <td className="ta-r">{F(tot.withheld)}</td><td className="ta-r">{F(tot.due)}</td><td className="ta-r">{F(tot.adj)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 8 }}>
        <div className="tc-sub" style={{ flex: 1 }}>Figures aggregate each employee’s recorded monthly computations for the year, plus encoded previous-employer (2316) amounts for mid-year hires.</div>
        <button className="uname-skip" onClick={onBack}>← Back to modules</button>
        {list.length > 0 && <button className="tool-new" onClick={() => openSection('dat')}>Proceed to DAT File →</button>}
      </div>

      {prevOpen && (
        <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPrevOpen(false); }}>
          <div className="cal-modal dir-modal" role="dialog" aria-modal="true" aria-label="Mid-year hires previous employer">
            <div className="dir-head">
              <div style={{ flex: 1 }}>
                <div className="dir-firm">Mid-year hires {year} — previous employer</div>
                <div className="dir-subtitle">Amounts come straight from the employee’s 2316 from the previous employer</div>
              </div>
              <button className="cal-modal-close" aria-label="Close" onClick={() => setPrevOpen(false)}>×</button>
            </div>
            <div className="cal-modal-body">
              {!mid.length ? (
                <div className="empty-note">No employees were hired during {year} (based on Date Hired in the masterlist). Nothing to consolidate.</div>
              ) : (
                <div className="tc-scroll">
                  <table className="wp-table">
                    <thead>
                      <tr><th>Employee</th><th>Date hired</th><th>Prev. employer</th><th>Prev. TIN</th>
                        <th className="ta-r">Gross</th><th className="ta-r">Non-taxable</th><th className="ta-r">Taxable</th><th className="ta-r">Tax withheld</th></tr>
                    </thead>
                    <tbody>
                      {mid.filter((e) => e.empId).map((e) => {
                        const id = e.empId as string;
                        const row = prevEdit[id] || {};
                        const inp = (k: string, ph: string, cls?: string) => (
                          <input className={`wtc-cell ${cls || ''}`} style={{ width: '100%' }} value={row[k] || ''} placeholder={ph}
                            onChange={(ev) => setPrevField(id, k, ev.target.value)} />
                        );
                        return (
                          <tr key={id}>
                            <td><div className="tc-name">{e.name || '—'}</div><div className="tc-sub">{e.tin || ''}</div></td>
                            <td>{fmtDateMDY(e.dateHired) || '—'}</td>
                            <td style={{ padding: 5 }}>{inp('employer', 'Employer name')}</td>
                            <td style={{ padding: 5 }}>{inp('employerTin', '000-000-000-000', 'ta-c')}</td>
                            <td style={{ padding: 5 }}>{inp('gross', '0.00', 'ta-r')}</td>
                            <td style={{ padding: 5 }}>{inp('nonTax', '0.00', 'ta-r')}</td>
                            <td style={{ padding: 5 }}>{inp('taxable', '0.00', 'ta-r')}</td>
                            <td style={{ padding: 5 }}>{inp('withheld', '0.00', 'ta-r')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="rep-actions">
                <button className="uname-skip" onClick={() => setPrevOpen(false)}>Cancel</button>
                {mid.length > 0 && <button className="tool-new" onClick={savePrev}>Save and annualize</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
