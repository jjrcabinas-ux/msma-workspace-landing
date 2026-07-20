import { MON, lastDayOfMonth, monthLabel, pad2, shiftMonth, toIso } from './dates';

export type BirFiling = {
  id: string;
  code: string;
  label: string;
  periodLabel: string;
  dueDate: string;
};

function dueDateFor(year: number, monthIndex0: number, dueDay: number | 'last'): Date {
  const day = dueDay === 'last' ? lastDayOfMonth(year, monthIndex0) : dueDay;
  return new Date(year, monthIndex0, day);
}

// ---------------------------------------------------------------------------
// Rule tables transcribed from BIR's published 2026 Tax Calendar
// (P&A Grant Thornton edition). Fiscal-year-end rotating items and niche
// industry items are best-effort reads — verify with BIR before relying
// on them for compliance-critical dates.
// ---------------------------------------------------------------------------

const MONTHLY_FIXED_DAY: { code: string; label: string; dueDay: number | 'last' }[] = [
  { code: '2000 / 2000-OT', label: 'Documentary Stamp Tax (DST)', dueDay: 5 },
  { code: 'eSales (even TIN)', label: 'CRM/POS Sales Report — TIN ending in an even number', dueDay: 8 },
  { code: 'ORB Transcript', label: 'Transcript sheets of ORB — alcohol, tobacco, petroleum, non-essential, sweetened beverage, mineral & automobile products', dueDay: 8 },
  { code: '1600-VT/1600-PT/1606', label: 'Withholding VAT/Percentage Tax on Govt Money Payments (all filers)', dueDay: 10 },
  { code: '2200C/2200M', label: 'Excise Tax Return', dueDay: 10 },
  { code: '0605', label: 'BIR Payment Form (B2C VAT — RBEs under 5% SCIT)', dueDay: 10 },
  { code: '0620', label: 'Monthly Remittance Form', dueDay: 10 },
  { code: '1601-C / 0619-E / 0619-F', label: 'Withholding Tax Remittance — non-eFPS filers', dueDay: 10 },
  { code: 'MAP', label: 'Monthly Alphalist of Payees (1600-VT/1600-PT)', dueDay: 10 },
  { code: 'Sugar Report', label: "Sugar cooperative's list of buyers / refined sugar release information", dueDay: 10 },
  { code: '2307 (VAT/PT)', label: '2307 distribution to payees (VAT/Percentage Tax)', dueDay: 10 },
  { code: 'eSales (odd TIN)', label: 'CRM/POS Sales Report — TIN ending in an odd number', dueDay: 10 },
  { code: '1600-PT/1606 e-Payment', label: 'e-Payment — all filers', dueDay: 15 },
  { code: 'SAWT (2307)', label: 'Summary Alphalist of Withholding Tax (BIR Form 2307)', dueDay: 15 },
  { code: 'PhilHealth', label: 'Remittance report & PAR contributions — all employers (PEN ending 0-4 and 5-9)', dueDay: 20 },
  { code: 'PEZA Monthly Report', label: 'Economic Zone Monthly Performance Report', dueDay: 20 },
  { code: 'SSS R-5', label: 'Online remittance of contributions (R-5)', dueDay: 'last' },
];

const EFPS_GROUPS: { group: string; dueDay: number }[] = [
  { group: 'E', dueDay: 11 },
  { group: 'D', dueDay: 12 },
  { group: 'C', dueDay: 13 },
  { group: 'B', dueDay: 14 },
  { group: 'A', dueDay: 15 },
];

const HDMF_GROUPS: { range: string; dueDay: number }[] = [
  { range: 'A-D', dueDay: 14 },
  { range: 'E-L', dueDay: 19 },
  { range: 'M-Q', dueDay: 24 },
  { range: 'R-Z', dueDay: 25 },
];

type QuarterlyForm = { code: string; label: string; monthsAfterQuarter: number; dueDay: number | 'last' };
const QUARTERLY_FORMS: QuarterlyForm[] = [
  { code: '2550Q/2551Q/2550-DS', label: 'Quarterly VAT / Percentage Tax Return', monthsAfterQuarter: 1, dueDay: 25 },
  { code: '1601-EQ/1601-FQ/1602Q/1603Q/1621', label: 'Quarterly Withholding/Percentage/Amusement Tax + QAP attachments', monthsAfterQuarter: 1, dueDay: 'last' },
  { code: 'SLSP', label: 'Summary List of Sales/Purchases — non-eFPS filers', monthsAfterQuarter: 1, dueDay: 'last' },
  { code: 'CRM/POS Sold List', label: 'Summary list of CRM/POS machines sold by dealers/vendors', monthsAfterQuarter: 1, dueDay: 15 },
  { code: 'Printer Report', label: 'Quarterly Report of Printer of Receipts/Invoices', monthsAfterQuarter: 1, dueDay: 20 },
  { code: 'OFW/OCW DST Info', label: 'DST-exempt OFW/OCW remittance information', monthsAfterQuarter: 1, dueDay: 20 },
  { code: '2307 (EWT)', label: '2307 distribution to payees (Expanded Withholding Tax)', monthsAfterQuarter: 1, dueDay: 20 },
  { code: '1701Q', label: 'Quarterly Income Tax — Individual/Professional', monthsAfterQuarter: 2, dueDay: 15 },
];

type FyRotating = { code: string; label: string; offsetMonths: number; dueDay: number | 'last' };
const FY_ROTATING: FyRotating[] = [
  { code: '1700/1701/1701A/1702-RT/EX/MX', label: 'Annual Income Tax Return + attachments', offsetMonths: 4, dueDay: 15 },
  { code: 'SEC AFS', label: 'Audited Financial Statements — securities registered under RSA/SRC', offsetMonths: 4, dueDay: 15 },
  { code: 'SEC AFS', label: 'Audited Financial Statements — securities not registered under RSA/SRC', offsetMonths: 5, dueDay: 11 },
  { code: 'PEZA AFS/ITR', label: 'PEZA AFS & Annual ITR of PEZA-registered enterprises', offsetMonths: 4, dueDay: 15 },
  { code: 'PEZA Annual Report', label: 'Annual PEZA Report', offsetMonths: 4, dueDay: 'last' },
  { code: 'BOI Jewelry ORB', label: 'BOI transcript sheets of ORB — qualified jewelry enterprises', offsetMonths: 1, dueDay: 'last' },
  { code: 'Inventory List', label: 'Inventory list', offsetMonths: 1, dueDay: 'last' },
  { code: 'CAS Books', label: 'Computerized books of accounts & accounting records (CD-R/DVD-R/optical media)', offsetMonths: 1, dueDay: 'last' },
];

type AnnualFixed = { code: string; label: string; monthIndex0: number; dueDay: number | 'last'; periodYearOffset: number };
const ANNUAL_FIXED: AnnualFixed[] = [
  { code: '1601-C e-Payment (CY)', label: 'e-Payment of withholding tax on compensation — all eFPS filers, calendar year', monthIndex0: 3, dueDay: 15, periodYearOffset: -1 },
  { code: 'Books of Accounts (CY)', label: 'Bound/loose-leaf books of accounts & accounting records', monthIndex0: 3, dueDay: 15, periodYearOffset: -1 },
  { code: '1604-C/1604-F', label: 'Annual Alphalist of Employees & Payees', monthIndex0: 0, dueDay: 31, periodYearOffset: -1 },
  { code: 'Insurance Annual Report', label: 'Annual report to the Insurance Commission — insurance companies', monthIndex0: 3, dueDay: 'last', periodYearOffset: -1 },
  { code: 'RFC', label: 'Request for Confirmation — tax treaty relief entitlement', monthIndex0: 3, dueDay: 'last', periodYearOffset: -1 },
  { code: 'Forex Election', label: 'Notarized sworn statement — election to use non-BAP forex rates', monthIndex0: 11, dueDay: 2, periodYearOffset: 1 },
];

const SEMIANNUAL = [
  { code: 'Mines/Quarries Sworn Stmt', label: 'Sworn statements of lessees/concessionaires/owners/operators of mines or quarries, and mineral processors/producers' },
  { code: 'Automobile Sworn Stmt', label: 'Sworn statements of automobile manufacturers, assemblers or importers' },
];

export function birFilingsForDate(iso: string): BirFiling[] {
  const [y, m] = iso.split('-').map(Number);
  return birFilingsForMonth(y, m - 1).filter((f) => f.dueDate === iso);
}

export function birFilingsForMonth(year: number, monthIndex0: number): BirFiling[] {
  const filings: BirFiling[] = [];
  const covered = shiftMonth(year, monthIndex0, -1);
  const coveredLabel = monthLabel(covered.year, covered.monthIndex0);
  const isDecemberCovered = covered.monthIndex0 === 11;

  for (const f of MONTHLY_FIXED_DAY) {
    const dueDay = isDecemberCovered && f.code === '1601-C / 0619-E / 0619-F' ? 15 : f.dueDay;
    filings.push({
      id: `${f.code}-${covered.year}-${pad2(covered.monthIndex0 + 1)}`,
      code: f.code,
      label: f.label,
      periodLabel: coveredLabel,
      dueDate: toIso(dueDateFor(year, monthIndex0, dueDay)),
    });
  }

  for (const g of EFPS_GROUPS) {
    filings.push({
      id: `1601C-eFPS-${g.group}-${covered.year}-${pad2(covered.monthIndex0 + 1)}`,
      code: '1601-C / 0619-E / 0619-F',
      label: `e-Filing — eFPS filers under Group ${g.group}`,
      periodLabel: coveredLabel,
      dueDate: toIso(dueDateFor(year, monthIndex0, g.dueDay)),
    });
  }

  for (const g of HDMF_GROUPS) {
    filings.push({
      id: `HDMF-${g.range}-${covered.year}-${pad2(covered.monthIndex0 + 1)}`,
      code: 'HDMF MCRF',
      label: `Pag-IBIG contributions — employers whose names start with ${g.range}`,
      periodLabel: coveredLabel,
      dueDate: toIso(dueDateFor(year, monthIndex0, g.dueDay)),
    });
  }

  for (const f of QUARTERLY_FORMS) {
    const quarterEnd = shiftMonth(year, monthIndex0, -f.monthsAfterQuarter);
    if (quarterEnd.monthIndex0 % 3 !== 2) continue; // fires only in the actual due month
    const quarterIndex = Math.floor(quarterEnd.monthIndex0 / 3);
    if (f.code === '1701Q' && quarterIndex === 3) continue; // Q4 covered by the annual return
    filings.push({
      id: `${f.code}-${quarterEnd.year}-Q${quarterIndex + 1}`,
      code: f.code,
      label: f.label,
      periodLabel: `Q${quarterIndex + 1} ${quarterEnd.year}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, f.dueDay)),
    });
  }

  // 1702Q — due 60 calendar days after the close of the covered fiscal quarter.
  for (let back = 1; back <= 3; back++) {
    const qEnd = shiftMonth(year, monthIndex0, -back);
    const qEndDate = new Date(qEnd.year, qEnd.monthIndex0, lastDayOfMonth(qEnd.year, qEnd.monthIndex0));
    const due = new Date(qEndDate);
    due.setDate(due.getDate() + 60);
    if (due.getFullYear() === year && due.getMonth() === monthIndex0) {
      filings.push({
        id: `1702Q-${qEnd.year}-${pad2(qEnd.monthIndex0 + 1)}`,
        code: '1702Q',
        label: 'Quarterly Income Tax — Corporation (fiscal-year filers)',
        periodLabel: `TQ ended ${monthLabel(qEnd.year, qEnd.monthIndex0)}`,
        dueDate: toIso(due),
      });
    }
  }

  for (const f of FY_ROTATING) {
    const fy = shiftMonth(year, monthIndex0, -f.offsetMonths);
    filings.push({
      id: `${f.code}-${f.label.slice(0, 8)}-${fy.year}-${pad2(fy.monthIndex0 + 1)}`,
      code: f.code,
      label: f.label,
      periodLabel: `FY ended ${monthLabel(fy.year, fy.monthIndex0)}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, f.dueDay)),
    });
  }

  for (const f of ANNUAL_FIXED) {
    if (monthIndex0 !== f.monthIndex0) continue;
    const periodYear = year + f.periodYearOffset;
    filings.push({
      id: `${f.code}-${periodYear}`,
      code: f.code,
      label: f.label,
      periodLabel: `CY ${periodYear}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, f.dueDay)),
    });
  }

  // Semi-annual sworn statements — Jan 15 (H2 of prior year) and Jul 15 (H1)
  if (monthIndex0 === 0 || monthIndex0 === 6) {
    const half = monthIndex0 === 0 ? 'second half' : 'first half';
    const halfYear = monthIndex0 === 0 ? year - 1 : year;
    for (const s of SEMIANNUAL) {
      filings.push({
        id: `${s.code}-${halfYear}-${monthIndex0 === 0 ? 'H2' : 'H1'}`,
        code: s.code,
        label: s.label,
        periodLabel: `${half} of ${halfYear}`,
        dueDate: toIso(dueDateFor(year, monthIndex0, 15)),
      });
    }
  }

  // LGU business tax quarterly installment — Jan/Apr/Jul/Oct 20
  if (monthIndex0 % 3 === 0) {
    const q = Math.floor(monthIndex0 / 3) + 1;
    filings.push({
      id: `LGU-BizTax-${year}-Q${q}`,
      code: 'LGU Business Tax',
      label: `Local business tax — ${['1st', '2nd', '3rd', '4th'][q - 1]} quarterly installment`,
      periodLabel: `CY ${year}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, 20)),
    });
  }

  // LGU real property tax quarterly installment — Mar/Jun/Sep/Dec last day
  if (monthIndex0 % 3 === 2) {
    const q = Math.floor(monthIndex0 / 3) + 1;
    filings.push({
      id: `LGU-RPT-${year}-Q${q}`,
      code: 'LGU Real Property Tax',
      label: `Real property tax — ${['1st', '2nd', '3rd', '4th'][q - 1]} quarterly installment`,
      periodLabel: `CY ${year}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, 'last')),
    });
  }

  // Engagement letters for financial audit — rolling monthly, due the 1st
  {
    const ty = shiftMonth(year, monthIndex0, 14);
    filings.push({
      id: `Audit-Engagement-${year}-${pad2(monthIndex0 + 1)}`,
      code: 'Audit Engagement Letter',
      label: 'Engagement letters & renewals/subsequent agreements for financial audit by independent CPAs',
      periodLabel: `TY beginning ${monthLabel(ty.year, ty.monthIndex0)}`,
      dueDate: toIso(dueDateFor(year, monthIndex0, 1)),
    });
  }

  return filings.sort((a, b) =>
    a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.code.localeCompare(b.code)
  );
}

export { MON };
