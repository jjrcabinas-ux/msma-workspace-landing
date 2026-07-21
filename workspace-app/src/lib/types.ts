export type BoardStatus = 'working' | 'done' | 'stuck' | 'review';

export type BoardItem = {
  name: string;
  chip?: string;
  p: string;
  s: BoardStatus;
  due: string;
};

export type BoardGroup = {
  name: string;
  color: string;
  items: BoardItem[];
};

export type OwnerBoard = {
  uid: string;
  groups: BoardGroup[];
};

export type SheetStatus = 'Pending' | 'Ongoing' | 'Done';

export type SheetTask = {
  id: string;
  date: string;
  task: string;
  details: string;
  due: string; // ISO in the UI; stored as a Firestore Timestamp for the rules
  status: SheetStatus;
  help: string;
  order?: number; // createdAt millis, for stable sorting
};

export type UserProfile = {
  username?: string;
  fullName?: string;
  email?: string;
  birthdate?: string;
  mobile?: string;
  position?: string;
  photo?: string | null;
  profileComplete?: boolean;
};

export type UsersMap = Record<
  string,
  { label: string; photo: string | null; email: string; position: string; fullName: string; mobile: string; birthdate: string }
>;

export const STATUS_LABEL: Record<BoardStatus, string> = {
  done: 'Done',
  working: 'Working on it',
  stuck: 'Stuck',
  review: 'For review',
};

// One entry on a member's private Personal calendar.
export type PersonalEvent = { id: string; date: string; title: string };

export const CLUSTERS =['RPM', 'VCM', 'ADS', 'INTERN'] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const POSITIONS = ['Junior Associate', 'Senior Associate', 'Associate Director', 'Partner'];

export const TAX_TYPES = ['WTC', 'EWT', 'FWT', 'WVAT', 'VAT', 'DST', 'FBT', 'IT'] as const;

export type ClientContact = { name: string; position: string; phone: string; email: string };

export type Client = {
  id: string;
  cluster: string;
  name: string;
  tin: string;
  rdo: string;
  address: string;
  channel: '' | 'eBIR' | 'eFPS';
  preparer: string;
  reviewer: string;
  contacts: ClientContact[];
  taxTypes: Record<string, boolean>;
};

export const DEFAULT_GROUPS: BoardGroup[] = [
  { name: 'Employee Task Monitoring Summary', color: 'var(--blue)', items: [] },
  { name: 'Tax Compliance System Summary', color: 'var(--lime)', items: [] },
  { name: 'Audit Summary', color: 'var(--amber)', items: [] },
  { name: 'Bookkeeping Summary', color: 'var(--red)', items: [] },
];
