'use client';

import { useState } from 'react';
import type { Client } from '@/lib/types';
import {
  buildDraftData, draftTotals, fmtDateMDY, normDraftLines, periodMonthLabel, wtcFmt, wtcNum,
  type DraftData, type DraftRecord, type WtcRecord,
} from '@/lib/payroll';
import { STEPS } from '@/lib/birReturns';
import { buildBirFormPdf, draftPdfName } from '@/lib/bir1601c';
import { newTaskId } from '@/lib/ui';
import type { WpMain } from '@/hooks/useWpData';

// Draft Return — BIR Form 1601-C drafted from the recorded Withholding Tax
// Computation. The preview overlays the numbers onto the actual form; saving
// advances the pipeline to Return Drafted.

const ADJ_FIELDS: [string, string][] = [
  ['adj', 'Item 26 · Adjustment of taxes withheld from previous months'],
  ['other', 'Item 28 · Tax remitted in previously filed return (amended)'],
  ['other2', 'Item 29 · Other remittances made'],
  ['surcharge', 'Item 32 · Surcharge'],
  ['interest', 'Item 33 · Interest'],
  ['compromise', 'Item 34 · Compromise'],
];

export default function WpDraft({
  client,
  main,
  patchMain,
  wtcRecords,
  drafts,
  addDraft,
  myName,
  toast,
  onBack,
  onDraftSaved,
  taxRecordStage,
}: {
  client: Client;
  main: WpMain;
  patchMain: (p: Partial<WpMain>) => void;
  wtcRecords: WtcRecord[];
  drafts: DraftRecord[];
  addDraft: (d: DraftRecord) => void;
  myName: string;
  toast: (m: string) => void;
  onBack: () => void;
  onDraftSaved: (period: string) => void;
  taxRecordStage: (period: string) => { stage: number; dates: Record<string, string> };
}) {
  const [view, setView] = useState<'list' | 'summary'>('list');
  const [preview, setPreview] = useState<{ data: DraftData; saved: DraftRecord | null; url: string | null; error: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reason, setReason] = useState('');

  async function buildPreview(data: DraftData, saved: DraftRecord | null) {
    setPreview({ data, saved, url: null, error: '' });
    try {
      const bytes = await buildBirFormPdf(client, data, saved);
      const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
      setPreview((p) => (p && p.data.period === data.period ? { ...p, url } : p));
    } catch {
      setPreview((p) => (p ? { ...p, error: 'Couldn’t build the draft return — check your internet connection.' } : p));
    }
  }
  function openPeriod(period: string) {
    const data = buildDraftData(wtcRecords, period, main.wtcDrafts[period] || {});
    if (!data) return;
    buildPreview(data, null);
  }
  function openSaved(d: DraftRecord) {
    buildPreview({ period: d.period, basedOn: d.basedOn, lines: normDraftLines(d.lines) }, d);
  }
  function setAdjField(key: string, value: string) {
    if (!preview || preview.saved) return;
    const period = preview.data.period;
    const cur = { ...(main.wtcDrafts[period] || {}) };
    cur[key] = value.trim() === '' ? '' : wtcFmt(wtcNum(value));
    patchMain({ wtcDrafts: { ...main.wtcDrafts, [period]: cur } });
    const data = buildDraftData(wtcRecords, period, cur);
    if (data) buildPreview(data, null);
  }
  function download() {
    if (!preview?.url) { toast('Still building the draft return — one moment'); return; }
    const a = document.createElement('a');
    a.href = preview.url;
    a.download = draftPdfName(client, preview.data.period, preview.saved);
    a.click();
  }
  function startSave() {
    if (!preview || preview.saved) return;
    const existing = drafts.filter((r) => r.period === preview.data.period);
    setReason('');
    if (existing.length) setReasonOpen(true);
    else setConfirmOpen(true);
  }
  function commit(remarks: string) {
    if (!preview) return;
    const existing = drafts.filter((r) => r.period === preview.data.period);
    addDraft({
      id: `d${newTaskId()}`,
      period: preview.data.period, version: existing.length + 1, basedOn: preview.data.basedOn,
      savedAt: new Date().toISOString(), savedBy: myName, remarks,
      preparer: client.preparer || '', reviewer: client.reviewer || '', lines: preview.data.lines,
    });
    setConfirmOpen(false);
    setReasonOpen(false);
    setPreview(null);
    setView('list');
    onDraftSaved(preview.data.period);
    toast(`Draft return saved for approval — version ${existing.length + 1}`);
  }

  const head = (
    <>
      <div className="tc-page-head">
        <h2>Draft Return</h2>
        <button className="uname-skip" onClick={onBack}>← 1601-C · {client.name}</button>
      </div>
      <div className="tc-sub-line">{client.name} · BIR Form 1601-C drafted from the recorded Withholding Tax Computation</div>
    </>
  );

  const listView = (() => {
    const sorted = [...drafts].sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    return (
      <>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <div className="tc-sub" style={{ flex: 1 }}>
            {sorted.length
              ? 'Saved draft returns — click a row to open the A4 draft.'
              : `No draft returns yet for ${client.name} — click + Add draft return to open the monthly summary.`}
          </div>
          <button className="tool-new" onClick={() => {
            if (!wtcRecords.length) { toast('Record a Withholding Tax Computation first'); return; }
            setView('summary');
          }}>+ Add draft return</button>
        </div>
        {sorted.length > 0 && (
          <div className="tc-card" style={{ marginTop: 4 }}>
            <div className="tc-card-title">Saved draft returns <span className="due-count">{sorted.length}</span></div>
            <div className="tc-scroll">
              <table className="wp-table">
                <thead><tr><th>Period</th><th className="ta-c">Version</th><th className="ta-c">Based on</th><th>Saved</th><th>By</th><th className="ta-r">Amount due</th><th>Pipeline</th></tr></thead>
                <tbody>
                  {sorted.map((d) => {
                    const rec = taxRecordStage(d.period);
                    const done = STEPS.slice(Math.max(0, rec.stage - 3), rec.stage);
                    const next = STEPS[rec.stage];
                    return (
                      <tr key={d.id} className="wp-row" onClick={() => openSaved(d)}>
                        <td className="tc-name">{periodMonthLabel(d.period)}</td>
                        <td className="ta-c">v{d.version}</td>
                        <td className="ta-c">WTC v{d.basedOn}</td>
                        <td>{fmtDateMDY(String(d.savedAt).slice(0, 10))}</td>
                        <td>{d.savedBy || '—'}</td>
                        <td className="ta-r">{wtcFmt((d.lines && d.lines.l25) || 0)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {done.map((s) => <span className="pm-chip" key={s.key} title={s.label + (rec.dates[s.key] ? ' · ' + rec.dates[s.key] : '')}>{s.short} ✓</span>)}
                          {next ? <span className="pm-chip next" title={`Next: ${next.label}`}>{next.short} next</span> : <span className="pm-chip full">Complete</span>}
                          {d.remarks && <div className="tc-sub" style={{ maxWidth: 260, whiteSpace: 'normal' }}>{d.remarks}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    );
  })();

  const summaryView = (() => {
    const byPeriod: Record<string, WtcRecord> = {};
    wtcRecords.forEach((r) => { if (!byPeriod[r.period] || r.version > byPeriod[r.period].version) byPeriod[r.period] = r; });
    const periods = Object.keys(byPeriod).sort();
    const F = (v: number) => (Math.abs(v) < 0.005 ? <span style={{ color: 'var(--dim)' }}>—</span> : wtcFmt(v));
    return (
      <>
        <div className="tc-card" style={{ marginTop: 12 }}>
          <div className="tc-card-title">Monthly summary <span className="due-count">{periods.length} month{periods.length === 1 ? '' : 's'}</span></div>
          <div className="tc-sub" style={{ marginBottom: 8 }}>
            One row per recorded computation. <b style={{ color: 'var(--white)' }}>Per client</b> is the W/TAX in the payroll data;{' '}
            <b style={{ color: 'var(--white)' }}>Should be</b> is the system computation; <b style={{ color: 'var(--white)' }}>Variance</b> = per client − should be. Click a month to open its draft return.
          </div>
          <div className="wtc-scroll" style={{ maxHeight: '64vh' }}>
            <table className="wp-table">
              <thead>
                <tr>
                  <th>Month</th><th className="ta-r">Total Compensation</th><th className="ta-r">MWE</th><th className="ta-r">HONSHA (MWEs)</th>
                  <th className="ta-r">13th Month &amp; OB</th><th className="ta-r">De Minimis</th><th className="ta-r">Gov’t Stats</th>
                  <th className="ta-r">Other Non-Taxable</th><th className="ta-r">Total Non-Taxable</th><th className="ta-r">Taxable</th>
                  <th className="ta-r">≤250K Not Subject</th><th className="ta-r">Net Taxable</th><th className="ta-r">Tax — Per Client</th>
                  <th className="ta-r">Should Be</th><th className="ta-r">Variance</th><th />
                </tr>
              </thead>
              <tbody>
                {periods.map((p) => {
                  const r = byPeriod[p];
                  const t = draftTotals(r);
                  const perClient = r.rows.reduce((a, row) => a + Math.abs(wtcNum(row[25])), 0);
                  const totalNT = t.mweBasic + t.mweOt + t.thirteen + t.demin + t.contrib + t.otherNT;
                  const variance = perClient - t.tax;
                  const nDrafts = drafts.filter((x) => x.period === p).length;
                  return (
                    <tr key={p} className="wp-row" onClick={() => openPeriod(p)}>
                      <td><div className="tc-name">{periodMonthLabel(p)}</div><div className="tc-sub">WTC v{r.version}{nDrafts ? ` · draft v${nDrafts} saved` : ''}</div></td>
                      <td className="ta-r">{F(t.gross)}</td>
                      <td className="ta-r">{F(t.mweBasic)}</td>
                      <td className="ta-r">{F(t.mweOt)}</td>
                      <td className="ta-r">{F(t.thirteen)}</td>
                      <td className="ta-r">{F(t.demin)}</td>
                      <td className="ta-r">{F(t.contrib)}</td>
                      <td className="ta-r">{F(t.otherNT)}</td>
                      <td className="ta-r" style={{ fontWeight: 700 }}>{F(totalNT)}</td>
                      <td className="ta-r" style={{ fontWeight: 700 }}>{F(t.taxable)}</td>
                      <td className="ta-r">{F(t.le250)}</td>
                      <td className="ta-r" style={{ fontWeight: 700 }}>{F(t.taxable - t.le250)}</td>
                      <td className="ta-r">{F(perClient)}</td>
                      <td className="ta-r" style={{ fontWeight: 700 }}>{F(t.tax)}</td>
                      <td className={`ta-r${Math.abs(variance) > 0.009 ? ' wtc-warn' : ''}`} style={Math.abs(variance) > 0.009 ? { fontWeight: 700 } : undefined}>{F(variance)}</td>
                      <td className="ta-r"><span style={{ color: 'var(--blue)', fontWeight: 600, fontSize: '.74rem' }}>Draft →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="uname-actions">
          <button className="uname-skip" onClick={() => setView('list')}>← Back to drafts</button>
        </div>
      </>
    );
  })();

  return (
    <>
      {head}
      {view === 'summary' ? summaryView : listView}

      {preview && (
        <div className="cal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setPreview(null); }}>
          <div className="cal-modal dir-modal" role="dialog" aria-modal="true" aria-label="Draft return preview">
            <div className="dir-head">
              <div style={{ flex: 1 }}>
                <div className="dir-firm">Draft Return — BIR Form 1601-C</div>
                <div className="dir-subtitle">
                  {client.name} · {periodMonthLabel(preview.data.period)} · {preview.saved ? `version ${preview.saved.version}` : 'unsaved preview (watermarked until saved)'}
                  {preview.saved?.remarks ? ` · Remarks: ${preview.saved.remarks}` : ''}
                </div>
              </div>
              <button className="cal-modal-close" aria-label="Close" onClick={() => setPreview(null)}>×</button>
            </div>
            <div className="cal-modal-body">
              {!preview.saved && (
                <div className="tc-card" style={{ marginTop: 0, marginBottom: 12 }}>
                  <div className="tc-card-title">Adjustments &amp; penalties (optional)</div>
                  <div className="adj-grid">
                    {ADJ_FIELDS.map(([k, label]) => (
                      <div key={k}>
                        <div className="tc-sub" style={{ marginBottom: 3 }}>{label}</div>
                        <input className="mem-input ta-r" defaultValue={(main.wtcDrafts[preview.data.period] || {})[k] || ''}
                          placeholder="0.00" onBlur={(e) => setAdjField(k, e.target.value)} />
                      </div>
                    ))}
                  </div>
                  <div className="tc-sub" style={{ marginTop: 8 }}>Items 27, 30, 31, 35, and 36 recompute automatically — the preview below rebuilds on change.</div>
                </div>
              )}
              {preview.error
                ? <div className="empty-note">{preview.error}</div>
                : preview.url
                  ? <iframe className="draft-frame" src={`${preview.url}#toolbar=0&navpanes=0`} title="BIR Form 1601-C draft" />
                  : <div className="empty-note" style={{ padding: '60px 0', textAlign: 'center' }}>Building the draft return…</div>}
              <div className="rep-actions">
                <button className="uname-skip" onClick={() => setPreview(null)}>Close</button>
                <button className="uname-skip" onClick={download}>⬇ Download PDF</button>
                {!preview.saved && <button className="tool-new" onClick={startSave}>Save for approval</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmOpen && preview && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Save draft for approval</h3>
            <p>
              You are saving the <b>{periodMonthLabel(preview.data.period)}</b> draft return of <b>{client.name}</b>.
              Once saved, the 1601-C pipeline for this period <b>automatically advances to Return Drafted</b> and the steps up to
              Return Drafted <b>can no longer be unchecked</b>. Later versions only add a record — the pipeline status stays.
            </p>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setConfirmOpen(false)}>Cancel</button>
              <button className="tool-new" onClick={() => commit('')}>Save draft</button>
            </div>
          </div>
        </div>
      )}

      {reasonOpen && preview && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setReasonOpen(false); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Another draft this month</h3>
            <p>
              <b>{periodMonthLabel(preview.data.period)}</b> already has {drafts.filter((r) => r.period === preview.data.period).length} saved
              draft{drafts.filter((r) => r.period === preview.data.period).length === 1 ? '' : 's'} for <b>{client.name}</b>. Only one draft per month is
              expected — saving another requires a reason and is recorded as version {drafts.filter((r) => r.period === preview.data.period).length + 1}.
              The pipeline status stays as it is.
            </p>
            <div className="prof-grid">
              <div className="prof-field full">
                <label>Reason (required)</label>
                <input className="mem-input" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            </div>
            <div className="uname-actions">
              <button className="uname-skip" onClick={() => setReasonOpen(false)}>Cancel</button>
              <button className="tool-new" onClick={() => { if (!reason.trim()) { toast('A reason is required for an additional draft this month'); return; } commit(reason.trim()); }}>Save new version</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
