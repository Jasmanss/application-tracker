import { newId } from '../storage';
import { emptyDraft, impliesApplied, withStatus, type Application } from '../types';
import type { Suggestion } from './parse';

export interface ApplyResult {
  apps: Application[];
  added: number;
  updated: number;
}

/** Applies email suggestions to the list: new cards and status moves. */
export function applySuggestions(apps: Application[], suggestions: Suggestion[], today: string): ApplyResult {
  const now = new Date().toISOString();
  let next = [...apps];
  let added = 0;
  let updated = 0;

  for (const s of suggestions) {
    if (s.action === 'update' && s.existingId) {
      next = next.map((a) => (a.id === s.existingId ? withStatus(a, s.status, now, today) : a));
      updated++;
    } else if (s.action === 'new') {
      added++;
      next = [
        {
          ...emptyDraft(s.status),
          company: s.company,
          role: s.role || 'Untitled role',
          source: s.source,
          notes: [`From email — ${s.gist}.`, s.evidence && `“${s.evidence}”`].filter(Boolean).join('\n'),
          dateApplied: impliesApplied(s.status) ? s.date : '',
          id: newId(),
          history: [{ status: s.status, at: new Date(`${s.date}T12:00:00`).toISOString() }],
          createdAt: now,
          updatedAt: now,
        },
        ...next,
      ];
    }
  }
  return { apps: next, added, updated };
}
