'use client';

import { useRef, useState } from 'react';
import type { Client } from '@/lib/types';
import { addThousands, fmtDateMDY, fullNameOf, parseEmployeeImport, type Employee } from '@/lib/payroll';
import { fmtMoney } from '@/lib/birReturns';
import { newTaskId } from '@/lib/ui';
import { downloadEmpMasterlist, downloadEmpTemplate, readWorkbookRows } from '@/lib/wpExports';
import type { WpMain } from '@/hooks/useWpData';
import DatePicker from '@/components/DatePicker';

// Employee Masterlist — company employees covered by payroll withholding.

const TYPES = [
  { v: 'T', label: 'T · Taxable' },
  { v: 'M', label: 'M · Minimum wage' },
  { v: 'N', label: 'N · Not taxable' },
];
const STATUSES = ['Active', 'Separated'];

export default function WpEmployees({
  client,
  cluster,
  main,
  patchMain,
  toast,
  onBack,
}: {
  client: Client;
  cluster: string;
  main: WpMain;
  patchMain: (p: Partial<WpMain>) => void;
  toast: (m: string) => void;
  onBack: () => void;
}) {
  const emps = main.employees;
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const [impOpen, setImpOpen] = useState(false);

  function openEmp(e: Employee | 'new') {
    const x = e === 'new' ? ({} as Partial<Employee>) : e;
    setF({
      lastName: x.lastName || x.name || '', firstName: x.firstName || '', middleName: x.middleName || '',
      tin: x.tin || '', address: x.address || '', position: x.position || '',
      dateHired: x.dateHired || '', dateTerminated: x.dateTerminated || '',
      monthlyRate: addThousands(x.monthlyRate || ''), dailyRate: addThousands(x.dailyRate || ''),
      type: x.type || 'T', status: x.status || 'Active',
    });
    setEditing(e);
  }

  function saveEmp() {
    const lastName = (f.lastName || '').trim();
    const firstName = (f.firstName || '').trim();
    if (!lastName) { toast('Last name is required'); return; }
    if (!firstName) { toast('First name is required'); return; }
    const middleName = (f.middleName || '').trim();
    const data = {
      name: `${lastName.toUpperCase()}, ${firstName.toUpperCase()}${middleName ? ' ' + middleName.toUpperCase() : ''}`,
      lastName, firstName, middleName,
      tin: (f.tin || '').trim(), address: (f.address || '').trim(), position: (f.position || '').trim(),
      dateHired: f.dateHired || '', dateTerminated: f.dateTerminated || '',
      monthlyRate: (f.monthlyRate || '').replace(/,/g, '').trim(), dailyRate: (f.dailyRate || '').replace(/,/g, '').trim(),
      type: f.type || 'T', status: f.status || 'Active',
    };
    if (editing && editing !== 'new') {
      patchMain({ employees: emps.map((x) => (x.id === editing.id ? { ...x, ...data } : x)) });
    } else {
      patchMain({ employees: [...emps, { id: `e${newTaskId()}`, ...data }] });
    }
    setEditing(null);
    toast('Employee saved');
  }

  function deleteEmp() {
    if (!editing || editing === 'new') return;
    patchMain({ employees: emps.filter((x) => x.id !== editing.id) });
    setEditing(null);
    toast('Employee removed');
  }

  async function handleImport(input: HTMLInputElement) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    setImpOpen(false);
    let rows;
    try {
      rows = await readWorkbookRows(file);
    } catch {
      toast('Could not read that file — is it a valid Excel/CSV?');
      return;
    }
    const res = parseEmployeeImport(rows);
    if ('error' in res) { toast(res.error); return; }
    if (!res.employees.length) { toast('No employees found in the file'); return; }
    patchMain({ employees: [...emps, ...res.employees.map((e) => ({ id: `e${newTaskId()}`, ...e }))] });
    toast(`Imported ${res.employees.length} employee${res.employees.length === 1 ? '' : 's'}${res.skipped ? ` · ${res.skipped} row${res.skipped === 1 ? '' : 's'} skipped (missing name)` : ''}`);
  }

  return (
    <>
      <div className="tc-page-head">
        <h2>Employee Masterlist</h2>
        <button className="uname-skip" onClick={onBack}>← 1601-C · {client.name}</button>
      </div>
      <div className="tc-sub-line">{client.name} · {emps.length} employee{emps.length === 1 ? '' : 's'} · click a row to edit</div>
      <div className="toolbar" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button className="uname-skip" onClick={() => downloadEmpMasterlist('xlsx', client.name, cluster, emps).catch(() => toast('Couldn’t load the Excel engine — check your connection'))}>⬇ Excel</button>
        <button className="uname-skip" onClick={() => downloadEmpMasterlist('pdf', client.name, cluster, emps).catch(() => toast('Couldn’t load the PDF engine — check your connection'))}>⬇ PDF</button>
        <button className="uname-skip" onClick={() => setImpOpen(true)}>⬆ Import from Excel</button>
        <button className="tool-new" onClick={() => openEmp('new')}>+ Add employee</button>
        <input type="file" ref={fileRef} accept=".xlsx,.xls,.csv" hidden onChange={(e) => handleImport(e.target)} />
      </div>
      {emps.length ? (
        <div className="tc-scroll">
          <table className="wp-table">
            <thead>
              <tr>
                <th>#</th><th>Last name</th><th>First name</th><th>Middle name</th><th>Full name</th>
                <th className="ta-c">TIN</th><th>Position</th><th>Address</th><th>Date hired</th><th>Date terminated</th>
                <th className="ta-r">Monthly rate</th><th className="ta-r">Daily rate</th><th className="ta-c">Type</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {emps.map((e, i) => (
                <tr key={e.id} className="wp-row" onClick={() => openEmp(e)}>
                  <td className="tc-sub">{i + 1}</td>
                  <td>{(e.lastName || '').toUpperCase() || '—'}</td>
                  <td>{(e.firstName || '').toUpperCase() || '—'}</td>
                  <td>{(e.middleName || '').toUpperCase() || '—'}</td>
                  <td className="tc-name">{fullNameOf(e) || '—'}</td>
                  <td className="ta-c">{e.tin || '—'}</td>
                  <td>{e.position || '—'}</td>
                  <td>{e.address || '—'}</td>
                  <td>{fmtDateMDY(e.dateHired) || '—'}</td>
                  <td>{fmtDateMDY(e.dateTerminated) || '—'}</td>
                  <td className="ta-r">{fmtMoney(e.monthlyRate)}</td>
                  <td className="ta-r">{fmtMoney(e.dailyRate)}</td>
                  <td className="ta-c" title="T = taxable · M = minimum wage · N = not taxable">{e.type || '—'}</td>
                  <td><span className={`flagchip ${e.status === 'Separated' ? 'grey' : 'green'}`}>{e.status || 'Active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-note" style={{ marginTop: 14 }}>
          No employees encoded yet for {client.name} — click + Add employee to start the masterlist, or import from Excel.
        </div>
      )}

      {impOpen && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setImpOpen(false); }}>
          <div className="uname-card" role="dialog" aria-modal="true">
            <h3>Import employees from Excel</h3>
            <p>
              The file needs a header row with at least <b>LAST NAME</b> and <b>FIRST NAME</b> — the other columns
              (TIN, address, position, dates, rates, type, status) are picked up when present.
            </p>
            <div className="uname-actions" style={{ flexWrap: 'wrap' }}>
              <button className="uname-skip" onClick={() => downloadEmpTemplate().catch(() => toast('Couldn’t load the Excel engine'))}>⬇ Download template</button>
              <button className="uname-skip" onClick={() => setImpOpen(false)}>Cancel</button>
              <button className="tool-new" onClick={() => fileRef.current?.click()}>Choose file…</button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="uname-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="uname-card client-card" role="dialog" aria-modal="true">
            <h3>{editing === 'new' ? 'Add employee' : 'Edit employee'}</h3>
            <div className="prof-grid">
              <div className="prof-field"><label>Last name</label>
                <input className="mem-input" value={f.lastName} onChange={(e) => setF((s) => ({ ...s, lastName: e.target.value }))} /></div>
              <div className="prof-field"><label>First name</label>
                <input className="mem-input" value={f.firstName} onChange={(e) => setF((s) => ({ ...s, firstName: e.target.value }))} /></div>
              <div className="prof-field"><label>Middle name</label>
                <input className="mem-input" value={f.middleName} onChange={(e) => setF((s) => ({ ...s, middleName: e.target.value }))} /></div>
              <div className="prof-field"><label>TIN</label>
                <input className="mem-input" placeholder="000-000-000-000" value={f.tin} onChange={(e) => setF((s) => ({ ...s, tin: e.target.value }))} /></div>
              <div className="prof-field full"><label>Address</label>
                <input className="mem-input" value={f.address} onChange={(e) => setF((s) => ({ ...s, address: e.target.value }))} /></div>
              <div className="prof-field"><label>Position</label>
                <input className="mem-input" value={f.position} onChange={(e) => setF((s) => ({ ...s, position: e.target.value }))} /></div>
              <div className="prof-field"><label>Type</label>
                <div className="txp-row">
                  {TYPES.map((t) => (
                    <button key={t.v} type="button" className={`txp${f.type === t.v ? ' on' : ''}`} title={t.label}
                      onClick={() => setF((s) => ({ ...s, type: t.v }))}>{t.v}</button>
                  ))}
                </div>
              </div>
              <div className="prof-field"><label>Date hired</label>
                <div className="mem-input"><DatePicker value={f.dateHired} ariaLabel="Date hired" onChange={(v) => setF((s) => ({ ...s, dateHired: v }))} /></div></div>
              <div className="prof-field"><label>Date terminated</label>
                <div className="mem-input"><DatePicker value={f.dateTerminated} ariaLabel="Date terminated" onChange={(v) => setF((s) => ({ ...s, dateTerminated: v }))} /></div></div>
              <div className="prof-field"><label>Monthly rate (₱)</label>
                <input className="mem-input" inputMode="decimal" value={f.monthlyRate}
                  onChange={(e) => setF((s) => ({ ...s, monthlyRate: addThousands(e.target.value) }))} /></div>
              <div className="prof-field"><label>Daily rate (₱)</label>
                <input className="mem-input" inputMode="decimal" value={f.dailyRate}
                  onChange={(e) => setF((s) => ({ ...s, dailyRate: addThousands(e.target.value) }))} /></div>
              <div className="prof-field"><label>Status</label>
                <div className="txp-row">
                  {STATUSES.map((st) => (
                    <button key={st} type="button" className={`txp${f.status === st ? ' on' : ''}`}
                      onClick={() => setF((s) => ({ ...s, status: st }))}>{st}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="uname-actions" style={{ flexWrap: 'wrap' }}>
              {editing !== 'new' && (
                <button className="mem-del" style={{ marginRight: 'auto' }} onClick={deleteEmp}>Delete employee</button>
              )}
              <button className="uname-skip" onClick={() => setEditing(null)}>Cancel</button>
              <button className="tool-new" onClick={saveEmp}>Save employee</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
