import { addDays, isISODate, todayISO } from '../dates';
import { readPref, writePref } from '../storage';
import type { Application } from '../types';
import { applySuggestions, type ApplyResult } from './apply';
import { fetchApplicationEmails, parseCandidates } from './gmail';
import { PARSER_VERSION, reconcile, type Suggestion } from './parse';

const SEEN_CAP = 3000;

export function autoSyncEnabled(): boolean {
  return !!readPref('gmailClientId') && readPref('gmailAutoSync') !== 'off';
}

function readSeen(): Set<string> {
  try {
    const raw = readPref('gmailSeenIds');
    const data: unknown = raw ? JSON.parse(raw) : null;
    // Versioned store: when the parser improves, forget what was "seen" and
    // rewind the cursor so previously missed emails get re-read. Anything
    // already imported just reconciles as a duplicate.
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const stored = data as { v?: number; ids?: string[] };
      if (stored.v === PARSER_VERSION) return new Set(stored.ids ?? []);
    }
    writePref('gmailAutoCursor', '');
    return new Set();
  } catch {
    return new Set();
  }
}

/** Remembers processed Gmail message ids so nothing is applied twice. */
export function markSeen(ids: string[]): void {
  if (ids.length === 0) return;
  const seen = readSeen();
  for (const id of ids) seen.add(id);
  writePref('gmailSeenIds', JSON.stringify({ v: PARSER_VERSION, ids: [...seen].slice(-SEEN_CAP) }));
}

function sinceDate(): string {
  const cursor = readPref('gmailAutoCursor');
  if (cursor && isISODate(cursor)) return cursor;
  const picked = readPref('gmailScanSince');
  if (picked && isISODate(picked)) return picked;
  return addDays(todayISO(), -90);
}

export interface AutoSyncOutcome extends ApplyResult {
  /** True when Google needs the user to click through sign-in again. */
  needsSignIn: boolean;
}

/**
 * One background sync pass: silent token, search since the cursor, apply
 * anything new, remember what was processed. Never opens a sign-in window.
 */
let inFlight = false;

export async function runAutoSync(apps: Application[]): Promise<AutoSyncOutcome> {
  if (inFlight) return { apps, added: 0, updated: 0, needsSignIn: false };
  inFlight = true;
  try {
    return await syncOnce(apps);
  } finally {
    inFlight = false;
  }
}

async function syncOnce(apps: Application[]): Promise<AutoSyncOutcome> {
  const clientId = readPref('gmailClientId')!;
  const today = todayISO();
  // Read the seen-set first: a parser upgrade resets it and rewinds the
  // cursor, and that wider range must apply to THIS pass.
  const seen = readSeen();
  const since = sinceDate();

  let emails;
  try {
    emails = await fetchApplicationEmails(clientId, since, () => undefined, false);
  } catch {
    // Silent sign-in wasn't possible (signed out, consent expired, blocked).
    return { apps, added: 0, updated: 0, needsSignIn: true };
  }

  const fresh = emails.filter((e) => e.id && !seen.has(e.id));
  const { parsed } = await parseCandidates(clientId, fresh, since);
  const suggestions: Suggestion[] = reconcile(parsed, apps).filter((s) => s.action !== 'skip');

  const result = applySuggestions(apps, suggestions, today);
  markSeen(emails.flatMap((e) => (e.id ? [e.id] : [])));
  // Next pass only needs recent mail; a 3-day overlap absorbs slow inboxes.
  writePref('gmailAutoCursor', addDays(today, -3));

  return { ...result, needsSignIn: false };
}
