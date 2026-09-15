import Anthropic from '@anthropic-ai/sdk';
import { isISODate, parseLooseDate, todayISO } from '../dates';
import type { Status } from '../types';
import { gistFor, type EmailInput, type ParsedEmail } from './parse';

/**
 * Optional AI tier: emails the pattern parser can't read are sent to a
 * small Claude model under the USER'S OWN API key (stored in their
 * browser). Costs fractions of a cent per email; only runs when a key
 * is saved, and only on unrecognized emails.
 */

const MODEL = 'claude-haiku-4-5';
const BATCH = 5;

const AI_STATUSES = ['applied', 'screening', 'interviewing', 'offer', 'rejected'] as const;

const INSTRUCTIONS = `You extract job-application data from emails a job seeker received.
For each email below, output ONE object. Respond with ONLY a JSON array, no prose, in the same order as the emails:
[{"i": <email index>, "is_job_application_email": true|false, "company": "employer name or null", "role": "job title or null", "status": "applied|screening|interviewing|offer|rejected or null", "applied_date": "yyyy-mm-dd or null"}]
Rules:
- "company" is the hiring employer, never a job board or applicant tracking system (LinkedIn, Indeed, Greenhouse, Lever, Workday, iCIMS...).
- "status": applied = confirmation that an application was received; screening = recruiter call or assessment request; interviewing = interview invitation or scheduling; offer = a job offer; rejected = the candidacy is over.
- "is_job_application_email" is false for job alerts, newsletters, receipts, and anything not about an application this person submitted.`;

/** Pure mapping from the model's JSON reply to parsed emails (unit-tested). */
export function mapAiResults(raw: string, emails: EmailInput[]): (ParsedEmail & { id?: string })[] {
  let entries: unknown;
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    entries = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  const out: (ParsedEmail & { id?: string })[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const email = emails[Number(e.i)];
    if (!email || e.is_job_application_email !== true) continue;
    const company = typeof e.company === 'string' ? e.company.trim() : '';
    if (!company || company.length > 60) continue;
    const status: Status = AI_STATUSES.includes(e.status as (typeof AI_STATUSES)[number])
      ? (e.status as Status)
      : 'applied';
    const date =
      typeof e.applied_date === 'string' && isISODate(e.applied_date)
        ? e.applied_date
        : parseLooseDate(email.date) || todayISO();
    out.push({
      company,
      role: typeof e.role === 'string' ? e.role.trim().slice(0, 70) : '',
      status,
      date,
      source: 'Email',
      evidence: email.subject || email.body.slice(0, 90),
      gist: gistFor(status, `${email.subject}\n${email.body}`),
      id: email.id,
    });
  }
  return out;
}

function emailBlock(email: EmailInput, i: number): string {
  return [
    `EMAIL ${i}`,
    `From: ${email.from}`,
    email.replyTo ? `Reply-To: ${email.replyTo}` : '',
    `Date: ${email.date}`,
    `Subject: ${email.subject}`,
    `Body: ${email.body.replace(/\s+/g, ' ').slice(0, 6000)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Reads unrecognized emails with Claude. Throws a friendly error when the
 * key is rejected; any other failure returns what succeeded so far.
 */
export async function extractWithAI(
  apiKey: string,
  emails: EmailInput[],
): Promise<(ParsedEmail & { id?: string })[]> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const out: (ParsedEmail & { id?: string })[] = [];

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1000,
        system: INSTRUCTIONS,
        messages: [{ role: 'user', content: batch.map((e, j) => emailBlock(e, j)).join('\n\n---\n\n') }],
      });
      const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      out.push(...mapAiResults(text, batch));
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) {
        throw new Error('Your Anthropic API key was rejected — check it under Data → Add from email.');
      }
      // Rate limits, quota, network: keep whatever already worked.
      return out;
    }
  }
  return out;
}
