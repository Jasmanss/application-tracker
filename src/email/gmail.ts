import { readPref, writePref } from '../storage';
import { parseEmail, type EmailInput, type ParsedEmail } from './parse';

/**
 * Read-only Gmail access, entirely in the browser.
 *
 * The user supplies their own OAuth Client ID (see docs/gmail-setup.md);
 * Google Identity Services asks them to sign in, and we search their inbox
 * for application-related emails. Nothing leaves the browser.
 */

const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(override?: { prompt?: string }): void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback?: (error: { type?: string; message?: string }) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let gisLoading: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisLoading = null;
      reject(new Error('Couldn’t load Google sign-in. Check your connection and try again.'));
    };
    document.head.appendChild(script);
  });
  return gisLoading;
}

let cached: { clientId: string; token: string; expiresAt: number } | null = null;

function readStoredToken(clientId: string): void {
  if (cached) return;
  try {
    const raw = readPref('gmailToken');
    if (!raw) return;
    const stored = JSON.parse(raw) as { clientId?: string; token?: string; expiresAt?: number };
    if (stored.clientId === clientId && stored.token && typeof stored.expiresAt === 'number') {
      cached = { clientId, token: stored.token, expiresAt: stored.expiresAt };
    }
  } catch {
    // Ignore a corrupt stored token; we'll just ask Google again.
  }
}

function clearToken(): void {
  cached = null;
  writePref('gmailToken', '');
}

/**
 * Gets a Gmail access token. `interactive: false` only succeeds when Google
 * can re-issue silently (previously granted, still signed in); it never opens
 * a sign-in window.
 */
async function getToken(clientId: string, interactive: boolean): Promise<string> {
  readStoredToken(clientId);
  if (cached && cached.clientId === clientId && Date.now() < cached.expiresAt) return cached.token;
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.access_token) {
          cached = {
            clientId,
            token: response.access_token,
            // Refresh a minute before Google expires it.
            expiresAt: Date.now() + ((response.expires_in ?? 3600) - 60) * 1000,
          };
          writePref('gmailToken', JSON.stringify(cached));
          resolve(response.access_token);
        } else {
          reject(new Error(response.error_description || response.error || 'Google didn’t return access.'));
        }
      },
      error_callback: (error) =>
        reject(
          new Error(
            error?.type === 'popup_closed'
              ? 'The Google sign-in window was closed before finishing.'
              : error?.message || 'Google sign-in failed.',
          ),
        ),
    });
    client.requestAccessToken(interactive ? undefined : { prompt: 'none' });
  });
}

async function gmailGet(token: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    if (response.status === 401) clearToken();
    const body = await response.text();
    if (response.status === 401) throw new Error('Google sign-in expired. Run the scan again to sign back in.');
    if (body.includes('accessNotConfigured') || body.includes('SERVICE_DISABLED'))
      throw new Error('The Gmail API isn’t enabled for your Google Cloud project yet (step 2 of the setup guide).');
    if (response.status === 403)
      throw new Error('Google refused access. Check that your account is added as a test user (step 3 of the setup guide).');
    throw new Error(`Gmail returned an error (${response.status}). Try again in a minute.`);
  }
  return (await response.json()) as Record<string, unknown>;
}

/** Inbox searches that catch confirmations, interviews, offers and rejections. */
const QUERIES = [
  // Confirmation-style subjects from anyone.
  'subject:("your application" OR "thank you for applying" OR "thanks for applying" OR "application received" OR "we received your application" OR "application was sent" OR "you applied" OR "application confirmation")',
  // Anything from the big job platforms and applicant tracking systems.
  'from:(linkedin.com OR indeed.com OR greenhouse.io OR lever.co OR ashbyhq.com OR myworkday.com OR myworkdayjobs.com OR icims.com OR smartrecruiters.com OR jobvite.com OR workable.com OR workablemail.com OR recruitee.com OR breezy.hr OR wellfound.com OR ziprecruiter.com OR bamboohr.com OR successfactors.com) ("application" OR "applied" OR "interview" OR "offer" OR "unfortunately")',
  // Interview scheduling and rejections that skip the words above.
  '("your application" OR "your candidacy") ("interview" OR "unfortunately" OR "next steps" OR "move forward")',
];

function decodeEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent ?? text;
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, head').forEach((el) => el.remove());
  return doc.body?.textContent ?? '';
}

function b64urlToText(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return '';
  }
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MessagePart[];
}

/** Walks a MIME tree and returns the message text, plain part preferred. */
function extractBodyText(payload: MessagePart | undefined): string {
  let plain = '';
  let html = '';
  const walk = (part: MessagePart | undefined) => {
    if (!part) return;
    if (part.body?.data) {
      if (part.mimeType?.startsWith('text/plain') && !plain) plain = b64urlToText(part.body.data);
      else if (part.mimeType?.startsWith('text/html') && !html) html = b64urlToText(part.body.data);
    }
    part.parts?.forEach(walk);
  };
  walk(payload);
  return (plain || htmlToText(html)).slice(0, 30000);
}

export interface ScanProgress {
  step: string;
}

/**
 * Searches the inbox and returns candidate emails (headers + snippet only).
 * Only emails dated on or after `sinceISO` (yyyy-mm-dd) are searched.
 */
export async function fetchApplicationEmails(
  clientId: string,
  sinceISO: string,
  onProgress: (progress: ScanProgress) => void,
  interactive = true,
): Promise<EmailInput[]> {
  onProgress({ step: 'Waiting for Google sign-in…' });
  const token = await getToken(clientId, interactive);

  // Gmail's `after:` takes yyyy/mm/dd and is inclusive of that day.
  const after = ` after:${sinceISO.replaceAll('-', '/')}`;

  onProgress({ step: 'Searching your inbox…' });
  const ids = new Set<string>();
  for (const q of QUERIES) {
    const data = await gmailGet(token, `/messages?maxResults=100&q=${encodeURIComponent(q + after)}`);
    for (const message of (data.messages as { id: string }[] | undefined) ?? []) ids.add(message.id);
  }

  const all = [...ids];
  const emails: EmailInput[] = [];
  for (let i = 0; i < all.length; i += 10) {
    onProgress({ step: `Reading email ${Math.min(i + 10, all.length)} of ${all.length}…` });
    const chunk = await Promise.all(
      all.slice(i, i + 10).map(async (id) => {
        const message = await gmailGet(
          token,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        );
        const payload = message.payload as { headers?: { name: string; value: string }[] } | undefined;
        const header = (name: string) =>
          payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
        return {
          id,
          from: header('From'),
          subject: header('Subject'),
          date: header('Date'),
          body: decodeEntities(String(message.snippet ?? '')),
        };
      }),
    );
    emails.push(...chunk);
  }
  return emails;
}

/**
 * Parses candidate emails into applications. Emails the snippet can't
 * identify get one more chance: the full message body is fetched (footers
 * often carry the only company mention, e.g. "Early talent programs at
 * Lyft"), and the parse is retried on the complete text.
 */
export async function parseCandidates(
  clientId: string,
  emails: EmailInput[],
  sinceISO: string,
  onProgress: (progress: ScanProgress) => void = () => undefined,
): Promise<(ParsedEmail & { id?: string })[]> {
  const parsed: (ParsedEmail & { id?: string })[] = [];
  const unresolved: EmailInput[] = [];

  for (const email of emails) {
    const result = parseEmail(email);
    if (result) {
      if (result.date >= sinceISO) parsed.push({ ...result, id: email.id });
    } else if (email.id) {
      unresolved.push(email);
    }
  }

  if (unresolved.length > 0) {
    const token = await getToken(clientId, false);
    for (let i = 0; i < unresolved.length; i += 5) {
      onProgress({ step: `Reading ${Math.min(i + 5, unresolved.length)} of ${unresolved.length} in full…` });
      const chunk = await Promise.all(
        unresolved.slice(i, i + 5).map(async (email): Promise<(ParsedEmail & { id?: string }) | null> => {
          try {
            const message = await gmailGet(token, `/messages/${email.id}?format=full`);
            const body = extractBodyText(message.payload as MessagePart | undefined);
            const result = body ? parseEmail({ ...email, body: `${email.body}\n${body}` }) : null;
            return result && result.date >= sinceISO ? { ...result, id: email.id } : null;
          } catch {
            return null; // one unreadable email never sinks the scan
          }
        }),
      );
      parsed.push(...chunk.filter((r): r is ParsedEmail & { id?: string } => r !== null));
    }
  }
  return parsed;
}
