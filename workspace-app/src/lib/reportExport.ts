// Client Masterlist report export: field catalog + PDF (jsPDF/autoTable) and
// Excel (SheetJS) generators. Libraries are lazy-loaded from cdnjs with SRI
// pinning, same versions and hashes the tax compliance system uses.

import type { Client } from '@/lib/types';
import { TAX_TYPES } from '@/lib/types';
import { todayISO } from '@/lib/dates';

export type ReportField = { key: string; label: string };
export const REPORT_FIELDS: ReportField[] = [
  { key: 'tin', label: 'TIN' },
  { key: 'rdo', label: 'RDO code' },
  { key: 'address', label: 'Registered address' },
  { key: 'channel', label: 'Filing channel' },
  { key: 'taxTypes', label: 'Applicable tax types' },
  { key: 'preparer', label: 'Junior Associate In-charge' },
  { key: 'reviewer', label: 'Senior Associate / Team Leader' },
  { key: 'contact', label: 'Contact person' },
];

export function fieldValue(c: Client, key: string): string {
  switch (key) {
    case 'tin': return c.tin || '—';
    case 'rdo': return c.rdo || '—';
    case 'address': return c.address || '—';
    case 'channel': return c.channel || '—';
    case 'taxTypes': return TAX_TYPES.filter((t) => c.taxTypes[t]).join(', ') || '—';
    case 'preparer': return c.preparer || '—';
    case 'reviewer': return c.reviewer || '—';
    case 'contact': {
      const ct = c.contacts[0];
      return ct ? [ct.name, ct.position, ct.phone, ct.email].filter(Boolean).join(' · ') : '—';
    }
    default: return '—';
  }
}

function loadScriptOnce(src: string, integrity: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.integrity = integrity;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
let xlsxPromise: Promise<void> | null = null;
function loadXlsx(): Promise<void> {
  if ((window as any).XLSX) return Promise.resolve();
  if (!xlsxPromise) {
    xlsxPromise = loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
      'sha384-vtjasyidUo0kW94K5MXDXntzOJpQgBKXmE7e2Ga4LG0skTTLeBi97eFAXsqewJjw'
    ).catch((e) => { xlsxPromise = null; throw e; });
  }
  return xlsxPromise;
}

let jsPdfPromise: Promise<void> | null = null;
function loadJsPdf(): Promise<void> {
  if ((window as any).jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
  if (!jsPdfPromise) {
    jsPdfPromise = loadScriptOnce(
      'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      'sha384-JcnsjUPPylna1s1fvi1u12X5qjY5OL56iySh75FdtrwhO/SWXgMjoVqcKyIIWOLk'
    )
      .then(() =>
        loadScriptOnce(
          'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
          'sha384-fCAW/rDWORTbQXSiB7mOg0QtQ5c+r0f544y6XoKjuVva0nMBlCpNUjiFeG5iMdS3'
        )
      )
      .catch((e) => { jsPdfPromise = null; throw e; });
  }
  return jsPdfPromise;
}

function reportDate(): string {
  const t = new Date();
  const MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${MONF[t.getMonth()]} ${t.getDate()}, ${t.getFullYear()}`;
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await fetch('/logo.png').then((r) => (r.ok ? r.blob() : Promise.reject()));
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateClientsPdf(cluster: string, fields: ReportField[], clients: Client[]) {
  await loadJsPdf();
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: fields.length >= 5 ? 'landscape' : 'portrait' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const logo = await logoDataUrl();
  if (logo) { try { doc.addImage(logo, 'PNG', 40, 30, 40, 40); } catch { /* logo optional */ } }
  const textX = logo ? 92 : 40;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(10, 22, 40);
  doc.text('Mora Sanchez Meñoza & Associates', textX, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(90, 100, 115);
  doc.text(`Client Masterlist — ${cluster} Cluster · as of ${reportDate()} · ${clients.length} client${clients.length === 1 ? '' : 's'}`, textX, 64);
  doc.setDrawColor(10, 22, 40);
  doc.setLineWidth(2);
  doc.line(40, 82, pageW - 40, 82);

  (doc as any).autoTable({
    startY: 94,
    head: [['Client', ...fields.map((f) => f.label)]],
    body: clients.map((c) => [c.name, ...fields.map((f) => fieldValue(c, f.key))]),
    styles: { fontSize: 8, cellPadding: 5, lineColor: [226, 232, 240], lineWidth: 0.5, textColor: [30, 41, 59], valign: 'top' },
    headStyles: { fillColor: [10, 22, 40], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [246, 248, 251] },
    columnStyles: { 0: { fontStyle: 'bold' } },
    margin: { left: 40, right: 40, top: 94, bottom: 46 },
    didDrawPage: () => {
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated from the MSMA Workspace · ${reportDate()}`, 40, pageH - 24);
      const pg = `Page ${doc.internal.getNumberOfPages()}`;
      doc.text(pg, pageW - 40 - doc.getTextWidth(pg), pageH - 24);
    },
  });
  doc.save(`MSMA-${cluster}-Client-Masterlist-${todayISO()}.pdf`);
}

export async function generateClientsXlsx(cluster: string, fields: ReportField[], clients: Client[]) {
  await loadXlsx();
  const XLSX = (window as any).XLSX;
  const header = ['Client', ...fields.map((f) => f.label)];
  const aoa: (string | undefined)[][] = [
    ['Mora Sanchez Meñoza & Associates'],
    [`Client Masterlist — ${cluster} Cluster · as of ${reportDate()}`],
    [],
    header,
    ...clients.map((c) => [c.name, ...fields.map((f) => fieldValue(c, f.key))]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 34 }, ...fields.map((f) => ({ wch: f.key === 'address' || f.key === 'contact' ? 44 : f.key === 'taxTypes' ? 26 : 20 }))];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${cluster} Clients`);
  XLSX.writeFile(wb, `MSMA-${cluster}-Client-Masterlist-${todayISO()}.xlsx`);
}
