// Official BIR Form 1601-C (Jan 2018): overlay the draft data onto the real
// form images with pdf-lib — coordinates ported verbatim from the tax system.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { Client } from '@/lib/types';
import type { DraftData, DraftRecord } from '@/lib/payroll';
import { loadPdfLib } from '@/lib/reportExport';

export async function buildBirFormPdf(client: Client, data: DraftData, saved: DraftRecord | null): Promise<Uint8Array> {
  await loadPdfLib();
  const [bg1, bg2] = await Promise.all([
    fetch('/forms/1601C_p1.jpg').then((r) => r.arrayBuffer()),
    fetch('/forms/1601C_p2.jpg').then((r) => r.arrayBuffer()),
  ]);
  const { PDFDocument, StandardFonts, rgb, degrees } = (window as any).PDFLib;
  const doc = await PDFDocument.create();
  const img1 = await doc.embedJpg(bg1);
  const img2 = await doc.embedJpg(bg2);
  const p1 = doc.addPage([612, 936]);
  p1.drawImage(img1, { x: 0, y: 0, width: 612, height: 936 });
  const p2pg = doc.addPage([612, 936]);
  p2pg.drawImage(img2, { x: 0, y: 0, width: 612, height: 936 });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const c = client, L = data.lines;
  const [py, pm] = data.period.split('-');
  const ink = rgb(0.06, 0.09, 0.16);
  const ctr = (cx: number, y: number, s: string, size?: number, f?: any) => {
    const ff = f || bold, sz = size || 9;
    p1.drawText(String(s), { x: cx - ff.widthOfTextAtSize(String(s), sz) / 2, y, size: sz, font: ff, color: ink });
  };
  /* the form is a per-character grid: cells are 14.34pt wide */
  const PITCH = 14.34;
  const cellText = (s: string, y: number, startX: number, maxCells: number, size?: number, f?: any) => {
    String(s).slice(0, maxCells).split('').forEach((ch, i) => {
      if (ch === ' ') return;
      ctr(startX + PITCH * (i + 0.5), y, ch, size || 8, f);
    });
  };
  // amounts: one digit per cell, right-aligned before the centavo cells
  const amt = (y: number, v: number) => {
    const n = Math.round((+v || 0) * 100);
    const digits = String(Math.trunc(Math.abs(n) / 100)).split('').reverse();
    digits.forEach((d, i) => ctr(541.9 - PITCH * i, y + 1, d, 8, font));
    if (n < 0) ctr(541.9 - PITCH * digits.length, y + 1, '-', 8, font);
    const cents = String(Math.abs(n) % 100).padStart(2, '0');
    ctr(571.6, y + 1, cents[0], 8, font);
    ctr(586.6, y + 1, cents[1], 8, font);
  };
  /* Part I — background information */
  ctr(53.5, 812, pm[0]); ctr(67.7, 812, pm[1]); // 1 · For the Month: MM
  [82, 96.2, 110.5, 124.9].forEach((cx, i) => ctr(cx, 812, py[i])); // …YYYY
  ctr(238, 812, 'X'); // 2 · Amended Return? No
  ctr(311.1, 812, 'X'); // 3 · Any Taxes Withheld? Yes
  const dg = String(c.tin || '').replace(/\D/g, '');
  if (dg) { // 6 · TIN, one digit per box
    const cells = [
      [240.1, 254.6, 269.1],
      [297.3, 311.8, 326.3],
      [354.9, 369.3, 383.8],
      [412.3, 426.8, 441.3, 455.8, 470.4],
    ];
    const groups = [dg.slice(0, 3), dg.slice(3, 6), dg.slice(6, 9), dg.slice(9, 14) || '000'];
    groups.forEach((g, gi) => g.split('').forEach((ch, i) => {
      if (cells[gi][i] != null) ctr(cells[gi][i], 779, ch);
    }));
  }
  const rdo = String(c.rdo || '').replace(/[^\w]/g, '').slice(0, 3);
  rdo.split('').forEach((ch, i) => ctr([556.3, 571, 586.2][i], 779, ch)); // 7 · RDO Code
  cellText((c.name || '').toUpperCase(), 756, 17.3, 40, 8, bold); // 8 · Registered name
  const addr = String(c.address || '').toUpperCase();
  if (addr) { // 9 · Registered address across its two cell rows
    cellText(addr.slice(0, 40), 729, 17.3, 40, 7.5);
    if (addr.length > 40) cellText(addr.slice(40, 70).replace(/^ +/, ''), 712, 17.3, 30, 7.5);
  }
  ctr(453.9, 696, 'X'); // 11 · Category: Private
  ctr(225.2, 660, 'X'); // 13 · Tax relief under special law? No
  /* Part II — computation (row y = the printed centavo-dot baseline) */
  ([
    [628, L.l14],
    [601.7, L.l15A], [585.8, L.l15B], [569.8, L.l15C],
    [553.8, L.l15D], [537.9, L.l15E], [521.4, L.l15F],
    [505.9, L.l15T],
    [490, L.l16],
    [474, L.le250],
    [458, L.l24n],
    [442, L.l17],
    [426, L.l18],
    [410, L.l27],
    [394, L.l19],
    [380, L.l29],
    [362, L.l30],
    [346, L.l20],
    [330, L.l21], [314, L.l22], [298, L.l23],
    [282, L.l24],
    [266, L.l25],
  ] as [number, number][]).forEach((r) => amt(r[0], r[1] || 0));
  /* saved drafts are the actual return — clean; unsaved previews stay watermarked */
  if (!saved) {
    doc.getPages().forEach((pg: any) => {
      pg.drawText('DRAFT — FOR REVIEW', { x: 70, y: 260, size: 56, font: bold, color: rgb(.45, .52, .66), opacity: .16, rotate: degrees(38) });
    });
  }
  return doc.save();
}

export function draftPdfName(client: Client, period: string, saved: DraftRecord | null) {
  const base = client.name.replace(/[^\w ]+/g, '').trim().replace(/ +/g, '_');
  return `${base}_BIR_1601C_${period}${saved ? '_v' + saved.version : ''}.pdf`;
}
