// 1601-C Working Paper engine — near-verbatim TS port from the
// msma-tax-compliance system: standard payroll columns, the BIR revised
// withholding tables, the IC computation, draft-return line math, the
// year-end annualization, and the 1604-C alphalist/DAT structures.

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Employee = {
  id: string;
  name: string;
  lastName: string;
  firstName: string;
  middleName: string;
  tin: string;
  address: string;
  position: string;
  dateHired: string;
  dateTerminated: string;
  monthlyRate: string;
  dailyRate: string;
  type: string; // T = taxable · M = minimum wage · N = not taxable
  status: string; // Active | Separated
};

export type WtcRecord = {
  id: string;
  period: string; // YYYY-MM
  version: number;
  freq: string;
  savedAt: string;
  savedBy: string;
  remarks: string;
  rows: string[][]; // PAYROLL_HEADERS values + WTC_COMP_HEADERS values, hardcoded
};

export type DraftRecord = {
  id: string;
  period: string;
  version: number;
  basedOn: number;
  savedAt: string;
  savedBy: string;
  remarks: string;
  preparer: string;
  reviewer: string;
  lines: Record<string, number>;
};

export type PrevEmp = { employer: string; employerTin: string; gross: number; nonTax: number; taxable: number; withheld: number };

// Standard payroll columns — the single source of truth for the downloadable
// template AND the fixed header of the Withholding Tax Computation sheet.
export const PAYROLL_HEADERS = [
  'MONTH END', 'FROM', 'TO',
  'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'FULL NAME', 'TIN',
  'DAILY RATE', 'NO OF DAYS', 'BASIC PAY', 'OVERTIME PAY', 'HOLIDAY PAY', 'ALLOWANCES',
  '13TH MONTH PAY', 'DE MINIMIS BENEFITS', 'OTHER INCENTIVES',
  'LATE', 'ABSENT', 'TARDINESS', 'LEAVE WITHOUT PAY',
  'GROSS PAY', 'SSS', 'HDMF', 'PHIC', 'W/TAX',
  'SSS LOAN', 'HDMF LOAN', 'PERSONAL LOAN', 'OTHER DEDUCTION', 'NET PAY',
];
export const NB = PAYROLL_HEADERS.length;

export const WTC_COMP_HEADERS = [
  'NET PAY - IC', 'DIFF', 'REMARKS', 'REPORT (Y/N)', 'TYPE',
  'GROSS COMPENSATION', 'MWE BASIC', 'MWE OT', '13TH MO. & OB', 'DE MINIMIS',
  'SSS / PHIC / HDMF', '≤250K', 'TAXABLE', 'TAX WITHHELD',
];

export const WTC_FREQS = ['Daily', 'Weekly', 'Semi-monthly', 'Monthly'];

/* BIR revised withholding tax table (RR 11-2018, rates effective Jan 1, 2023):
   [bracket floor, tax on floor, rate on excess over floor] */
const WTC_TAX_TABLES: Record<string, number[][]> = {
  'Daily': [[0, 0, 0], [685, 0, .15], [1096, 61.65, .20], [2192, 280.85, .25], [5479, 1102.60, .30], [21918, 6034.30, .35]],
  'Weekly': [[0, 0, 0], [4808, 0, .15], [7692, 432.60, .20], [15385, 1971.20, .25], [38462, 7740.45, .30], [153846, 42355.65, .35]],
  'Semi-monthly': [[0, 0, 0], [10417, 0, .15], [16667, 937.50, .20], [33333, 4270.70, .25], [83333, 16770.70, .30], [333333, 91770.70, .35]],
  'Monthly': [[0, 0, 0], [20833, 0, .15], [33333, 1875.00, .20], [66667, 8541.80, .25], [166667, 33541.80, .30], [666667, 183541.80, .35]],
};
export function wtcTax(freq: string, taxable: number) {
  const t = WTC_TAX_TABLES[freq] || WTC_TAX_TABLES['Semi-monthly'];
  let b = t[0];
  for (const br of t) { if (taxable >= br[0]) b = br; else break; }
  return Math.max(0, b[1] + b[2] * (taxable - b[0]));
}
/* Annual graduated income tax table (TRAIN, rates effective 2023) — year-end annualization */
const ANNUAL_TAX_TABLE = [[0, 0, 0], [250000, 0, .15], [400000, 22500, .20], [800000, 102500, .25], [2000000, 402500, .30], [8000000, 2202500, .35]];
export function annualTax(taxable: number) {
  let b = ANNUAL_TAX_TABLE[0];
  for (const br of ANNUAL_TAX_TABLE) { if (taxable >= br[0]) b = br; else break; }
  return Math.max(0, b[1] + b[2] * (taxable - b[0]));
}

export function wtcNum(v: unknown): number { // "(1,750.00)" → -1750; blanks → 0
  const s = String(v == null ? '' : v).trim();
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  const n = parseFloat(s.replace(/[(),₱ ]/g, '').replace(/^-/, ''));
  return isNaN(n) ? 0 : neg ? -n : n;
}
export function wtcFmt(n: number): string { // accounting style: negatives in parens
  const a = Math.abs(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < -0.004 ? `(${a})` : a;
}
export function round2(n: number) { return Math.round((+n || 0) * 100) / 100; }
export function addThousands(v: string): string {
  const raw = String(v ?? '').replace(/[^\d.]/g, '');
  if (!raw) return '';
  const dot = raw.indexOf('.');
  const int = (dot === -1 ? raw : raw.slice(0, dot)).replace(/^0+(?=\d)/, '');
  const dec = dot === -1 ? '' : '.' + raw.slice(dot + 1).replace(/\./g, '').slice(0, 2);
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + dec;
}
export function toISODate(v: unknown): string {
  const s = String(v || '').trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    let y = m[3];
    if (y.length === 2) y = (+y > 50 ? '19' : '20') + y;
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return s;
}
export function fmtDateMDY(v: unknown): string {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : String(v || '');
}
export const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function periodMonthLabel(p: string) {
  const [y, m] = String(p).split('-');
  return `${MONTHS_FULL[+m - 1]} ${y}`;
}
export const digitsOf = (s: unknown) => String(s || '').replace(/\D/g, '');
export const normName = (s: unknown) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const fullNameOf = (e: Employee) =>
  [e.firstName, e.middleName, e.lastName].filter(Boolean).join(' ').toUpperCase() || (e.name || '');

/* ---- the computation sheet rows ---- */
export type BaseRow = { vals: string[]; emp: Employee | null; tin: string };

const fmt2 = (v: unknown) => {
  const x = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isNaN(x) ? '' : x.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// verified upload rows → BaseRows matched to the masterlist
export function collectVerifiedRows(rows: string[][], employees: Employee[]): BaseRow[] {
  const map = new Map<string, Employee>();
  employees.forEach((e) => {
    [`${e.lastName || ''} ${e.firstName || ''} ${e.middleName || ''}`,
     `${e.firstName || ''} ${e.middleName || ''} ${e.lastName || ''}`,
     e.name || ''].map(normName).filter(Boolean).forEach((k) => { if (!map.has(k)) map.set(k, e); });
  });
  return rows.map((r) => {
    const emp = map.get(normName(`${r[3]} ${r[4]} ${r[5]}`)) || map.get(normName(r[6])) || null;
    return { vals: r, emp, tin: r[7] || (emp && emp.tin) || '' };
  });
}

// manual mode → BaseRows from the masterlist + typed-in cells
export function collectManualRows(employees: Employee[], sel: Set<string>, manual: Record<string, Record<string, string>>): BaseRow[] {
  return employees.filter((e) => sel.has(e.id)).map((e) => {
    const saved = manual[e.id] || {};
    const vals = PAYROLL_HEADERS.map((h, i) => {
      if (i === 3) return (e.lastName || '').toUpperCase();
      if (i === 4) return (e.firstName || '').toUpperCase();
      if (i === 5) return (e.middleName || '').toUpperCase();
      if (i === 6) return fullNameOf(e);
      if (i === 7) return e.tin || '';
      return saved[i] != null ? saved[i] : i === 8 ? fmt2(e.dailyRate) : '';
    });
    return { vals, emp: e, tin: e.tin || '' };
  });
}

export function wtcComputeRow(br: BaseRow, freq: string): string[] {
  const n = (i: number) => wtcNum(br.vals[i]);
  const A = (i: number) => Math.abs(n(i));
  const type = (br.emp && br.emp.type) || 'T';
  /* NET PAY - IC = Σ(BASIC PAY … LEAVE WITHOUT PAY) − Σ(SSS … OTHER DEDUCTION),
     SSS/HDMF/PHIC taken absolute before summing (encoded as negatives in payroll) */
  const netIC = (n(10) + n(11) + n(12) + n(13) + n(14) + n(15) + n(16) + n(17) + n(18) + n(19) + n(20))
    - (A(22) + A(23) + A(24) + n(25) + n(26) + n(27) + n(28) + n(29));
  const diff = n(30) - netIC;
  const remarks = Math.abs(diff) <= 0.01 ? 'MATCH' : 'FOR CHECKING';
  const report = digitsOf(br.tin) ? 'Y' : 'N';
  const grossComp = n(10) + n(11) + n(12) + n(13) + n(14) + n(15) + n(16) - (A(17) + A(18) + A(19) + A(20));
  const mweBasic = type === 'M' ? n(10) : 0;
  const mweOt = type === 'M' ? n(11) : 0;
  const thirteenOb = n(14) + n(16);
  const deMin = n(15);
  const contrib = A(22) + A(23) + A(24);
  const taxable = type === 'N' ? 0 : Math.max(0, grossComp - mweBasic - mweOt - thirteenOb - deMin - contrib);
  const thr = ({ 'Daily': 685, 'Weekly': 4808, 'Semi-monthly': 10417, 'Monthly': 20833 } as Record<string, number>)[freq] || 10417;
  const le250 = taxable > 0 && taxable <= thr ? taxable : null;
  const tax = type === 'T' ? wtcTax(freq, taxable) : 0;
  return [wtcFmt(netIC), wtcFmt(diff), remarks, report, type,
    wtcFmt(grossComp), wtcFmt(mweBasic), wtcFmt(mweOt), wtcFmt(thirteenOb), wtcFmt(deMin),
    wtcFmt(contrib), le250 == null ? '' : wtcFmt(le250), wtcFmt(taxable), wtcFmt(tax)];
}

/* ---- payroll verification (upload vs the Employee Masterlist) ---- */
export type Verif = { fileName: string; total: number; ok: number; errRows: { name: string; issues: string[] }[]; missing: string[]; rows: string[][] };

export function verifyPayrollRows(rows: any[][], fileName: string, employees: Employee[]): Verif | { error: string } {
  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const hIdx = rows.findIndex((r) => {
    const h = r.map(norm);
    const hasName = (h.some((x: string) => x.includes('lastname')) && h.some((x: string) => x.includes('firstname'))) ||
      h.some((x: string) => x.includes('employeename') || x.includes('fullname'));
    return hasName && (h.some((x: string) => x.includes('tin')) || h.some((x: string) => x.includes('dailyrate')));
  });
  if (hIdx === -1) return { error: 'Header row not found — the file needs employee name (or last/first name), TIN, and daily rate columns.' };
  const header = rows[hIdx].map(norm);
  const col = (k: string) => header.findIndex((h: string) => h.includes(k));
  const iL = col('lastname'), iF = col('firstname'), iM = col('middlename');
  const iN = col('employeename') > -1 ? col('employeename') : col('fullname');
  const iT = col('tin'), iD = col('dailyrate');
  const num = (s: unknown) => parseFloat(String(s || '').replace(/[^\d.]/g, ''));
  const map = new Map<string, Employee>();
  employees.forEach((e) => {
    [`${e.lastName || ''} ${e.firstName || ''} ${e.middleName || ''}`,
     `${e.firstName || ''} ${e.middleName || ''} ${e.lastName || ''}`,
     e.name || ''].map(normName).filter(Boolean).forEach((k) => { if (!map.has(k)) map.set(k, e); });
  });
  const matched = new Set<string>();
  let total = 0, ok = 0;
  const errRows: { name: string; issues: string[] }[] = [];
  rows.slice(hIdx + 1).forEach((r) => {
    let dispName = '', key = '';
    if (iL > -1 && iF > -1) {
      const L = String(r[iL] || '').trim(), F = String(r[iF] || '').trim(), M = iM > -1 ? String(r[iM] || '').trim() : '';
      if (!L && !F) return;
      dispName = `${L.toUpperCase()}, ${F.toUpperCase()}${M ? ' ' + M.toUpperCase() : ''}`;
      key = normName(`${L} ${F} ${M}`);
    } else {
      const nName = String(r[iN] || '').trim();
      if (!nName) return;
      dispName = nName.toUpperCase();
      key = normName(nName);
    }
    total++;
    const emp = map.get(key);
    const issues: string[] = [];
    if (!emp) {
      issues.push('Not found in the Employee Masterlist');
    } else {
      matched.add(emp.id);
      if (iT > -1) {
        const ft = digitsOf(r[iT]), mt = digitsOf(emp.tin);
        if (ft !== mt) issues.push(`TIN mismatch — file: ${String(r[iT] || '').trim() || '(blank)'} · masterlist: ${emp.tin || '(blank)'}`);
      }
      if (iD > -1) {
        const fd = num(r[iD]), md = num(emp.dailyRate);
        const bothBlank = isNaN(fd) && isNaN(md);
        if (!bothBlank && (isNaN(fd) !== isNaN(md) || Math.abs(fd - md) > 0.005))
          issues.push(`Daily rate mismatch — file: ${isNaN(fd) ? '(blank)' : '₱' + fd.toLocaleString('en-PH', { minimumFractionDigits: 2 })} · masterlist: ${isNaN(md) ? '(blank)' : '₱' + md.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`);
      }
    }
    if (issues.length) errRows.push({ name: dispName, issues });
    else ok++;
  });
  const missing = employees.filter((e) => e.status !== 'Separated' && !matched.has(e.id)).map((e) => e.name);
  // carry the payroll values over verbatim (hardcoded, never recomputed)
  const hmap = new Map<string, number>();
  header.forEach((h: string, i: number) => { if (h && !hmap.has(h)) hmap.set(h, i); });
  const stdIdx = PAYROLL_HEADERS.map((h) => (hmap.has(norm(h)) ? (hmap.get(norm(h)) as number) : -1));
  const sheetRows = rows.slice(hIdx + 1)
    .filter((r) => r.some((x) => String(x || '').trim() !== ''))
    .map((r) => stdIdx.map((ix) => (ix > -1 ? String(r[ix] == null ? '' : r[ix]).trim() : '')));
  return { fileName, total, ok, errRows, missing, rows: sheetRows };
}

/* ---- employee import (Excel rows → Employee[]) ---- */
export function parseEmployeeImport(rows: any[][]): { employees: Omit<Employee, 'id'>[]; skipped: number } | { error: string } {
  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
  const hIdx = rows.findIndex((r) => r.some((x) => norm(x).includes('lastname')) && r.some((x) => norm(x).includes('firstname')));
  if (hIdx === -1) return { error: 'Header row not found — please use the downloadable template.' };
  const header = rows[hIdx].map(norm);
  const col = (key: string) => header.findIndex((h: string) => h.includes(key));
  const iL = col('lastname'), iF = col('firstname'), iM = col('middlename'),
    iT = col('tin'), iP = col('position'), iS = col('status'),
    iA = col('address'), iH = col('datehired'), iX = col('dateterminated'),
    iMo = col('monthlyrate'), iD = col('dailyrate'),
    iTy = header.findIndex((h: string) => h === 'type' || h.startsWith('typet'));
  const out: Omit<Employee, 'id'>[] = [];
  let skipped = 0;
  rows.slice(hIdx + 1).forEach((r) => {
    const last = String(r[iL] || '').trim(), first = String(r[iF] || '').trim();
    if (!last && !first) return;
    if (!last || !first) { skipped++; return; }
    const middle = iM > -1 ? String(r[iM] || '').trim() : '';
    out.push({
      name: `${last.toUpperCase()}, ${first.toUpperCase()}${middle ? ' ' + middle.toUpperCase() : ''}`,
      lastName: last, firstName: first, middleName: middle,
      tin: iT > -1 ? String(r[iT] || '').trim() : '',
      address: iA > -1 ? String(r[iA] || '').trim() : '',
      position: iP > -1 ? String(r[iP] || '').trim() : '',
      dateHired: iH > -1 ? toISODate(r[iH]) : '',
      dateTerminated: iX > -1 ? toISODate(r[iX]) : '',
      monthlyRate: iMo > -1 ? String(r[iMo] || '').replace(/[₱, ]/g, '') : '',
      dailyRate: iD > -1 ? String(r[iD] || '').replace(/[₱, ]/g, '') : '',
      type: iTy > -1 && /^[TMN]/i.test(String(r[iTy] || '').trim()) ? String(r[iTy]).trim()[0].toUpperCase() : 'T',
      status: iS > -1 && /separat/i.test(String(r[iS] || '')) ? 'Separated' : 'Active',
    });
  });
  return { employees: out, skipped };
}

/* ---- Draft Return line math (BIR Form 1601-C Jan 2018, items 14–36) ---- */
export function draftTotals(rec: WtcRecord) {
  const S = (i: number) => rec.rows.reduce((a, r) => a + wtcNum(r[i]), 0);
  const gross = S(NB + 5), mweBasic = S(NB + 6), mweOt = S(NB + 7), thirteen = S(NB + 8),
    demin = S(NB + 9), contrib = S(NB + 10), le250 = S(NB + 11), taxable = S(NB + 12), tax = S(NB + 13);
  const otherNT = Math.max(0, gross - (mweBasic + mweOt + thirteen + demin + contrib) - taxable);
  return { gross, mweBasic, mweOt, thirteen, demin, contrib, le250, taxable, tax, otherNT };
}
/* [no, label, key, kind] — kind 1 = strong, 2 = section header */
export const DRAFT_LINES: [string, string, string | null, number][] = [
  ['14', 'Total Amount of Compensation', 'l14', 1],
  ['', 'LESS: NON-TAXABLE COMPENSATION', null, 2],
  ['15', 'Statutory Minimum Wage (MWEs)', 'l15A', 0],
  ['16', 'Holiday Pay, Overtime Pay, Night Shift Differential Pay, Hazard Pay (MWEs)', 'l15B', 0],
  ['17', '13th Month Pay and Other Benefits', 'l15C', 0],
  ['18', 'De Minimis Benefits', 'l15D', 0],
  ['19', "SSS, GSIS, PHIC, HDMF Mandatory Contributions and Union Dues (employee's share only)", 'l15E', 0],
  ['20', 'Other Non-Taxable Compensation', 'l15F', 0],
  ['21', 'Total Non-Taxable Compensation (Sum of Items 15 to 20)', 'l15T', 1],
  ['22', 'Total Taxable Compensation (Item 14 Less Item 21)', 'l16', 1],
  ['23', 'Less: Taxable compensation not subject to withholding tax (for employees, other than MWEs, receiving P250,000 and below for the year)', 'le250', 0],
  ['24', 'Net Taxable Compensation (Item 22 Less Item 23)', 'l24n', 1],
  ['25', 'Total Taxes Withheld', 'l17', 1],
  ['26', 'Add/(Less): Adjustment of Taxes Withheld from Previous Month/s', 'l18', 0],
  ['27', 'Tax Required to be Withheld for Remittance (Sum of Items 25 and 26)', 'l27', 1],
  ['28', 'Less: Tax Remitted in Return Previously Filed, if this is an amended return', 'l19', 0],
  ['29', 'Other Remittances Made', 'l29', 0],
  ['30', 'Total Tax Remittances Made (Sum of Items 28 and 29)', 'l30', 0],
  ['31', 'Tax Still Due/(Over-remittance) (Item 27 Less Item 30)', 'l20', 1],
  ['', 'ADD: PENALTIES (only if filing after the deadline)', null, 2],
  ['32', 'Surcharge', 'l21', 0],
  ['33', 'Interest', 'l22', 0],
  ['34', 'Compromise', 'l23', 0],
  ['35', 'Total Penalties (Sum of Items 32 to 34)', 'l24', 0],
  ['36', 'TOTAL AMOUNT STILL DUE/(Over-remittance) (Sum of Items 31 and 35)', 'l25', 1],
];
export function normDraftLines(L: Record<string, number>): Record<string, number> {
  const n = { ...L };
  n.le250 = n.le250 || 0;
  n.l29 = n.l29 || 0;
  if (n.l24n == null) n.l24n = (n.l16 || 0) - n.le250;
  if (n.l27 == null) n.l27 = (n.l17 || 0) + (n.l18 || 0);
  if (n.l30 == null) n.l30 = (n.l19 || 0) + n.l29;
  return n;
}
export type DraftData = { period: string; basedOn: number; lines: Record<string, number> };
export function buildDraftData(records: WtcRecord[], period: string, adjust: Record<string, string>): DraftData | null {
  const byP = records.filter((r) => r.period === period);
  if (!byP.length) return null;
  const rec = byP.reduce((a, b) => (b.version > a.version ? b : a));
  const t = draftTotals(rec);
  const num = (k: string) => wtcNum(adjust[k]);
  const l18 = num('adj'), l19 = num('other'), l29 = num('other2');
  const l27 = t.tax + l18;
  const l30 = l19 + l29;
  const l20 = l27 - l30;
  const l21 = num('surcharge'), l22 = num('interest'), l23 = num('compromise');
  const l24 = l21 + l22 + l23;
  return {
    period, basedOn: rec.version,
    lines: {
      l14: t.gross, l15A: t.mweBasic, l15B: t.mweOt, l15C: t.thirteen, l15D: t.demin, l15E: t.contrib, l15F: t.otherNT,
      l15T: t.mweBasic + t.mweOt + t.thirteen + t.demin + t.contrib + t.otherNT,
      l16: t.taxable, le250: t.le250, l24n: t.taxable - t.le250,
      l17: t.tax, l18, l27, l19, l29, l30, l20, l21, l22, l23, l24, l25: l20 + l24,
    },
  };
}

/* ---- Annualization (year-end reconciliation from the recorded computations) ---- */
export type AnnEmp = {
  name: string; tin: string; ln: string; fn: string; mn: string; type: string; months: number;
  gross: number; mwe: number; thirteen: number; demin: number; contrib: number; nonTax: number; taxable: number; withheld: number;
  empId: string | null; dateHired: string;
  pres: { gross: number; nonTax: number; taxable: number; withheld: number; mwe: number; thirteen: number; demin: number; contrib: number };
  prev: PrevEmp | null; due: number; adj: number;
};
export function annualizeYear(records: WtcRecord[], employees: Employee[], annPrev: Record<string, Record<string, PrevEmp>>, year: string) {
  const byPeriod: Record<string, WtcRecord> = {};
  records.forEach((r) => {
    if (String(r.period).slice(0, 4) !== String(year)) return;
    if (!byPeriod[r.period] || r.version > byPeriod[r.period].version) byPeriod[r.period] = r;
  });
  const periods = Object.keys(byPeriod).sort();
  const emps: Record<string, any> = {};
  periods.forEach((p) => {
    byPeriod[p].rows.forEach((row) => {
      const name = row[6] || '', tin = row[7] || '';
      const key = digitsOf(tin) || normName(name);
      if (!key) return;
      const e = emps[key] || (emps[key] = { name, tin, ln: row[3] || '', fn: row[4] || '', mn: row[5] || '', type: row[NB + 4] || 'T', months: 0, gross: 0, mwe: 0, thirteen: 0, demin: 0, contrib: 0, nonTax: 0, taxable: 0, withheld: 0 });
      if (!e.name && name) e.name = name;
      if (!e.tin && tin) e.tin = tin;
      if (!e.ln && row[3]) e.ln = row[3];
      if (!e.fn && row[4]) e.fn = row[4];
      if (!e.mn && row[5]) e.mn = row[5];
      e.months++;
      const mwe = Math.abs(wtcNum(row[NB + 6])) + Math.abs(wtcNum(row[NB + 7]));
      const thirteen = wtcNum(row[NB + 8]), demin = wtcNum(row[NB + 9]), contrib = Math.abs(wtcNum(row[NB + 10]));
      e.mwe += mwe; e.thirteen += thirteen; e.demin += demin; e.contrib += contrib;
      e.gross += wtcNum(row[NB + 5]);
      e.nonTax += mwe + thirteen + demin + contrib;
      e.taxable += wtcNum(row[NB + 12]);
      e.withheld += wtcNum(row[NB + 13]);
    });
  });
  const findEmp = (e: any) =>
    employees.find((m) => digitsOf(m.tin) && digitsOf(m.tin) === digitsOf(e.tin)) ||
    employees.find((m) =>
      normName([m.firstName, m.middleName, m.lastName].filter(Boolean).join(' ')) === normName(e.name) ||
      normName([m.lastName, m.firstName, m.middleName].filter(Boolean).join(' ')) === normName(e.name));
  const prevAll = annPrev[year] || {};
  const list: AnnEmp[] = Object.values(emps).map((e: any) => {
    const m = findEmp(e);
    e.empId = m ? m.id : null;
    e.dateHired = m ? m.dateHired || '' : '';
    e.pres = { gross: e.gross, nonTax: e.nonTax, taxable: e.taxable, withheld: e.withheld, mwe: e.mwe, thirteen: e.thirteen, demin: e.demin, contrib: e.contrib };
    const pv = e.empId ? prevAll[e.empId] : null;
    e.prev = pv || null;
    if (pv) {
      e.gross += wtcNum(pv.gross);
      e.nonTax += wtcNum(pv.nonTax);
      e.taxable += wtcNum(pv.taxable);
      e.withheld += wtcNum(pv.withheld);
    }
    const due = annualTax(e.taxable);
    return Object.assign(e, { due, adj: due - e.withheld }); // adj>0 = collectible; <0 = refund
  }).sort((a, b) => a.name.localeCompare(b.name));
  return { periods, list };
}
export function annMidYearHires(list: AnnEmp[], year: string) {
  return list.filter((e) => e.dateHired && String(e.dateHired).slice(0, 4) === String(year));
}

/* ---- 1604-C alphalist export + Schedule 1 DAT record structure ---- */
export const ANNUALIST_HEADERS = ['SEQ', 'TIN', 'LAST NAME', 'FIRST NAME', 'MIDDLE NAME', 'TYPE', 'MONTHS',
  'GROSS COMPENSATION', 'MWE / EXEMPT', '13TH MONTH & OTHER BENEFITS', 'DE MINIMIS',
  'SSS/GSIS/PHIC/HDMF & UNION DUES', 'TOTAL NON-TAXABLE', 'TAXABLE COMPENSATION',
  'TAX WITHHELD', 'ANNUAL TAX DUE', 'OVER/(UNDER) WITHHELD'];
export function annualistRows(list: AnnEmp[]) {
  return list.map((e, i) => [
    i + 1, e.tin || '', (e.ln || '').toUpperCase(), (e.fn || '').toUpperCase(), (e.mn || '').toUpperCase(), e.type || 'T', e.months,
    round2(e.gross), round2(e.mwe), round2(e.thirteen), round2(e.demin), round2(e.contrib),
    round2(e.nonTax), round2(e.taxable), round2(e.withheld), round2(e.due), round2(-e.adj),
  ]);
}

export const DAT_HEADER: [string, string, string, string?][] = [
  ['region', 'Region', 'text'],
  ['nationality', 'Nationality', 'text'],
  ['empStatus', 'Current Employment Status', 'select', 'Regular|Casual|Contractual|Seasonal|Project|Probationary'],
  ['empFrom', 'Employment From (MM/DD/YYYY)', 'text'],
  ['empTo', 'Employment To (MM/DD/YYYY)', 'text'],
  ['reasonSep', 'Reason of Separation', 'select', 'N/A|Terminated|Resigned|Retired|Deceased|End of Contract|Redundancy|Others'],
  ['substituted', 'Substituted Filing?', 'select', 'Yes|No'],
];
export const DAT_NT: [string, string][] = [['gross', 'Gross Comp. Income'], ['sss', 'SSS, GSIS, PAG-IBIG & Union Dues'], ['basicMWE', 'Basic Salary (P250,000 & below)'], ['salariesMWE', 'Salaries & Other Forms of Comp.'], ['thirteen', '13th Month & Other Benefits'], ['totalNT', 'Total Nontaxable/Exempt Comp.'], ['deminimis', 'De Minimis Benefits']];
export const DAT_TX: [string, string][] = [['basic', 'Taxable Basic Salary'], ['thirteen', '13th Month & Other Benefits'], ['salaries', 'Salaries & Other Compensation'], ['total', 'Total Taxable Compensation']];
export const DAT_OTHER: [string, string][] = [['netTaxable', 'Net Taxable Comp. Income'], ['taxDue', 'Tax Due (Jan.–Dec.)'], ['twPresent', 'Tax Withheld Present Employer (Jan.–Nov.)'], ['twPrevious', 'Tax Withheld Previous Employer (Jan.–Nov.)'], ['twDec', 'Amount Withheld and Paid for in Dec'], ['overRefunded', 'Overwithheld Tax Refunded'], ['pera', '5% Tax Credit (PERA Act of 2008)'], ['twAdjusted', 'Amount of Tax Withheld as Adjusted']];
export function datRecordKey(e: AnnEmp) { return e.empId || 'k' + (e.tin || e.name || '').replace(/\W/g, ''); }
export function datFmt(n: unknown) {
  const x = +String(n);
  return isNaN(x) ? String(n || '') : x.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function datDefaults(e: AnnEmp): Record<string, any> {
  const p = e.pres || { gross: 0, nonTax: 0, taxable: 0, withheld: 0, mwe: 0, thirteen: 0, demin: 0, contrib: 0 };
  const v = e.prev || null;
  const type = (e.type || 'T').toUpperCase();
  const d: Record<string, any> = {};
  DAT_HEADER.forEach((f) => { d[f[0]] = f[3] ? f[3].split('|')[0] : ''; });
  d.empStatus = 'Regular'; d.reasonSep = 'N/A'; d.substituted = 'Yes'; d.nationality = 'Filipino';
  d.nt_p_gross = p.gross; d.nt_p_sss = p.contrib;
  d.nt_p_basicMWE = type === 'M' ? p.mwe : 0; d.nt_p_salariesMWE = 0;
  d.nt_p_thirteen = p.thirteen; d.nt_p_deminimis = p.demin; d.nt_p_totalNT = p.nonTax;
  d.nt_v_gross = v ? wtcNum(v.gross) : 0; d.nt_v_sss = 0;
  d.nt_v_basicMWE = 0; d.nt_v_salariesMWE = 0; d.nt_v_thirteen = 0; d.nt_v_deminimis = 0;
  d.nt_v_totalNT = v ? wtcNum(v.nonTax) : 0;
  d.tx_p_basic = 0; d.tx_p_thirteen = 0; d.tx_p_salaries = p.taxable; d.tx_p_total = p.taxable;
  d.tx_v_basic = 0; d.tx_v_thirteen = 0; d.tx_v_salaries = v ? wtcNum(v.taxable) : 0; d.tx_v_total = v ? wtcNum(v.taxable) : 0;
  d.tx_totalCombined = p.taxable + (v ? wtcNum(v.taxable) : 0);
  d.netTaxable = e.taxable; d.taxDue = e.due;
  d.twPresent = p.withheld; d.twPrevious = v ? wtcNum(v.withheld) : 0;
  d.twDec = 0; d.overRefunded = e.adj < 0 ? -e.adj : 0; d.pera = 0;
  d.twAdjusted = e.withheld;
  return d;
}
