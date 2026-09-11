import { daysBetween, formatDate, plural } from './dates';
import { CLOSED_STATUSES, type Application, type Status } from './types';

/** Days an application can sit in "Applied" before it's flagged. */
export const STALE_AFTER_DAYS = 14;

function reached(app: Application, targets: Status[]): boolean {
  return targets.includes(app.status) || app.history.some((h) => targets.includes(h.status));
}

export interface Stats {
  sent: number;
  interviews: number;
  offers: number;
  sentThisWeek: number;
  /** Share of sent applications that got any answer (including rejections). */
  responseRate: number | null;
}

export function computeStats(apps: Application[], today: string): Stats {
  const sent = apps.filter(
    (a) => !!a.dateApplied || reached(a, ['applied', 'screening', 'interviewing', 'offer', 'rejected', 'ghosted']),
  );
  const responded = sent.filter((a) => reached(a, ['screening', 'interviewing', 'offer', 'rejected'])).length;

  return {
    sent: sent.length,
    interviews: sent.filter((a) => reached(a, ['interviewing', 'offer'])).length,
    offers: sent.filter((a) => reached(a, ['offer'])).length,
    sentThisWeek: sent.filter((a) => {
      if (!a.dateApplied) return false;
      const age = daysBetween(a.dateApplied, today);
      return age >= 0 && age < 7;
    }).length,
    responseRate: sent.length ? responded / sent.length : null,
  };
}

export interface AttentionItem {
  app: Application;
  kind: 'due' | 'stale';
  reason: string;
  urgency: number;
}

export function needsAttention(apps: Application[], today: string): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const app of apps) {
    if (CLOSED_STATUSES.includes(app.status)) continue;

    if (app.followUpDate) {
      const late = daysBetween(app.followUpDate, today);
      if (late < 0) continue;
      const noun = app.status === 'wishlist' ? 'Reminder' : 'Follow-up';
      items.push({
        app,
        kind: 'due',
        urgency: late + 1,
        reason:
          late === 0
            ? `${noun} due today`
            : `${noun} was due ${formatDate(app.followUpDate)}, ${plural(late, 'day')} ago`,
      });
    } else if (app.status === 'applied' && app.dateApplied) {
      const waited = daysBetween(app.dateApplied, today);
      if (waited >= STALE_AFTER_DAYS) {
        items.push({ app, kind: 'stale', urgency: waited - STALE_AFTER_DAYS, reason: `No reply ${waited} days after applying` });
      }
    }
  }

  return items.sort((a, b) => b.urgency - a.urgency);
}
