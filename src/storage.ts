import { parseLooseDate } from './dates';
import { STATUSES, type Application, type Priority, type Status, type StatusChange, type WorkMode } from './types';

const APPS_KEY = 'application-tracker:v1';
const PREF_PREFIX = 'application-tracker:pref:';

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const STATUS_ALIASES: Record<string, Status> = {
  saved: 'wishlist',
  'to apply': 'wishlist',
  submitted: 'applied',
  'phone screen': 'screening',
  screen: 'screening',
  assessment: 'screening',
  'online assessment': 'screening',
  interview: 'interviewing',
  offered: 'offer',
  declined: 'rejected',
  'no response': 'ghosted',
  'no reply': 'ghosted',
  withdrew: 'withdrawn',
};

export function parseStatus(value: unknown): Status | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if ((STATUSES as readonly string[]).includes(v)) return v as Status;
  return STATUS_ALIASES[v] ?? null;
}

function parseWorkMode(value: unknown): WorkMode {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (v === 'remote' || v === 'hybrid' || v === 'onsite') return v;
  if (v === 'inoffice' || v === 'office' || v === 'inperson') return 'onsite';
  return '';
}

function parsePriority(value: unknown): Priority {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === '3' || v === 'high') return 3;
  if (v === '1' || v === 'low') return 1;
  return 2;
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';

/** Turns anything that looks like an application into a valid one, or null. */
export function normalizeApp(raw: unknown): Application | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const company = text(r.company);
  const role = text(r.role);
  if (!company && !role) return null;

  const status = parseStatus(r.status) ?? 'wishlist';
  const dateApplied = parseLooseDate(text(r.dateApplied));
  const now = new Date().toISOString();

  const history: StatusChange[] = Array.isArray(r.history)
    ? r.history.flatMap((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        const s = parseStatus(e.status);
        return s && typeof e.at === 'string' ? [{ status: s, at: e.at }] : [];
      })
    : [];
  if (history.length === 0) {
    history.push({ status, at: dateApplied ? new Date(`${dateApplied}T12:00:00`).toISOString() : now });
  }

  return {
    id: text(r.id) || newId(),
    company: company || 'Untitled company',
    role: role || 'Untitled role',
    url: text(r.url),
    location: text(r.location),
    workMode: parseWorkMode(r.workMode),
    salary: text(r.salary),
    source: text(r.source),
    status,
    dateApplied,
    followUpDate: parseLooseDate(text(r.followUpDate)),
    contactName: text(r.contactName),
    contactEmail: text(r.contactEmail),
    resumeVersion: text(r.resumeVersion),
    priority: parsePriority(r.priority),
    notes: typeof r.notes === 'string' ? r.notes : '',
    history,
    createdAt: text(r.createdAt) || history[0].at,
    updatedAt: text(r.updatedAt) || now,
  };
}

export function loadApps(): Application[] {
  try {
    const raw = localStorage.getItem(APPS_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((item) => normalizeApp(item)).filter((a): a is Application => a !== null);
  } catch {
    return [];
  }
}

/** Returns false when the browser refuses to store data (private mode, quota). */
export function saveApps(apps: Application[]): boolean {
  try {
    localStorage.setItem(APPS_KEY, JSON.stringify(apps));
    return true;
  } catch {
    return false;
  }
}

export function readPref(name: string): string | null {
  try {
    return localStorage.getItem(PREF_PREFIX + name);
  } catch {
    return null;
  }
}

export function writePref(name: string, value: string): void {
  try {
    localStorage.setItem(PREF_PREFIX + name, value);
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}
