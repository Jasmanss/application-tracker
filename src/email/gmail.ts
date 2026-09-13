import type { EmailInput } from './parse';

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
  requestAccessToken(): void;
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

async function getToken(clientId: string): Promise<string> {
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
    client.requestAccessToken();
  });
}

async function gmailGet(token: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    cached = response.status === 401 ? null : cached;
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
  'subject:("your application" OR "thank you for applying" OR "thanks for applying" OR "application received" OR "we received your application" OR "application was sent" OR "you applied" OR "application confirmation") newer_than:365d',
  // Anything from the big job platforms and applicant tracking systems.
  'from:(linkedin.com OR indeed.com OR greenhouse.io OR lever.co OR ashbyhq.com OR myworkday.com OR myworkdayjobs.com OR icims.com OR smartrecruiters.com OR jobvite.com OR workable.com OR workablemail.com OR recruitee.com OR breezy.hr OR wellfound.com OR ziprecruiter.com OR bamboohr.com OR successfactors.com) ("application" OR "applied" OR "interview" OR "offer" OR "unfortunately") newer_than:365d',
  // Interview scheduling and rejections that skip the words above.
  '("your application" OR "your candidacy") ("interview" OR "unfortunately" OR "next steps" OR "move forward") newer_than:365d',
];

function decodeEntities(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent ?? text;
}

export interface ScanProgress {
  step: string;
}

/** Searches the inbox and returns candidate emails (headers + snippet only). */
export async function fetchApplicationEmails(
  clientId: string,
  onProgress: (progress: ScanProgress) => void,
): Promise<EmailInput[]> {
  onProgress({ step: 'Waiting for Google sign-in…' });
  const token = await getToken(clientId);

  onProgress({ step: 'Searching your inbox…' });
  const ids = new Set<string>();
  for (const q of QUERIES) {
    const data = await gmailGet(token, `/messages?maxResults=100&q=${encodeURIComponent(q)}`);
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
