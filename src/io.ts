import { normalizeApp } from './storage';
import { PRIORITY_LABEL, STATUS_LABEL, WORK_MODE_LABEL, type Application } from './types';

const CSV_COLUMNS = [
  ['company', 'Company'],
  ['role', 'Role'],
  ['status', 'Status'],
  ['dateApplied', 'Date applied'],
  ['followUpDate', 'Follow-up date'],
  ['location', 'Location'],
  ['workMode', 'Work mode'],
  ['salary', 'Salary'],
  ['source', 'Source'],
  ['url', 'Job link'],
  ['contactName', 'Contact name'],
  ['contactEmail', 'Contact email'],
  ['resumeVersion', 'Resume version'],
  ['priority', 'Priority'],
  ['notes', 'Notes'],
] as const;

type CsvField = (typeof CSV_COLUMNS)[number][0];

/** Header names we recognise on import, lowercased with non-letters removed. */
const HEADER_ALIASES: Record<string, CsvField> = {
  company: 'company', companyname: 'company', employer: 'company', organization: 'company',
  role: 'role', position: 'role', title: 'role', jobtitle: 'role', job: 'role',
  status: 'status', stage: 'status',
  dateapplied: 'dateApplied', applied: 'dateApplied', appliedon: 'dateApplied', applicationdate: 'dateApplied', date: 'dateApplied',
  followupdate: 'followUpDate', followup: 'followUpDate', nextfollowup: 'followUpDate', reminder: 'followUpDate',
  location: 'location', city: 'location',
  workmode: 'workMode', worktype: 'workMode', remote: 'workMode', arrangement: 'workMode',
  salary: 'salary', pay: 'salary', compensation: 'salary', salaryrange: 'salary',
  source: 'source', foundvia: 'source', platform: 'source', website: 'source',
  joblink: 'url', url: 'url', link: 'url', joburl: 'url', posting: 'url', jobposting: 'url',
  contactname: 'contactName', contact: 'contactName', recruiter: 'contactName', hiringmanager: 'contactName',
  contactemail: 'contactEmail', email: 'contactEmail', recruiteremail: 'contactEmail',
  resumeversion: 'resumeVersion', resume: 'resumeVersion', cv: 'resumeVersion',
  priority: 'priority', interest: 'priority',
  notes: 'notes', note: 'notes', comments: 'notes',
};

function csvCell(value: string): string {
  // Keep spreadsheets from treating text as a formula.
  const safe = /^[=+@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCSV(apps: Application[]): string {
  const header = CSV_COLUMNS.map(([, label]) => label).join(',');
  const rows = apps.map((app) =>
    CSV_COLUMNS.map(([field]) => {
      if (field === 'status') return csvCell(STATUS_LABEL[app.status]);
      if (field === 'priority') return csvCell(PRIORITY_LABEL[app.priority]);
      if (field === 'workMode') return csvCell(app.workMode ? WORK_MODE_LABEL[app.workMode] : '');
      return csvCell(app[field]);
    }).join(','),
  );
  // BOM so Excel reads UTF-8 correctly.
  return '\uFEFF' + [header, ...rows].join('\r\n');
}

export function parseCSV(input: string): string[][] {
  const s = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function fromCSV(input: string): Application[] {
  const [header, ...rows] = parseCSV(input);
  if (!header) return [];
  const fields = header.map((h) => HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')] ?? null);
  if (!fields.includes('company') && !fields.includes('role')) return [];

  return rows
    .map((cells) => {
      const record: Record<string, string> = {};
      fields.forEach((field, i) => {
        if (field && !record[field]) record[field] = (cells[i] ?? '').replace(/^'(?=[=+@])/, '');
      });
      return normalizeApp(record);
    })
    .filter((a): a is Application => a !== null);
}

export function toJSONBackup(apps: Application[]): string {
  return JSON.stringify(
    { app: 'application-tracker', version: 1, exportedAt: new Date().toISOString(), applications: apps },
    null,
    2,
  );
}

export function fromJSON(input: string): Application[] {
  const data: unknown = JSON.parse(input);
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { applications?: unknown }).applications)
      ? (data as { applications: unknown[] }).applications
      : null;
  if (!list) throw new Error('Not an application list');
  return list.map((item) => normalizeApp(item)).filter((a): a is Application => a !== null);
}

/** Same id replaces; same company + role + date is treated as a duplicate. */
export function mergeApps(existing: Application[], incoming: Application[]) {
  const keyOf = (a: Application) => `${a.company}|${a.role}|${a.dateApplied}`.toLowerCase();
  const result = [...existing];
  const indexById = new Map(result.map((a, i) => [a.id, i]));
  const keys = new Set(result.map(keyOf));
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const app of incoming) {
    const index = indexById.get(app.id);
    if (index !== undefined) {
      result[index] = app;
      updated++;
    } else if (keys.has(keyOf(app))) {
      skipped++;
    } else {
      indexById.set(app.id, result.length);
      keys.add(keyOf(app));
      result.push(app);
      added++;
    }
  }
  return { apps: result, added, updated, skipped };
}

export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
