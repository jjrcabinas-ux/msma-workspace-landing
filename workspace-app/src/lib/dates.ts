export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONFULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const WEEKSHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(): string {
  return toIso(new Date());
}

export function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return toIso(new Date(y, m - 1, d + n));
}

export function lastDayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

export function firstWeekdayOfMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0, 1).getDay();
}

export function shiftMonth(year: number, monthIndex0: number, delta: number): { year: number; monthIndex0: number } {
  const total = monthIndex0 + delta;
  return { year: year + Math.floor(total / 12), monthIndex0: ((total % 12) + 12) % 12 };
}

export function monthLabel(year: number, monthIndex0: number): string {
  return `${MON[monthIndex0]} ${year}`;
}
