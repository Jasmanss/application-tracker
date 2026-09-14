import { parseLooseDate, todayISO } from '../dates';
import { CLOSED_STATUSES, type Application, type Status } from '../types';

/** A raw email, from Gmail or pasted in by hand. */
export interface EmailInput {
  from: string;
  subject: string;
  body: string;
  date: string;
  id?: string;
}

/** What the parser managed to read out of one email. */
export interface ParsedEmail {
  company: string;
  role: string;
  status: Status;
  /** yyyy-mm-dd of the email */
  date: string;
  source: string;
  /** The subject (or body start) shown to the user as proof. */
  evidence: string;
}

/** A parsed email checked against the applications already tracked. */
export interface Suggestion extends ParsedEmail {
  key: string;
  action: 'new' | 'update' | 'skip';
  existingId?: string;
  checked: boolean;
}

/* ------------------------------------------------------------------
   Classification: is this email about a job application, and which
   stage does it put the application in?
------------------------------------------------------------------- */
const RE_OFFER =
  /(pleased to (?:extend|offer)|excited to offer you|offer of employment|offer letter|extend (?:you )?an offer|formal offer)/i;

const RE_REJECTED =
  /(unfortunately|we regret|regret to inform|not (?:to )?move forward|not moving forward|moving forward with other|decided to (?:move forward|proceed|go) with other|other candidates|no longer under consideration|not been selected|unable to offer|will not be (?:progressing|proceeding)|pursue other (?:candidates|applicants)|position has been filled)/i;

const RE_SCREENING =
  /(phone screen|screening call|recruiter (?:call|screen|chat)|initial (?:call|chat|conversation)|assessment|coding challenge|online test|take-?home)/i;

const RE_INTERVIEW =
  /(schedule (?:an|your|the) interview|interview invitation|invite you to (?:an )?interview|interview with|upcoming interview|confirm your interview|availability for (?:an|a) (?:interview|call|chat)|would like to (?:speak|talk|meet|chat) with you|next round)/i;

const RE_APPLIED =
  /(thank(?:s| you) for applying|thank(?:s| you) for your (?:application|interest)|application (?:was |has been )?(?:received|submitted|sent)|received your application|your application (?:to|for|was)|successfully (?:applied|submitted)|you(?:'ve| have)? applied to|application confirmation|confirming (?:receipt of )?your application)/i;

/* ------------------------------------------------------------------
   Company & role extraction
------------------------------------------------------------------- */

/** Sender names/domains that are platforms, not the hiring company. */
const PLATFORMS: [RegExp, string][] = [
  [/linkedin/i, 'LinkedIn'],
  [/indeed/i, 'Indeed'],
  [/wellfound|angellist/i, 'Wellfound'],
  [/ziprecruiter/i, 'ZipRecruiter'],
  [/glassdoor/i, 'Glassdoor'],
  [/greenhouse/i, 'Greenhouse'],
  [/lever\.co|hire\.lever/i, 'Lever'],
  [/workday|myworkday/i, 'Workday'],
  [/icims/i, 'iCIMS'],
  [/smartrecruiters/i, 'SmartRecruiters'],
  [/jobvite/i, 'Jobvite'],
  [/ashby/i, 'Ashby'],
  [/breezy/i, 'Breezy'],
  [/recruitee/i, 'Recruitee'],
  [/workable/i, 'Workable'],
  [/taleo|oracle/i, 'Taleo'],
  [/successfactors/i, 'SuccessFactors'],
  [/bamboohr/i, 'BambooHR'],
  [/monster\.com/i, 'Monster'],
  [/dice\.com/i, 'Dice'],
];

const GENERIC_MAILBOX =
  /^(no-?reply|noreply|do-?not-?reply|notifications?|jobs?|careers?|talent|recruiting|apply|applications?|hr|hello|hi|info|mail|email|team|support|updates?)$/i;

const FREE_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|me|aol|proton|protonmail|mail)$/i;

function cleanCompany(raw: string): string {
  let c = raw
    .replace(/["'“”*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Figma - Product Engineer" → "Figma" (spaced dashes are separators; Rolls-Royce is safe).
  c = c.split(/\s+[-–—|•]\s+/)[0];
  // "Halcyon Health on Indeed" → "Halcyon Health".
  c = c.replace(/\s+(?:on|via|through)\s+(?:linkedin|indeed|wellfound|angellist|ziprecruiter|glassdoor|monster|dice)\b.*$/i, '');
  c = c.replace(/^(?:the team at|the|team)\s+/i, '');
  c = c.replace(/\s+(?:careers?|recruiting|recruitment|talent(?: acquisition)?|hiring(?: team)?|hr|people(?: team| ops)?|jobs?|notifications?|team|inc\.?|llc\.?|ltd\.?)$/i, '');
  c = c.replace(/[|:,.!\-–—\s]+$/g, '').trim();
  if (c.length < 2 || c.length > 60 || c.includes('@') || /^(you|your|we|us|our|hi|hello)$/i.test(c)) return '';
  return c;
}

function cleanRole(raw: string): string {
  let r = raw.replace(/["'“”*]/g, '').replace(/\s+/g, ' ').trim();
  r = r.replace(/^(?:the|a|an|our|open)\s+/i, '');
  r = r.replace(/\s*\(?(?:remote|hybrid|on-?site|f\/?m\/?d|all genders)\)?$/i, '');
  r = r.replace(/[|:,.!\-–—\s]+$/g, '').trim();
  if (r.length < 3 || r.length > 70 || r.includes('@') || /\b(application|apply|thank|update|interview)\b/i.test(r)) return '';
  return r;
}

/** "Acme Careers via Greenhouse <no-reply@greenhouse.io>" → display name + address. */
function splitFrom(from: string): { name: string; user: string; domain: string } {
  const addr = from.match(/<([^>]+)>/)?.[1] ?? (from.includes('@') ? from.trim() : '');
  const name = (from.match(/^\s*"?([^"<@]+?)"?\s*(?:<|$)/)?.[1] ?? '').split(/\s+via\s+/i)[0].trim();
  const [user = '', domainFull = ''] = addr.toLowerCase().split('@');
  const parts = domainFull.replace(/[>\s]/g, '').split('.');
  // "jobs.acme.com" → "acme"; crude but good enough for a guess.
  const domain = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? '');
  return { name, user, domain };
}

function platformOf(text: string): string {
  for (const [re, label] of PLATFORMS) if (re.test(text)) return label;
  return '';
}

/** Ordered patterns whose first capture group is the company name. */
const COMPANY_PATTERNS: RegExp[] = [
  /application (?:was )?sent to ([^,.:;\n!?]+)/i,
  /you(?:'ve| have)? applied to .+? at ([^,.:;\n!?]+)/i,
  /(?:thank(?:s| you) for applying (?:to|at|with)|applying to) ([^,.:;\n!?]+)/i,
  /your application (?:to|at|with) (?!this\b|that\b|us\b|you\b|it\b)([^,.:;\n!?]+)/i,
  /application (?:for [^,.:;\n]+? )?(?:to|at|with) (?!this\b|that\b|us\b|you\b|it\b)([^,.:;\n!?]+)/i,
  /interview (?:with|at) (?!this\b|that\b|us\b|you\b|it\b|me\b)([^,.:;\n!?]+)/i,
  /(?:position|role|opportunity|opening|career) (?:at|with) (?!this\b|that\b|us\b|you\b|it\b)([^,.:;\n!?]+)/i,
  /your (?:interest in|candidacy (?:at|with)) ([^,.:;\n!?]+)/i,
  /joining (?:the team at )?([^,.:;\n!?]+)/i,
  /(?:the|from the) ([^,.:;\n!?]+?) (?:talent|recruiting|hiring) team/i,
];

/** Ordered patterns whose first capture group is the role. */
const ROLE_PATTERNS: RegExp[] = [
  /you(?:'ve| have)? applied to (.+?) at /i,
  /application (?:for|to) (?:the )?([^,.:;\n]+?)(?: position| role| opening| opportunity| \(| at | with |[,.:;\n!]|$)/i,
  /applying (?:for|to) (?:the )?([^,.:;\n]+?)(?: position| role| opening| \(| at | with |[,.:;\n!]|$)/i,
  /(?:the|our|your) ([^,.:;\n]{3,70}?) (?:position|role|opening|opportunity|vacancy)/i,
  /interview for (?:the )?([^,.:;\n]+?)(?: position| role| at |[,.:;\n!]|$)/i,
  /candidacy for (?:the )?([^,.:;\n]+?)(?: position| role|[,.:;\n!]|$)/i,
];

function firstMatch(
  patterns: RegExp[],
  texts: string[],
  clean: (s: string) => string,
  isValid: (value: string) => boolean = () => true,
): string {
  for (const text of texts) {
    for (const re of patterns) {
      // Check every occurrence: the first hit can be invalid (e.g. the company
      // where a role should be) while a later one is right.
      for (const match of text.matchAll(new RegExp(re.source, 'gi'))) {
        const value = match[1] ? clean(match[1]) : '';
        if (value && isValid(value)) return value;
      }
    }
  }
  return '';
}

/**
 * Reads one email and returns the application it describes, or null when
 * it doesn't look like a job application email at all.
 */
export function parseEmail(email: EmailInput): ParsedEmail | null {
  const subject = email.subject.replace(/^(?:re|fwd?)\s*:\s*/i, '').trim();
  const body = email.body.replace(/\s+/g, ' ').slice(0, 4000);
  const all = `${subject}\n${body}`;

  const isApplication =
    RE_APPLIED.test(all) ||
    ((RE_REJECTED.test(all) || RE_INTERVIEW.test(all) || RE_OFFER.test(all) || RE_SCREENING.test(all)) &&
      /(application|applying|applied|candidacy|candidate|position|role|opening|recruit|hiring|job)/i.test(all));
  if (!isApplication) return null;

  const status: Status = RE_OFFER.test(all)
    ? 'offer'
    : RE_REJECTED.test(all)
      ? 'rejected'
      : RE_INTERVIEW.test(all)
        ? 'interviewing'
        : RE_SCREENING.test(all)
          ? 'screening'
          : 'applied';

  const { name, user, domain } = splitFrom(email.from);
  const senderPlatform = platformOf(`${name} ${user} ${domain}`);

  let company = firstMatch(COMPANY_PATTERNS, [subject, body], cleanCompany);
  if (company && platformOf(company) && !/^(LinkedIn|Indeed)$/i.test(company)) company = '';
  if (!company && !senderPlatform && name && !GENERIC_MAILBOX.test(name)) company = cleanCompany(name);
  if (!company && !senderPlatform && domain && !FREE_MAIL.test(domain)) {
    company = cleanCompany(domain.charAt(0).toUpperCase() + domain.slice(1));
  }
  if (!company) return null;

  // "applying to Stripe" must not become the role at Stripe.
  const role = firstMatch(ROLE_PATTERNS, [subject, body], cleanRole, (r) => norm(r) !== norm(company));
  const evidence = subject || `${body.slice(0, 90)}…`;

  return {
    company,
    role,
    status,
    date: parseLooseDate(email.date) || todayISO(),
    source: senderPlatform && ['LinkedIn', 'Indeed', 'Wellfound', 'ZipRecruiter', 'Glassdoor'].includes(senderPlatform)
      ? senderPlatform
      : 'Email',
    evidence,
  };
}

/* ------------------------------------------------------------------
   Reconcile parsed emails with what's already tracked
------------------------------------------------------------------- */
const RANK: Partial<Record<Status, number>> = { wishlist: 0, applied: 1, screening: 2, interviewing: 3, offer: 4 };

/** Statuses in an email that count as "hearing from them again". */
const REVIVING: Status[] = ['screening', 'interviewing', 'offer', 'rejected'];

/** The day an application was moved to Ghosted (falls back to last touch). */
function ghostedSince(app: Application): string {
  const entry = [...app.history].reverse().find((h) => h.status === 'ghosted');
  return (entry?.at ?? app.updatedAt).slice(0, 10);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function rolesMatch(a: string, b: string): boolean {
  if (!a || !b) return true;
  const na = norm(a);
  const nb = norm(b);
  return na.includes(nb) || nb.includes(na);
}

/**
 * Dedupes parsed emails (several emails about one application) and decides,
 * per application, whether it's new, a status update, or already tracked.
 */
export function reconcile(parsed: (ParsedEmail & { id?: string })[], apps: Application[]): Suggestion[] {
  // Group multiple emails about the same company + role.
  const groups = new Map<string, (ParsedEmail & { id?: string })[]>();
  for (const p of parsed) {
    // Role can be missing on some emails of a thread, so group by company
    // first and split by role only when two distinct roles are present.
    const withRole = [...groups.keys()].find(
      (k) => k.startsWith(`${norm(p.company)}|`) && rolesMatch(k.split('|')[1], norm(p.role)),
    );
    const key = withRole ?? `${norm(p.company)}|${norm(p.role)}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const suggestions: Suggestion[] = [];
  for (const group of groups.values()) {
    // The furthest stage wins; the earliest "applied" email dates the application.
    const best = [...group].sort(
      (a, b) => (b.status === 'rejected' ? 5 : (RANK[b.status] ?? 0)) - (a.status === 'rejected' ? 5 : (RANK[a.status] ?? 0)),
    )[0];
    const appliedDates = group.filter((g) => g.status === 'applied').map((g) => g.date);
    const date = appliedDates.length > 0 ? appliedDates.sort()[0] : best.date;
    const role = group.map((g) => g.role).find(Boolean) ?? '';

    const existing = apps
      .filter((a) => norm(a.company) === norm(best.company) && rolesMatch(a.role, role))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];

    const newest = group.map((g) => g.date).sort().at(-1) ?? best.date;

    let action: Suggestion['action'];
    let existingId: string | undefined;
    if (!existing) {
      action = 'new';
    } else if (
      // Back from the dead: a ghosted application whose email arrived after
      // it was ghosted comes back at whatever stage the email says.
      existing.status === 'ghosted' &&
      REVIVING.includes(best.status) &&
      newest >= ghostedSince(existing)
    ) {
      action = 'update';
      existingId = existing.id;
    } else if (
      CLOSED_STATUSES.includes(existing.status) ||
      (best.status !== 'rejected' && (RANK[best.status] ?? 0) <= (RANK[existing.status] ?? 0))
    ) {
      action = 'skip';
      existingId = existing.id;
    } else {
      action = 'update';
      existingId = existing.id;
    }

    suggestions.push({
      ...best,
      role,
      date,
      key: best.id ?? `${norm(best.company)}|${norm(role)}`,
      action,
      existingId,
      checked: action !== 'skip',
    });
  }

  const order = { update: 0, new: 1, skip: 2 };
  return suggestions.sort((a, b) => order[a.action] - order[b.action] || b.date.localeCompare(a.date));
}

/** Pulls From/Subject/Date headers out of a pasted email, if present. */
export function parsePastedEmail(text: string): EmailInput {
  let from = '';
  let subject = '';
  let date = '';
  for (const line of text.split(/\r?\n/).slice(0, 50)) {
    const m = line.match(/^\s*(from|subject|date|sent)\s*:\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === 'from' && !from) from = m[2].trim();
    else if (key === 'subject' && !subject) subject = m[2].trim();
    else if ((key === 'date' || key === 'sent') && !date) date = m[2].trim();
  }
  return { from, subject, body: text, date };
}
