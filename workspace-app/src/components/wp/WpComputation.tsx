'use client';

import { useEffect, useRef, useState } from 'react';
import type { Client } from '@/lib/types';
import { todayISO } from '@/lib/dates';
import { fmtMoney } from '@/lib/birReturns';
import {
  NB, PAYROLL_HEADERS, WTC_COMP_HEADERS, WTC_FREQS,
  collectManualRows, collectVerifiedRows, digitsOf, fmtDateMDY, fullNameOf, normName,
  periodMonthLabel, verifyPayrollRows, wtcComputeRow,
  type BaseRow, type Employee, type Verif, type WtcRecord,
} from '@/lib/payroll';
import { newTaskId } from '@/lib/ui';
import { downloadPayrollTemplate, readWorkbookRows } from '@/lib/wpExports';
import type { WpMain } from '@/hooks/useWpData';

// Withholding Tax Computation — verify payroll data against the Employee
// Masterlist (or encode manually), compute the IC columns with the BIR
// revised withholding table, and record locked, versioned computations.

type Phase = 'landing' | 'nodata' | 'upload' | 'results' | 'manual-select' | 'compute';

export default function WpComputation({
  client,
  main,
  patchMain,
  wtcRecords,
  addWtcRecord,
  myName,
  autoAsk,
  toast,
  onBack,
  openSection,
}: {
  client: Client;
  main: WpMain;
  patchMain: (p: Partial<WpMain>) => void;
  wtcRecords: WtcRecord[];
  addWtcRecord: (r: WtcRecord) => void;
  myName: string;
  autoAsk: boolean;
  toast: (m: string) => void;
  onBack: () => void;
  openSection: (k: string) => void;
}) {
  const emps = main.employees;
  const [phase, setPhase] = useState<Phase>('landing');
  const [askOpen, setAskOpen] = useState(autoAsk);
  const [verif, setVerif] = useState<Verif | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [wtcOn, setWtcOn] = useState(false);
  const [freq, setFreq] = useState('Semi-monthly');
  const [viewRec, setViewRec] = useState<string | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savePeriod, setSavePeriod] = useState('');
  const [saveRemarks, setSaveRemarks] = useState('');
  const [editCtx, setEditCtx] = useState<{ recId: string; reason: string } | null>(null);
  const [editLoaded, setEditLoaded] = useState<{ period: string; reason: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // manual sheet cells: mutable working copy, committed to Firestore per change
  const manualRef = useRef<Record<string, Record<string, string>>>({});
  useEffect(() => {
    manualRef.current = JSON.parse(JSON.stringify(main.wtcManual || {}));
  }, [main.wtcManual]);
  const commitManual = () => patchMain({ wtcManual: { ...manualRef.current } });

  /* ---- Excel-style range selection on the manual sheet ---- */
  const selRect = useRef<{ r1: number; c1: number; r2: number; c2: number } | null>(null);
  useEffect(() => {
    const up = () => document.querySelector('.wtc-scroll.dragging')?.classList.remove('dragging');
    document.addEventListener('mouseup', up);
    return () => document.removeEventListener('mouseup', up);
  }, []);
  function selCells(): HTMLInputElement[] {
    const s = selRect.current;
    if (!s) return [];
    const r1 = Math.min(s.r1, s.r2), r2 = Math.max(s.r1, s.r2), c1 = Math.min(s.c1, s.c2), c2 = Math.max(s.c1, s.c2);
    return ([...document.querySelectorAll('input.wtc-cell')] as HTMLInputElement[]).filter((i) => {
      const r = +i.dataset.r!, c = +i.dataset.c!;
      return r >= r1 && r <= r2 && c >= c1 && c <= c2;
    });
  }
  function highlight() {
    document.querySelectorAll('input.wtc-cell.selcell').forEach((i) => i.classList.remove('selcell'));
    selCells().forEach((i) => i.classList.add('selcell'));
  }
  function setCell(empId: string, ci: number, el: HTMLInputElement, noSave?: boolean) {
    const m = manualRef.current;
    if (!m[empId]) m[empId] = {};
    let v = el.value.trim();
    if ((ci === 8 || ci >= 10) && v) { // money columns
      const n = parseFloat(v.replace(/,/g, ''));
      if (!isNaN(n)) { v = n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); el.value = v; }
    }
    let dm: RegExpMatchArray | null = null;
    if (ci <= 2 && v) { // date columns: normalize to MM/DD/YYYY
      dm = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
      if (dm) { v = `${String(+dm[1]).padStart(2, '0')}/${String(+dm[2]).padStart(2, '0')}/${dm[3]}`; el.value = v; }
    }
    m[empId][ci] = v;
    if (ci === 2) { // MONTH END = end of month of TO
      if (dm) {
        const mo = +dm[1], yr = +dm[3];
        m[empId][0] = `${String(mo).padStart(2, '0')}/${String(new Date(yr, mo, 0).getDate()).padStart(2, '0')}/${yr}`;
      } else {
        m[empId][0] = '';
      }
    }
    if (!noSave) commitManual();
  }
  function onPasteCell(ev: React.ClipboardEvent, el: HTMLInputElement) {
    const text = ev.clipboardData.getData('text');
    if (!text) return;
    const lines = text.replace(/\r/g, '').split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    const grid = lines.map((l) => l.split('\t'));
    const single = grid.length === 1 && grid[0].length === 1;
    const cells = selCells();
    if (single && cells.length > 1) {
      ev.preventDefault();
      cells.forEach((inp) => { inp.value = grid[0][0].trim(); setCell(inp.dataset.emp!, +inp.dataset.c!, inp, true); });
      commitManual();
      toast(`Filled ${cells.length} cells`);
      return;
    }
    if (single) return;
    ev.preventDefault();
    let r0 = +el.dataset.r!, c0 = +el.dataset.c!;
    if (selRect.current) { r0 = Math.min(selRect.current.r1, selRect.current.r2); c0 = Math.min(selRect.current.c1, selRect.current.c2); }
    let done = 0;
    grid.forEach((vals, dr) => vals.forEach((v, dc) => {
      const inp = document.querySelector(`input.wtc-cell[data-r="${r0 + dr}"][data-c="${c0 + dc}"]`) as HTMLInputElement | null;
      if (inp) { inp.value = v.trim(); setCell(inp.dataset.emp!, +inp.dataset.c!, inp, true); done++; }
    }));
    commitManual();
    toast(`Pasted ${done} cell${done === 1 ? '' : 's'}`);
  }
  function selectionTSV(): string | null {
    const s = selRect.current;
    if (!s) return null;
    const r1 = Math.min(s.r1, s.r2), r2 = Math.max(s.r1, s.r2), c1 = Math.min(s.c1, s.c2), c2 = Math.max(s.c1, s.c2);
    const lines: string[] = [];
    for (let r = r1; r <= r2; r++) {
      const cols: string[] = [];
      for (let c = c1; c <= c2; c++) {
        const inp = document.querySelector(`input.wtc-cell[data-r="${r}"][data-c="${c}"]`) as HTMLInputElement | null;
        cols.push(inp ? inp.value : '');
      }
      lines.push(cols.join('\t'));
    }
    return lines.join('\n');
  }
  function onKeyCell(ev: React.KeyboardEvent) {
    if (ev.key === 'Escape') { selRect.current = null; highlight(); return; }
    if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
    const cells = selCells();
    if (cells.length > 1) {
      ev.preventDefault();
      cells.forEach((inp) => { inp.value = ''; setCell(inp.dataset.emp!, +inp.dataset.c!, inp, true); });
      commitManual();
      toast(`Cleared ${cells.length} cells`);
    }
  }

  const collectRows = (): BaseRow[] =>
    verif ? collectVerifiedRows(verif.rows, emps) : collectManualRows(emps, sel, manualRef.current);

  /* ---- payroll upload verification ---- */
  async function handleUpload(input: HTMLInputElement) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    let rows;
    try {
      rows = await readWorkbookRows(file);
    } catch {
      toast('Could not read that file — is it a valid Excel/CSV?');
      return;
    }
    const res = verifyPayrollRows(rows, file.name, emps);
    if ('error' in res) { toast(res.error); return; }
    setVerif(res);
    setPhase('results');
    toast(res.errRows.length ? `Verification found ${res.errRows.length} discrepanc${res.errRows.length === 1 ? 'y' : 'ies'}` : 'Verification passed — all rows match');
  }

  /* ---- Save and Record ---- */
  function openSave() {
    const t = todayISO();
    setSavePeriod(editLoaded?.period || t.slice(0, 7));
    setSaveRemarks(editLoaded?.reason || '');
    setSaveOpen(true);
  }
  function confirmSave() {
    const p = savePeriod;
    if (!p) { toast('Select the period covered'); return; }
    const existing = wtcRecords.filter((r) => r.period === p);
    const remarks = saveRemarks.trim();
    if (existing.length && !remarks) { toast('Describe the changes for this new version'); return; }
    const baseRows = collectRows();
    if (!baseRows.length) { toast('Nothing to record yet'); return; }
    const rows = baseRows.map((br) => {
      const disp = br.vals.map((v, i) => (i >= 8 && String(v).trim() === '' ? '0.00' : String(v ?? '')));
      return disp.concat(wtcComputeRow(br, freq));
    });
    const rec: WtcRecord = {
      id: `w${newTaskId()}`,
      period: p, version: existing.length + 1, freq,
      savedAt: new Date().toISOString(), savedBy: myName,
      remarks, rows,
    };
    addWtcRecord(rec);
    setEditLoaded(null);
    setSaveOpen(false);
    setWtcOn(false);
    setViewRec(null);
    setPhase('landing');
    toast(`Recorded — ${periodMonthLabel(p)}, version ${rec.version}`);
  }

  /* ---- edit a recorded computation (creates the next version) ---- */
  function confirmEdit() {
    if (!editCtx) return;
    const reason = editCtx.reason.trim();
    if (!reason) { toast('A reason is required to edit a recorded computation'); return; }
    const rec = wtcRecords.find((r) => r.id === editCtx.recId);
    if (!rec) return;
    const m = manualRef.current;
    const selNew = new Set<string>();
    rec.rows.forEach((row) => {
      const emp = emps.find((e) =>
        (digitsOf(e.tin) && digitsOf(e.tin) === digitsOf(row[7])) ||
        normName([e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ')) === normName(row[6]));
      if (!emp) return;
      selNew.add(emp.id);
      const saved: Record<string, string> = {};
      row.slice(0, NB).forEach((v, i) => {
        if (i >= 3 && i <= 7) return; // identity always comes from the masterlist
        saved[i] = String(v ?? '');
      });
      m[emp.id] = saved;
    });
    if (!selNew.size) { toast('None of the recorded employees match the current masterlist'); return; }
    commitManual();
    setVerif(null);
    setSel(selNew);
    setEditLoaded({ period: rec.period, reason });
    setEditCtx(null);
    setWtcOn(false);
    setViewRec(null);
    setPhase('compute');
    toast('Loaded for editing — Save and Record creates the next version');
  }

  const alignFor = (i: number) => (i >= 8 ? 'ta-r' : i <= 2 || i === 7 ? 'ta-c' : '');
  const icAlign = (i: number) => (i >= 2 && i <= 4 ? 'ta-c' : 'ta-r');
  const head = (
    <>
      <div className="tc-page-head">
        <h2>Withholding Tax Computation</h2>
        <button className="uname-skip" onClick={onBack}>← 1601-C · {client.name}</button>
      </div>
      <div className="tc-sub-line">{client.name} · payroll data is verified against the Employee Masterlist before computing</div>
    </>
  );

  /* ---- viewing a recorded computation ---- */
  if (viewRec) {
    const rec = wtcRecords.find((r) => r.id === viewRec);
    if (rec) {
      return (
        <>
          {head}
          <div className="tc-card" style={{ marginTop: 12 }}>
            <div className="tc-card-title">
              Recorded Withholding Tax Computation — {periodMonthLabel(rec.period)} <span className="due-count">v{rec.version}</span>
            </div>
            <div className="tc-sub" style={{ marginBottom: 8 }}>
              Saved {fmtDateMDY(rec.savedAt.slice(0, 10))} by {rec.savedBy || '—'} · {rec.freq} payroll{rec.remarks ? <> · <b style={{ color: 'var(--white)' }}>Remarks:</b> {rec.remarks}</> : null}
            </div>
            <div className="wtc-scroll">
              <table className="wp-table">
                <thead>
                  <tr>
                    {PAYROLL_HEADERS.map((h, i) => <th key={h} className={alignFor(i)}>{h}</th>)}
                    {WTC_COMP_HEADERS.map((h, i) => <th key={h} className={`wtc-ic ${icAlign(i)}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rec.rows.map((r, ri) => (
                    <tr key={ri}>
                      {r.map((v, i) => i < NB
                        ? <td key={i} className={alignFor(i)}>{v}</td>
                        : <td key={i} className={`wtc-ic ${icAlign(i - NB)}${i - NB === 2 && v !== 'MATCH' ? ' wtc-warn' : ''}`}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <div className="tc-sub" style={{ flex: 1 }}>Recorded working papers are locked — a new save for the same period creates the next version.</div>
            <button className="uname-skip" onClick={() => setViewRec(null)}>← Back to Withholding Tax Computation</button>
          </div>
        </>
      );
    }
  }

  const recsSorted = [...wtcRecords].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  const recCard = recsSorted.length > 0 && (
    <div className="tc-card" style={{ marginTop: 12 }}>
      <div className="tc-card-title">Recorded computations <span className="due-count">{recsSorted.length}</span></div>
      <div className="tc-scroll">
        <table className="wp-table">
          <thead><tr><th>Period</th><th className="ta-c">Version</th><th>Saved</th><th>By</th><th className="ta-c">Frequency</th><th>Remarks</th><th /></tr></thead>
          <tbody>
            {recsSorted.map((r) => (
              <tr key={r.id} className="wp-row" onClick={() => setViewRec(r.id)}>
                <td className="tc-name">{periodMonthLabel(r.period)}</td>
                <td className="ta-c">v{r.version}</td>
                <td>{fmtDateMDY(String(r.savedAt).slice(0, 10))}</td>
                <td>{r.savedBy || '—'}</td>
                <td className="ta-c">{r.freq || '—'}</td>
                <td style={{ maxWidth: 280, whiteSpace: 'normal' }}>{r.remarks || '—'}</td>
                <td className="ta-r">
                  <button className="uname-skip" style={{ padding: '4px 12px', fontSize: '.76rem' }}
                    onClick={(e) => { e.stopPropagation(); setEditCtx({ recId: r.id, reason: '' }); }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const body = (() => {
    if (phase === 'nodata') return (
      <div className="soonboard" style={{ marginTop: 14 }}>
        <b>No standard payroll data from {client.name} yet</b>
        Request it through the 1601-C pipeline (Data Request step) and come back once the client sends the accomplished template.
        <div><button className="tool-new" style={{ marginTop: 14 }} onClick={() => setPhase('upload')}>Data received — verify it now</button></div>
      </div>
    );

    if (phase === 'upload') return (
      <div className="soonboard" style={{ marginTop: 14 }}>
        <b>Upload the client’s payroll file (.xlsx, .xls, or .csv)</b>
        The system checks every row against the Employee Masterlist: 1 · employee exists · 2 · TIN matches · 3 · daily rate matches.
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
          <button className="uname-skip" onClick={() => downloadPayrollTemplate().catch(() => toast('Couldn’t load the Excel engine'))}>⬇ Standard payroll template</button>
          <button className="tool-new" onClick={() => fileRef.current?.click()}>Choose payroll file…</button>
        </div>
      </div>
    );

    if (phase === 'results' && verif) {
      const clean = verif.errRows.length === 0;
      return (
        <>
          <div className="tc-stat-row">
            <div className="tc-stat"><b>{verif.total}</b><span>Rows checked · {verif.fileName}</span></div>
            <div className="tc-stat green"><b>{verif.ok}</b><span>Matched the masterlist</span></div>
            <div className={`tc-stat${verif.errRows.length ? ' red' : ''}`}><b>{verif.errRows.length}</b><span>With discrepancies</span></div>
          </div>
          {clean ? (
            <div className="soonboard" style={{ marginTop: 12 }}>
              <b>All {verif.ok} employees match the masterlist ✓</b>
              Names, TINs, and daily rates are accurate.
              <div><button className="tool-new" style={{ marginTop: 12 }} onClick={() => setPhase('compute')}>Proceed with computation →</button></div>
            </div>
          ) : (
            <div className="tc-card" style={{ marginTop: 12 }}>
              <div className="tc-card-title">Discrepancies to fix <span className="due-count">{verif.errRows.length}</span></div>
              {verif.errRows.map((r, i) => (
                <div className="pe-row" key={i}>
                  <div style={{ flex: 1 }}>
                    <div className="tc-name">{r.name}</div>
                    {r.issues.map((x, j) => <div className="tc-sub" key={j} style={{ color: 'var(--red)' }}>{x}</div>)}
                  </div>
                </div>
              ))}
              <div className="uname-actions">
                <button className="uname-skip" onClick={() => setPhase('upload')}>Re-upload corrected file</button>
                <button className="tool-new" onClick={() => openSection('employees')}>Update Employee Masterlist</button>
              </div>
            </div>
          )}
          {verif.missing.length > 0 && (
            <div className="tc-card" style={{ marginTop: 12 }}>
              <div className="tc-card-title">Active employees not in the file <span className="due-count">{verif.missing.length}</span></div>
              <div className="tc-sub">{verif.missing.join(' · ')}</div>
            </div>
          )}
        </>
      );
    }

    if (phase === 'manual-select') {
      if (!emps.length) return (
        <div className="soonboard" style={{ marginTop: 14 }}>
          <b>No employees in the masterlist for {client.name} yet</b>
          Build the Employee Masterlist first, then come back.
          <div><button className="tool-new" style={{ marginTop: 12 }} onClick={() => openSection('employees')}>Open Employee Masterlist</button></div>
        </div>
      );
      const allChecked = emps.length > 0 && emps.every((e) => sel.has(e.id));
      return (
        <>
          <div className="tc-card" style={{ marginTop: 12 }}>
            <div className="tc-card-title">Employees included in this computation <span className="due-count">{sel.size} of {emps.length}</span></div>
            <div className="tc-scroll">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th className="ta-c"><input type="checkbox" checked={allChecked} onChange={(e) => setSel(e.target.checked ? new Set(emps.map((x) => x.id)) : new Set())} title="Select all / none" /></th>
                    <th>#</th><th>Full name</th><th className="ta-c">TIN</th><th className="ta-r">Daily rate</th><th className="ta-r">Monthly rate</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.map((e, i) => (
                    <tr key={e.id} className="wp-row" onClick={() => setSel((s) => { const n = new Set(s); if (n.has(e.id)) n.delete(e.id); else n.add(e.id); return n; })}>
                      <td className="ta-c"><input type="checkbox" checked={sel.has(e.id)} readOnly /></td>
                      <td className="tc-sub">{i + 1}</td>
                      <td className="tc-name">{fullNameOf(e) || '—'}</td>
                      <td className="ta-c">{e.tin || '—'}</td>
                      <td className="ta-r">{fmtMoney(e.dailyRate)}</td>
                      <td className="ta-r">{fmtMoney(e.monthlyRate)}</td>
                      <td><span className={`flagchip ${e.status === 'Separated' ? 'grey' : 'green'}`}>{e.status || 'Active'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="uname-actions">
            <button className="uname-skip" onClick={() => setAskOpen(true)}>← Back to the payroll prompt</button>
            <button className="tool-new" onClick={() => { if (!sel.size) { toast('Select at least one employee'); return; } setPhase('compute'); }}>
              Proceed with {sel.size} employee{sel.size === 1 ? '' : 's'} →
            </button>
          </div>
        </>
      );
    }

    if (phase === 'compute' && wtcOn) {
      const baseRows = collectRows();
      return (
        <>
          <div className="tc-card" style={{ marginTop: 12 }}>
            <div className="tc-card-title">Withholding Tax Computation <span className="due-count">{baseRows.length} row{baseRows.length === 1 ? '' : 's'}</span></div>
            <div className="tc-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <b style={{ color: 'var(--white)' }}>Payroll frequency</b>
              {WTC_FREQS.map((fq) => (
                <button key={fq} className={`tc-tab${freq === fq ? ' active' : ''}`} style={{ padding: '3px 12px', fontSize: '.74rem' }} onClick={() => setFreq(fq)}>{fq}</button>
              ))}
              <span style={{ marginLeft: 'auto' }}>TYPE from the masterlist: T = taxable · M = minimum wage · N = not taxable</span>
            </div>
            <div className="wtc-scroll">
              <table className="wp-table">
                <thead>
                  <tr>
                    {PAYROLL_HEADERS.map((h, i) => <th key={h} className={alignFor(i)}>{h}</th>)}
                    {WTC_COMP_HEADERS.map((h, i) => <th key={h} className={`wtc-ic ${icAlign(i)}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {baseRows.map((br, ri) => {
                    const cr = wtcComputeRow(br, freq);
                    return (
                      <tr key={ri}>
                        {br.vals.map((v, i) => <td key={i} className={alignFor(i)}>{i >= 8 && String(v).trim() === '' ? '0.00' : v}</td>)}
                        {cr.map((v, i) => <td key={NB + i} className={`wtc-ic ${icAlign(i)}${i === 2 && v !== 'MATCH' ? ' wtc-warn' : ''}`}>{v}</td>)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <div className="tc-sub" style={{ flex: 1 }}>TAX WITHHELD follows the BIR revised withholding tax table (effective 2023) for the selected frequency.</div>
            <button className="uname-skip" onClick={() => setWtcOn(false)}>← Back to payroll encoding</button>
            {baseRows.length > 0 && <button className="tool-new" onClick={openSave}>Save and Record</button>}
          </div>
        </>
      );
    }

    if (phase === 'compute') {
      const manual = !verif;
      let rowCount = 0;
      let tbody: React.ReactNode = null;
      if (!manual && verif!.rows) {
        rowCount = verif!.rows.length;
        tbody = verif!.rows.map((r, ri) => (
          <tr key={ri}>{r.map((v, i) => <td key={i} className={alignFor(i)}>{v}</td>)}</tr>
        ));
      } else {
        const included = emps.filter((e) => sel.has(e.id));
        rowCount = included.length;
        const fmt2 = (v: unknown) => { const x = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(x) ? '' : x.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
        tbody = included.map((e, rIdx) => {
          const saved = manualRef.current[e.id] || {};
          const locked: Record<number, string> = {
            3: (e.lastName || '').toUpperCase(), 4: (e.firstName || '').toUpperCase(), 5: (e.middleName || '').toUpperCase(),
            6: fullNameOf(e), 7: e.tin || '',
          };
          return (
            <tr key={e.id}>
              {PAYROLL_HEADERS.map((h, i) => {
                if (i >= 3 && i <= 7) return <td key={i} className={alignFor(i)}>{locked[i]}</td>;
                if (i === 0) {
                  const me = saved[0] || '';
                  return me
                    ? <td key={i} className="ta-c">{me}</td>
                    : <td key={i} className="ta-c" style={{ color: 'var(--dim)', fontSize: '.72rem' }}>auto — from TO</td>;
                }
                const val = saved[i] != null ? saved[i] : i === 8 ? fmt2(e.dailyRate) : '';
                return (
                  <td key={i} className={alignFor(i)} style={{ padding: '3px 4px' }}>
                    <input
                      className={`wtc-cell ${i >= 8 ? 'ta-r' : 'ta-c'}`}
                      defaultValue={val}
                      placeholder={i <= 2 ? 'MM/DD/YYYY' : undefined}
                      data-emp={e.id} data-r={rIdx} data-c={i}
                      onChange={(ev) => setCell(e.id, i, ev.target)}
                      onMouseDown={(ev) => {
                        const el = ev.target as HTMLInputElement;
                        const r = +el.dataset.r!, c = +el.dataset.c!;
                        if (ev.shiftKey && selRect.current) { selRect.current.r2 = r; selRect.current.c2 = c; ev.preventDefault(); }
                        else selRect.current = { r1: r, c1: c, r2: r, c2: c };
                        el.closest('.wtc-scroll')?.classList.add('dragging');
                        highlight();
                      }}
                      onMouseEnter={(ev) => {
                        if (ev.buttons !== 1 || !selRect.current) return;
                        const el = ev.target as HTMLInputElement;
                        selRect.current.r2 = +el.dataset.r!;
                        selRect.current.c2 = +el.dataset.c!;
                        highlight();
                      }}
                      onPaste={(ev) => onPasteCell(ev, ev.target as HTMLInputElement)}
                      onCopy={(ev) => {
                        if (selCells().length <= 1) return;
                        const tsv = selectionTSV();
                        if (tsv == null) return;
                        ev.preventDefault();
                        ev.clipboardData.setData('text', tsv);
                      }}
                      onCut={(ev) => {
                        const cells = selCells();
                        if (cells.length <= 1) return;
                        const tsv = selectionTSV();
                        if (tsv == null) return;
                        ev.preventDefault();
                        ev.clipboardData.setData('text', tsv);
                        cells.forEach((inp) => { inp.value = ''; setCell(inp.dataset.emp!, +inp.dataset.c!, inp, true); });
                        commitManual();
                        toast(`Cut ${cells.length} cells`);
                      }}
                      onKeyDown={onKeyCell}
                    />
                  </td>
                );
              })}
            </tr>
          );
        });
      }
      return (
        <>
          <div className="tc-card" style={{ marginTop: 12 }}>
            <div className="tc-card-title">Standard Payroll Data <span className="due-count">{rowCount} row{rowCount === 1 ? '' : 's'}</span></div>
            <div className="tc-sub" style={{ marginBottom: 8 }}>
              {manual
                ? <><b style={{ color: 'var(--white)' }}>Manual mode</b> — names, TINs, and daily rates carried from the Employee Masterlist. Click any cell to encode; entries save automatically. MONTH END fills itself from the end of the month of TO. Drag (or Shift-click) to select a range — paste a block copied from Excel and it spreads across the cells; Delete clears the selection.</>
                : <>Values copied as-is from <b style={{ color: 'var(--white)' }}>{verif!.fileName}</b> — hardcoded, nothing is recomputed.</>}
            </div>
            <div className="wtc-scroll">
              <table className="wp-table">
                <thead><tr>{PAYROLL_HEADERS.map((h, i) => <th key={h} className={alignFor(i)}>{h}</th>)}</tr></thead>
                <tbody>{rowCount ? tbody : <tr><td colSpan={NB} style={{ textAlign: 'center', color: 'var(--dim)', padding: 26 }}>No payroll rows yet.</td></tr>}</tbody>
              </table>
            </div>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <div style={{ flex: 1 }} />
            {manual
              ? <button className="uname-skip" onClick={() => setPhase('manual-select')}>← Back to employee selection</button>
              : <button className="uname-skip" onClick={() => setPhase('results')}>← Back to verification results</button>}
            {rowCount > 0 && <button className="tool-new" onClick={() => setWtcOn(true)}>Proceed with computation →</button>}
          </div>
        </>
      );
    }

    /* landing */
    return (
      <>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="tc-sub" style={{ flex: 1 }}>
            {wtcRecords.length
              ? 'Recorded computations for this client — click a row to view.'
              : `No recorded computations yet for ${client.name} — click + Add record to start one.`}
          </div>
          <button className="tool-new" onClick={() => setAskOpen(true)}>+ Add record</button>
        </div>
        {recCard}
      </>
    );
  })();

  const existingForSave = wtcRecords.filter((r) => r.period === savePeriod).length;

  return (
    <>
      {head}
      {body}
      <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleUpload(e.target)} />

      {askOpen && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAskOpen(false); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Payroll data · {client.name}</h3>
            <p>Do we have the client’s accomplished <b>standard payroll template</b> for the period?</p>
            <div className="rq-opts">
              <button className="rq-opt" onClick={() => { setAskOpen(false); setVerif(null); setPhase('upload'); }}>
                <b>✓ Yes — upload and verify it</b>
                <span>Every row is checked against the Employee Masterlist</span>
              </button>
              <button className="rq-opt" onClick={() => { setAskOpen(false); setVerif(null); setSel(new Set(emps.map((e) => e.id))); setPhase('manual-select'); }}>
                <b>✎ Encode manually</b>
                <span>Type the payroll data straight into the sheet, from the masterlist</span>
              </button>
              <button className="rq-opt" onClick={() => { setAskOpen(false); setPhase('nodata'); }}>
                <b>✗ No payroll data yet</b>
                <span>Request it from the client first through the pipeline</span>
              </button>
            </div>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setAskOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {saveOpen && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSaveOpen(false); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Save and Record</h3>
            <div className="prof-grid">
              <div className="prof-field full">
                <label>Period covered</label>
                <input className="mem-input" type="month" value={savePeriod} style={{ colorScheme: 'dark' }}
                  onChange={(e) => setSavePeriod(e.target.value)} />
              </div>
              {existingForSave > 0 && (
                <div className="prof-field full">
                  <label>Remarks — what changed in this version (required)</label>
                  <input className="mem-input" value={saveRemarks} onChange={(e) => setSaveRemarks(e.target.value)} />
                </div>
              )}
            </div>
            <p style={{ marginTop: 12 }}>
              You are recording the Withholding Tax Computation of <b>{client.name}</b> for{' '}
              <b>{savePeriod ? periodMonthLabel(savePeriod) : '(select the period)'}</b>. Recorded computations are locked —
              later changes are saved as a new version with remarks.
              {existingForSave > 0 && <> This period already has <b>version {existingForSave}</b> on record — this save becomes <b>version {existingForSave + 1}</b>.</>}
            </p>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setSaveOpen(false)}>Cancel</button>
              <button className="tool-new" onClick={confirmSave}>Record it</button>
            </div>
          </div>
        </div>
      )}

      {editCtx && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditCtx(null); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Edit recorded computation</h3>
            {(() => {
              const rec = wtcRecords.find((r) => r.id === editCtx.recId);
              const nextV = rec ? wtcRecords.filter((r) => r.period === rec.period).length + 1 : 0;
              return rec ? (
                <p>
                  You are about to edit the recorded computation of <b>{client.name}</b> for <b>{periodMonthLabel(rec.period)}</b> (version {rec.version}).
                  The recorded version stays locked — your changes will be saved as <b>version {nextV}</b>, and the reason below becomes its remarks.
                </p>
              ) : null;
            })()}
            <div className="prof-grid">
              <div className="prof-field full">
                <label>Reason for the change (required)</label>
                <input className="mem-input" value={editCtx.reason} onChange={(e) => setEditCtx({ ...editCtx, reason: e.target.value })} />
              </div>
            </div>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setEditCtx(null)}>Cancel</button>
              <button className="tool-new" onClick={confirmEdit}>Load for editing</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
