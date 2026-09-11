export const STATUSES = [
  'wishlist',
  'applied',
  'screening',
  'interviewing',
  'offer',
  'rejected',
  'ghosted',
  'withdrawn',
] as const;

export type Status = (typeof STATUSES)[number];

export const ACTIVE_STATUSES: Status[] = ['wishlist', 'applied', 'screening', 'interviewing', 'offer'];
export const CLOSED_STATUSES: Status[] = ['rejected', 'ghosted', 'withdrawn'];

export const STATUS_LABEL: Record<Status, string> = {
  wishlist: 'Wishlist',
  applied: 'Applied',
  screening: 'Screening',
  interviewing: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  ghosted: 'Ghosted',
  withdrawn: 'Withdrawn',
};

export const STATUS_HINT: Record<Status, string> = {
  wishlist: 'Jobs saved to apply to later',
  applied: 'Sent and waiting to hear back',
  screening: 'Recruiter call or assessment',
  interviewing: 'In interview rounds',
  offer: 'Offer in hand',
  rejected: 'They passed',
  ghosted: 'No reply, even after following up',
  withdrawn: 'You pulled out',
};

export type WorkMode = '' | 'remote' | 'hybrid' | 'onsite';

export const WORK_MODE_LABEL: Record<Exclude<WorkMode, ''>, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
};

export type Priority = 1 | 2 | 3;

export const PRIORITY_LABEL: Record<Priority, string> = { 1: 'Low', 2: 'Normal', 3: 'High' };

export interface StatusChange {
  status: Status;
  /** ISO timestamp */
  at: string;
}

export interface Application {
  id: string;
  company: string;
  role: string;
  url: string;
  location: string;
  workMode: WorkMode;
  salary: string;
  source: string;
  status: Status;
  /** yyyy-mm-dd, empty if not applied yet */
  dateApplied: string;
  /** yyyy-mm-dd, empty if no reminder */
  followUpDate: string;
  contactName: string;
  contactEmail: string;
  resumeVersion: string;
  priority: Priority;
  notes: string;
  history: StatusChange[];
  createdAt: string;
  updatedAt: string;
}

export type Draft = Omit<Application, 'id' | 'history' | 'createdAt' | 'updatedAt'>;

export function emptyDraft(status: Status = 'applied'): Draft {
  return {
    company: '',
    role: '',
    url: '',
    location: '',
    workMode: '',
    salary: '',
    source: '',
    status,
    dateApplied: '',
    followUpDate: '',
    contactName: '',
    contactEmail: '',
    resumeVersion: '',
    priority: 2,
    notes: '',
  };
}

export function toDraft(app: Application): Draft {
  const { id, history, createdAt, updatedAt, ...draft } = app;
  return draft;
}

/** Whether moving into this status means the application has been sent. */
export function impliesApplied(status: Status): boolean {
  return status !== 'wishlist' && status !== 'withdrawn';
}

/** Returns a clickable http(s) URL, or null for anything else (e.g. javascript: links). */
export function safeUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
