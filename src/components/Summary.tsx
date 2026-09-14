import { useRef, useState } from 'react';
import type { Stats } from '../stats';
import { STATUSES, STATUS_LABEL, type Application } from '../types';

interface Props {
  apps: Application[];
  stats: Stats;
  /** Daily applications goal; 0 means no goal set. */
  target: number;
  onTargetChange: (target: number) => void;
}

export function Summary({ apps, stats, target, onTargetChange }: Props) {
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const counts = STATUSES.map((status) => ({ status, count: apps.filter((a) => a.status === status).length }));
  const rate = stats.responseRate === null ? '—' : `${Math.round(stats.responseRate * 100)}%`;
  const hit = target > 0 && stats.sentToday >= target;
  const remaining = Math.max(0, target - stats.sentToday);

  function commitTarget() {
    const value = Math.max(0, Math.min(99, Number(editRef.current?.value ?? 0) || 0));
    onTargetChange(value);
    setEditing(false);
  }

  return (
    <section className="summary" aria-label="Summary">
      <dl className="ledger">
        <div className="figure">
          <dt>sent</dt>
          <dd>{stats.sent}</dd>
        </div>
        <div className="figure">
          <dt>heard back</dt>
          <dd>{rate}</dd>
        </div>
        <div className="figure">
          <dt>reached interviews</dt>
          <dd>{stats.interviews}</dd>
        </div>
        <div className="figure">
          <dt>{stats.offers === 1 ? 'offer' : 'offers'}</dt>
          <dd>{stats.offers}</dd>
        </div>
        <div className="figure">
          <dt>sent this week</dt>
          <dd>{stats.sentThisWeek}</dd>
        </div>

        <div className={`figure goal${hit ? ' is-hit' : ''}`}>
          {target > 0 ? (
            <>
              <dd>
                {editing ? (
                  <input
                    ref={editRef}
                    className="goal-input"
                    type="number"
                    min={0}
                    max={99}
                    defaultValue={target}
                    autoFocus
                    onFocus={(e) => e.target.select()}
                    onBlur={commitTarget}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitTarget();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    aria-label="Daily application target"
                  />
                ) : (
                  <button
                    type="button"
                    className="goal-number"
                    title="Change your daily target"
                    onClick={() => setEditing(true)}
                  >
                    {stats.sentToday}
                    <span className="goal-of">/{target}</span>
                  </button>
                )}
              </dd>
              <dt>
                sent today
                <span className="goal-bar" aria-hidden="true">
                  <i style={{ transform: `scaleX(${Math.min(1, target ? stats.sentToday / target : 0)})` }} />
                </span>
                <span className="goal-note">{hit ? 'Target hit' : `${remaining} to go`}</span>
              </dt>
            </>
          ) : (
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                onTargetChange(10);
                setEditing(true);
              }}
            >
              Set a daily target
            </button>
          )}
        </div>
      </dl>

      <div
        className="pipeline"
        role="img"
        aria-label={counts.map(({ status, count }) => `${STATUS_LABEL[status]} ${count}`).join(', ')}
      >
        {counts
          .filter(({ count }) => count > 0)
          .map(({ status, count }) => (
            <span key={status} className="pipeline-seg" data-status={status} style={{ flexGrow: count }} />
          ))}
      </div>
      <ul className="pipeline-legend" aria-hidden="true">
        {counts.map(({ status, count }) => (
          <li key={status} data-status={status} className={count === 0 ? 'is-zero' : undefined}>
            <i />
            {STATUS_LABEL[status]}
            <b>{count}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
