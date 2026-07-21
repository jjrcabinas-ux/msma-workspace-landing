// Working-paper downloads: employee/payroll templates, the employee
// masterlist (Excel/PDF), and the 1604-C alphalist (Excel/CSV) — ported
// from the tax compliance system.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { loadJsPdf, loadXlsx } from '@/lib/reportExport';
import {
  ANNUALIST_HEADERS, PAYROLL_HEADERS, annualistRows, fmtDateMDY, type AnnEmp, type Employee,
} from '@/lib/payroll';
import { todayISO } from '@/lib/dates';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function downloadEmpTemplate() {
  await loadXlsx();
  const XLSX = (window as any).XLSX;
  const ws = XLSX.utils.aoa_to_sheet([
    ['LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'TIN', 'ADDRESS', 'POSITION', 'DATE HIRED', 'DATE TERMINATED', 'MONTHLY RATE', 'DAILY RATE', 'TYPE (T/M/N)', 'STATUS'],
    ['DELA CRUZ', 'JUAN', 'PROTACIO', '123-456-789-000', '123 MABINI ST., CEBU CITY', 'ACCOUNTING STAFF', '01/15/2024', '', '25000', '1136.36', 'T', 'Active'],
    ['SANTOS', 'MARIA', 'LOPEZ', '987-654-321-000', '45 RIZAL AVE., MANDAUE CITY', 'HR SUPERVISOR', '06/01/2022', '03/31/2026', '32000', '1454.55', 'M', 'Separated'],
  ]);
  ws['!cols'] = [{ wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 30 }, { wch: 22 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  XLSX.writeFile(wb, 'MSMA_Employee_Masterlist_Template.xlsx');
}

export async function downloadPayrollTemplate() {
  await loadXlsx();
  const XLSX = (window as any).XLSX;
  const ws = XLSX.utils.aoa_to_sheet([
    PAYROLL_HEADERS,
    ['06/30/2026', '06/01/2026', '06/15/2026', 'DELA CRUZ', 'JUAN', 'PROTACIO', 'JUAN PROTACIO DELA CRUZ', '123-456-789-000',
      1136.36, 11, 12500, 0, 0, 1000, 0, 0, 0, 0, 0, 0, 0, 13500, 562.50, 100, 187.50, 937.50, 0, 0, 0, 0, 11712.50],
    ['06/30/2026', '06/16/2026', '06/30/2026', 'DELA CRUZ', 'JUAN', 'PROTACIO', 'JUAN PROTACIO DELA CRUZ', '123-456-789-000',
      1136.36, 11, 12500, 500, 0, 1000, 0, 0, 0, 150, 0, 0, 0, 13850, 562.50, 100, 187.50, 937.50, 0, 0, 0, 0, 12062.50],
  ]);
  ws['!cols'] = PAYROLL_HEADERS.map((h) => ({ wch: Math.max(10, Math.min(24, h.length + 4)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
  XLSX.writeFile(wb, 'MSMA_Standard_Payroll_Template.xlsx');
}

const EMP_EXPORT_HEADERS = ['#', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'FULL NAME', 'TIN', 'POSITION', 'ADDRESS', 'DATE HIRED', 'DATE TERMINATED', 'MONTHLY RATE', 'DAILY RATE', 'TYPE', 'STATUS'];
function empExportRows(emps: Employee[]) {
  return emps.map((e, i) => [
    i + 1,
    (e.lastName || '').toUpperCase(), (e.firstName || '').toUpperCase(), (e.middleName || '').toUpperCase(),
    [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ').toUpperCase() || (e.name || ''),
    e.tin || '', e.position || '', e.address || '', fmtDateMDY(e.dateHired), fmtDateMDY(e.dateTerminated),
    e.monthlyRate ? +e.monthlyRate : '', e.dailyRate ? +e.dailyRate : '',
    e.type || '', e.status || 'Active',
  ]);
}

export async function downloadEmpMasterlist(fmt: 'xlsx' | 'pdf', clientName: string, cluster: string, emps: Employee[]) {
  const stamp = todayISO();
  const base = `${clientName.replace(/[^\w ]+/g, '').trim().replace(/ +/g, '_')}_Employee_Masterlist_${stamp}`;
  if (fmt === 'xlsx') {
    await loadXlsx();
    const XLSX = (window as any).XLSX;
    const ws = XLSX.utils.aoa_to_sheet([EMP_EXPORT_HEADERS, ...empExportRows(emps)]);
    ws['!cols'] = [{ wch: 4 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 28 }, { wch: 17 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 13 }, { wch: 11 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, base + '.xlsx');
  } else {
    await loadJsPdf();
    const doc = new (window as any).jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const t = new Date();
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.text(`${clientName} — Employee Masterlist`, 14, 14);
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100);
    doc.text(`${cluster} Cluster · as of ${MONTHS[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()} · ${emps.length} employee${emps.length === 1 ? '' : 's'}`, 14, 20);
    doc.autoTable({
      startY: 25,
      head: [EMP_EXPORT_HEADERS],
      body: empExportRows(emps).map((r) => r.map((v, ci) => ((ci === 10 || ci === 11) && v !== '' ? Number(v).toLocaleString('en-PH', { minimumFractionDigits: 2 }) : v))),
      styles: { fontSize: 6.5, cellPadding: 1.5 },
      headStyles: { fillColor: [10, 22, 40], fontSize: 6.5 },
      columnStyles: { 5: { halign: 'center' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'center' } },
    });
    doc.save(base + '.pdf');
  }
}

export async function downloadAnnualist(fmt: 'xlsx' | 'csv', clientName: string, year: string, list: AnnEmp[]) {
  const rows = annualistRows(list);
  const base = `${clientName.replace(/[^\w ]+/g, '').trim().replace(/ +/g, '_')}_Alphalist_1604C_${year}`;
  if (fmt === 'csv') {
    const esc = (v: unknown) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = [ANNUALIST_HEADERS, ...rows].map((r) => r.map(esc).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = base + '.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return;
  }
  await loadXlsx();
  const XLSX = (window as any).XLSX;
  const ws = XLSX.utils.aoa_to_sheet([ANNUALIST_HEADERS, ...rows]);
  ws['!cols'] = ANNUALIST_HEADERS.map((h, i) => ({ wch: i >= 7 ? 18 : Math.max(8, Math.min(18, h.length + 2)) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Alphalist ' + year);
  XLSX.writeFile(wb, base + '.xlsx');
}

export async function readWorkbookRows(file: File): Promise<any[][]> {
  await loadXlsx();
  const XLSX = (window as any).XLSX;
  const wb = XLSX.read(await file.arrayBuffer());
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
}
