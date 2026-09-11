import { useState } from 'react';
import type { AttentionItem } from '../stats';
import { Stamp } from './Stamp';

interface Props {
  items: AttentionItem[];
  onOpen: (id: string) => void;
  onSnooze: (id: string, days: number) => void;
  onGhost: (id: string) => void;
}

const COLLAPSED_COUNT = 4;

export function Attention({ items, onOpen, onSnooze, onGhost }: Props) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <section className="attention" aria-labelledby="attention-title">
      <header className="attention-head">
        <h2 id="attention-title">Needs a follow-up</h2>
        <span className="count-badge">{items.length}</span>
      </header>
      <ul>
        {shown.map(({ app, kind, reason, urgency }) => (
          <li key={app.id} className={`attention-item${kind === 'due' && urgency > 1 ? ' is-overdue' : ''}`}>
            <button type="button" className="attention-main" onClick={() => onOpen(app.id)}>
              <span className="attention-company">{app.company}</span>
              <span className="attention-role">{app.role}</span>
            </button>
            <Stamp status={app.status} size="sm" />
            <span className="attention-reason">{reason}</span>
            <span className="attention-actions">
              <button type="button" className="btn small" onClick={() => onSnooze(app.id, 7)}>
                Remind me in a week
              </button>
              {kind === 'stale' && (
                <button type="button" className="btn small ghost" onClick={() => onGhost(app.id)}>
                  Mark ghosted
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {items.length > COLLAPSED_COUNT && (
        <button type="button" className="link-btn attention-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
