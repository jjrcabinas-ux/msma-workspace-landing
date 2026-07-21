// BIR returns catalog + period/deadline/flag engine — near-verbatim TS port
// from the msma-tax-compliance system (index.html), so the workspace tracks
// the exact same filing universe and urgency rules.

import { MON } from '@/lib/dates';
import type { Client } from '@/lib/types';

export type Step = { key: string; label: string; short: string };
export const STEPS: Step[] = [
  { key: 'requested', label: 'Data Requested', short: 'RQ' },
  { key: 'received', label: 'Data Received', short: 'RC' },
  { key: 'drafted', label: 'Return Drafted', short: 'DR' },
  { key: 'reviewed', label: 'Reviewed', short: 'RV' },
  { key: 'approved', label: 'Client Approved', short: 'AP' },
  { key: 'filed', label: 'Filed', short: 'FI' },
  { key: 'paid', label: 'Paid', short: 'PY' },
  { key: 'archived', label: 'Archived', short: 'AR' },
];

export type Freq = 'M' | 'Q' | 'A';
export type RetKey =
  | '1601C' | '0619E' | '1601EQ' | '0619F' | '1601FQ' | '1600VT'
  | '2550Q' | '2000' | '1603Q' | '1702Q' | '1702';

export const RETURNS: Record<RetKey, { tax: string; form: string; name: string; freq: Freq }> = {
  '1601C': { tax: 'WTC', form: '1601-C', name: 'Withholding Tax on Compensation', freq: 'M' },
  '0619E': { tax: 'EWT', form: '0619-E', name: 'Expanded WT — Monthly Remittance', freq: 'M' },
  '1601EQ': { tax: 'EWT', form: '1601-EQ', name: 'Expanded WT — Quarterly Return', freq: 'Q' },
  '0619F': { tax: 'FWT', form: '0619-F', name: 'Final WT — Monthly Remittance', freq: 'M' },
  '1601FQ': { tax: 'FWT', form: '1601-FQ', name: 'Final WT — Quarterly Return', freq: 'Q' },
  '1600VT': { tax: 'WVAT', form: '1600-VT', name: 'Monthly Remittance of VAT Withheld', freq: 'M' },
  '2550Q': { tax: 'VAT', form: '2550Q', name: 'Quarterly Value-Added Tax Return', freq: 'Q' },
  '2000': { tax: 'DST', form: '2000', name: 'Documentary Stamp Tax Return', freq: 'M' },
  '1603Q': { tax: 'FBT', form: '1603Q', name: 'Fringe Benefits Tax — Quarterly', freq: 'Q' },
  '1702Q': { tax: 'IT', form: '1702Q/1701Q', name: 'Quarterly Income Tax Return', freq: 'Q' },
  '1702': { tax: 'IT', form: '1702/1701', name: 'Annual Income Tax Return', freq: 'A' },
};
export const RET_KEYS = Object.keys(RETURNS) as RetKey[];

export const TAX_PAGES: Record<string, { title: string; returns: RetKey[] }> = {
  WTC: { title: 'Withholding Tax — Compensation', returns: ['1601C'] },
  EWT: { title: 'Withholding Tax — Expanded', returns: ['0619E', '1601EQ'] },
  FWT: { title: 'Withholding Tax — Final', returns: ['0619F', '1601FQ'] },
  WVAT: { title: 'Withholding VAT', returns: ['1600VT'] },
  VAT: { title: 'Value-Added Tax', returns: ['2550Q'] },
  DST: { title: 'Documentary Stamp Tax', returns: ['2000'] },
  FBT: { title: 'Fringe Benefits Tax', returns: ['1603Q'] },
  IT: { title: 'Income Tax', returns: ['1702Q', '1702'] },
};
export const TAX_KEYS = Object.keys(TAX_PAGES);

const EFPS_DAYS: Record<string, number> = { A: 15, B: 14, C: 13, D: 12, E: 11 };

// period objects: monthly {y,m} · quarterly {y,q} · annual {y}
export type Period = { y: number; m?: number; q?: number };
export type Ymd = { y: number; m: number; d: number };

// The workspace's users are all in PH, so local "today" matches PST.
export function nowYmd(): Ymd {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}
export function ymdInt(y: number, m: number, d: number) { return y * 10000 + m * 100 + d; }
export function todayInt() { const t = nowYmd(); return ymdInt(t.y, t.m, t.d); }
export function daysBetweenYmd(fromInt: number, to: Ymd) {
  const f = Date.UTC(Math.floor(fromInt / 10000), (Math.floor(fromInt / 100) % 100) - 1, fromInt % 100);
  const t = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((t - f) / 86400000);
}
function lastDayOf(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function addDays(y: number, m: number, d: number, n: number): Ymd {
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
export function fmtYmd(o: Ymd) { return `${MON[o.m - 1]} ${o.d}, ${o.y}`; }
export function fmtMoney(v: string | number | null | undefined) {
  if (v === '' || v === null || v === undefined || isNaN(+v)) return '—';
  return '₱' + (+v).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function periodKey(ret: RetKey, p: Period): string {
  const f = RETURNS[ret].freq;
  if (f === 'M') return `${p.y}-${String(p.m).padStart(2, '0')}`;
  if (f === 'Q') return `${p.y}-Q${p.q}`;
  return `${p.y}`;
}
export function parsePeriodKey(ret: RetKey, pk: string): Period {
  const f = RETURNS[ret].freq;
  if (f === 'M') { const [y, m] = pk.split('-'); return { y: +y, m: +m }; }
  if (f === 'Q') { const [y, q] = pk.split('-Q'); return { y: +y, q: +q }; }
  return { y: +pk };
}
export function periodLabel(ret: RetKey, p: Period): string {
  const f = RETURNS[ret].freq;
  if (f === 'M') return `${FULL_MONTHS[(p.m || 1) - 1]} ${p.y}`;
  if (f === 'Q') return `Q${p.q} ${p.y}`;
  return `TY ${p.y}`;
}
const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function shiftPeriod(ret: RetKey, p: Period, dir: number): Period {
  const f = RETURNS[ret].freq;
  if (f === 'M') {
    let m = (p.m || 1) + dir, y = p.y;
    if (m < 1) { m = 12; y--; }
    if (m > 12) { m = 1; y++; }
    return { y, m };
  }
  if (f === 'Q') {
    let q = (p.q || 1) + dir, y = p.y;
    if (q < 1) { q = 4; y--; }
    if (q > 4) { q = 1; y++; }
    return { y, q };
  }
  return { y: p.y + dir };
}

// System floor: no periods before Jan 2026 / Q1 2026 / TY 2026
const MIN_PERIOD: Record<Freq, Period> = { M: { y: 2026, m: 1 }, Q: { y: 2026, q: 1 }, A: { y: 2026 } };
export function periodOrd(f: Freq, p: Period) {
  return f === 'M' ? p.y * 100 + (p.m || 0) : f === 'Q' ? p.y * 10 + (p.q || 0) : p.y;
}

// Periods with no filing of their own:
// · 0619-E/0619-F cover only the first two months of each quarter — the
//   quarter-end month (Mar/Jun/Sep/Dec) is filed via 1601-EQ/1601-FQ instead
// · 1702Q covers Q1–Q3 only — Q4 is folded into the annual return
export function hasFiling(ret: RetKey, p: Period) {
  if ((ret === '0619E' || ret === '0619F') && (p.m || 0) % 3 === 0) return false;
  if (ret === '1702Q' && p.q === 4) return false;
  return true;
}
export function stepValid(ret: RetKey, p: Period, dir: number): Period {
  let n = shiftPeriod(ret, p, dir);
  while (!hasFiling(ret, n)) n = shiftPeriod(ret, n, dir);
  return n;
}
export function prevValidOrNull(ret: RetKey, p: Period): Period | null {
  const f = RETURNS[ret].freq;
  const n = stepValid(ret, p, -1);
  return periodOrd(f, n) < periodOrd(f, MIN_PERIOD[f]) ? null : n;
}
// default period = latest CLOSED period as of today
function defaultPeriod(ret: RetKey): Period {
  const t = nowYmd();
  const f = RETURNS[ret].freq;
  if (f === 'M') return t.m === 1 ? { y: t.y - 1, m: 12 } : { y: t.y, m: t.m - 1 };
  if (f === 'Q') {
    const curQ = Math.floor((t.m - 1) / 3) + 1;
    return curQ === 1 ? { y: t.y - 1, q: 4 } : { y: t.y, q: curQ - 1 };
  }
  return { y: t.y - 1 };
}
// latest closed period that actually has a filing (never below the floor)
export function validDefaultPeriod(ret: RetKey): Period {
  const f = RETURNS[ret].freq;
  let p = defaultPeriod(ret);
  if (periodOrd(f, p) < periodOrd(f, MIN_PERIOD[f])) p = { ...MIN_PERIOD[f] };
  while (!hasFiling(ret, p)) p = shiftPeriod(ret, p, -1);
  if (periodOrd(f, p) < periodOrd(f, MIN_PERIOD[f])) {
    p = { ...MIN_PERIOD[f] };
    while (!hasFiling(ret, p)) p = shiftPeriod(ret, p, 1);
  }
  return p;
}
// every selectable period: floor → end of the current year (extends to the
// selected period if the user arrowed further ahead)
export function periodOptions(ret: RetKey, sel: Period): Period[] {
  const f = RETURNS[ret].freq;
  const t = nowYmd();
  const opts: Period[] = [];
  let p = { ...MIN_PERIOD[f] };
  const horizon = Math.max(
    periodOrd(f, f === 'M' ? { y: t.y, m: 12 } : f === 'Q' ? { y: t.y, q: 4 } : { y: t.y }),
    periodOrd(f, sel)
  );
  while (periodOrd(f, p) <= horizon) {
    if (hasFiling(ret, p)) opts.push({ ...p });
    p = shiftPeriod(ret, p, 1);
  }
  return opts;
}
// Full expected universe: floor → latest closed cycle (drives the Overview)
export function expectedPeriods(ret: RetKey): Period[] {
  const f = RETURNS[ret].freq;
  const lastOrd = periodOrd(f, validDefaultPeriod(ret));
  const out: Period[] = [];
  let p = { ...MIN_PERIOD[f] };
  let guard = 0;
  while (periodOrd(f, p) <= lastOrd && guard++ < 400) {
    if (hasFiling(ret, p)) out.push({ ...p });
    p = shiftPeriod(ret, p, 1);
  }
  return out;
}

// deadline for one client's filing: {file, pay}
export function deadlineFor(ret: RetKey, client: Pick<Client, 'channel'>, p: Period): { file: Ymd; pay: Ymd } {
  const R = RETURNS[ret];
  if (R.freq === 'M') {
    const m = p.m || 1;
    const f = m === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: m + 1 };
    if (ret === '2000') return { file: { ...f, d: 5 }, pay: { ...f, d: 5 } }; // DST: 5th following month
    if (ret === '1600VT') return { file: { ...f, d: 10 }, pay: { ...f, d: 10 } }; // WVAT: 10th following month
    if (m === 12) return { file: { ...f, d: 15 }, pay: { ...f, d: 15 } }; // Dec comp: Jan 15
    if (client.channel === 'eFPS') {
      const d = EFPS_DAYS['A'] || 15; // workspace clients don't carry an eFPS group — group A (day 15) assumed
      return { file: { ...f, d }, pay: { ...f, d: 15 } };
    }
    return { file: { ...f, d: 10 }, pay: { ...f, d: 10 } };
  }
  if (R.freq === 'Q') {
    const endM = (p.q || 1) * 3;
    const endD = lastDayOf(p.y, endM);
    if (ret === '1601EQ' || ret === '1601FQ' || ret === '1603Q') {
      const f = endM === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: endM + 1 };
      const d = lastDayOf(f.y, f.m);
      return { file: { ...f, d }, pay: { ...f, d } }; // last day of month following quarter
    }
    if (ret === '2550Q') {
      const f = endM === 12 ? { y: p.y + 1, m: 1 } : { y: p.y, m: endM + 1 };
      return { file: { ...f, d: 25 }, pay: { ...f, d: 25 } }; // 25th following quarter close
    }
    // 1702Q: 60 days after quarter close (corp; good proxy for 1701Q too)
    const dl = addDays(p.y, endM, endD, 60);
    return { file: dl, pay: dl };
  }
  // annual: April 15 following taxable year
  return { file: { y: p.y + 1, m: 4, d: 15 }, pay: { y: p.y + 1, m: 4, d: 15 } };
}

// One client's pipeline record for one return-period.
export type TaxRecord = {
  stage: number;
  dates: Record<string, string>;
  taxDue: string;
  ref: string;
  notes: string;
};
export const EMPTY_REC: TaxRecord = { stage: 0, dates: {}, taxDue: '', ref: '', notes: '' };

export type Flag = { cls: 'green' | 'amber' | 'red' | 'grey'; text: string; rank: number };
export function flagFor(ret: RetKey, client: Pick<Client, 'channel'>, p: Period, rec: TaxRecord): Flag {
  if (rec.stage >= 8) return { cls: 'green', text: 'Complete', rank: 4 };
  if (rec.stage >= 6) return { cls: 'green', text: 'Filed', rank: 3 };
  const dl = deadlineFor(ret, client, p);
  const days = daysBetweenYmd(todayInt(), dl.file); // >0 = days remaining
  if (days < 0) return { cls: 'red', text: 'OVERDUE', rank: 0 };
  if (days <= 2) return { cls: 'red', text: 'At risk', rank: 0 };
  if (rec.stage < 2 && days <= 6) return { cls: 'amber', text: 'Chase data', rank: 1 };
  if (rec.stage === 0 && days <= 8) return { cls: 'amber', text: 'Send request', rank: 1 };
  return { cls: 'grey', text: 'On track', rank: 2 };
}

// Data-request email templates (ported verbatim from the tax system).
const RQ_DATA: Record<string, string> = {
  WTC: 'the payroll data for the period — employee names and TINs, gross compensation per employee, statutory contributions (SSS / PhilHealth / Pag-IBIG), and taxes withheld',
  EWT: 'the schedule of income payments to suppliers and payees subject to expanded withholding tax — payee names and TINs, ATC, amounts, and taxes withheld',
  FWT: 'the schedule of income payments subject to final withholding tax — payee names and TINs, nature of income, amounts, and taxes withheld',
  WVAT: 'the schedule of purchases and payments where VAT was withheld for the period, with supplier details and amounts',
  VAT: 'your sales and purchases data for the period — summary of sales invoices / official receipts and purchases with the corresponding input VAT',
  DST: 'the list of taxable documents executed during the period (loan agreements, promissory notes, share issuances, deeds, lease contracts, etc.) with the corresponding amounts',
  FBT: 'the schedule of fringe benefits granted to managerial and supervisory employees for the quarter, with the corresponding grossed-up monetary values',
  IT: 'the trial balance / books summary and supporting schedules for the period',
};

export function rqEmail(ret: RetKey, client: Client, p: Period): { subject: string; body: string } {
  const R = RETURNS[ret];
  const dl = deadlineFor(ret, client, p).file;
  const subject = `${client.name} — Request Data for ${R.form} Filing — ${periodLabel(ret, p)}`;
  const body = R.tax === 'WTC'
    ? `Dear ${client.name},

Good day!

In preparation for the filing of BIR Form ${R.form} (${R.name}) for ${periodLabel(ret, p)}, may we kindly request your payroll data for the period.

Please be informed that we have adopted a firm-standard payroll data format to streamline our tax compliance process and ensure faster, more accurate preparation of your returns. Attached below is our standard Excel template — kindly encode your payroll data in the file and send it back to us once accomplished. Moving forward, we will be using this same template for all monthly submissions.

We would appreciate receiving the completed file at the soonest. Moving forward, kindly submit your payroll data every 5th day of the month so we can prepare your returns well ahead of the BIR filing deadline.

Thank you very much!

Best regards,
${client.preparer || 'The MSMA Team'}
Mora, Sanchez, Meñoza and Associates`
    : `Dear ${client.name},

Good day!

In preparation for the filing of BIR Form ${R.form} (${R.name}) for ${periodLabel(ret, p)}, may we kindly request ${RQ_DATA[R.tax] || 'the supporting data for the period'}.

For your convenience, we will provide our standard Excel template — kindly encode the requested data in the file and upload / send it back to us once accomplished.

We would appreciate receiving the completed file at the soonest so we can prepare the return well ahead of the ${fmtYmd(dl)} filing deadline.

Thank you very much!

Best regards,
${client.preparer || 'The MSMA Team'}
Mora, Sanchez, Meñoza and Associates`;
  return { subject, body };
}
