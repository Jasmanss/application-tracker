import type { Stats } from '../stats';
import { STATUSES, STATUS_LABEL, type Application } from '../types';

interface Props {
  apps: Application[];
  stats: Stats;
}

export function Summary({ apps, stats }: Props) {
  const counts = STATUSES.map((status) => ({ status, count: apps.filter((a) => a.status === status).length }));
  const rate = stats.responseRate === null ? '—' : `${Math.round(stats.responseRate * 100)}%`;

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
