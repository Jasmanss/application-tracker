import { useMemo, useState } from 'react';
import { formatDate } from '../dates';
import {
  CLOSED_STATUSES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  safeUrl,
  type Application,
  type Status,
} from '../types';
import { Stamp } from './Stamp';

type SortKey = 'company' | 'role' | 'status' | 'dateApplied' | 'followUpDate' | 'location' | 'source' | 'priority';
type Filter = 'all' | 'open' | Status;

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'company', label: 'Company' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'dateApplied', label: 'Applied' },
  { key: 'followUpDate', label: 'Follow up' },
  { key: 'location', label: 'Location' },
  { key: 'source', label: 'Source' },
  { key: 'priority', label: 'Priority' },
];

interface Props {
  apps: Application[];
  today: string;
  onOpen: (id: string) => void;
}

export function TableView({ apps, today, onOpen }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'dateApplied', dir: -1 });
  const [filter, setFilter] = useState<Filter>('all');

  const rows = useMemo(() => {
    const visible = apps.filter((a) =>
      filter === 'all' ? true : filter === 'open' ? !CLOSED_STATUSES.includes(a.status) : a.status === filter,
    );
    const value = (a: Application): string | number => {
      if (sort.key === 'status') return STATUSES.indexOf(a.status);
      if (sort.key === 'priority') return a.priority;
      return a[sort.key].toLowerCase();
    };
    return [...visible].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Blank values always sink to the bottom, whichever direction.
      if (va === '' || vb === '') return va === vb ? 0 : va === '' ? 1 : -1;
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [apps, filter, sort]);

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'priority' || key.startsWith('date') ? -1 : 1 }));
  }

  const count = (status: Status) => apps.filter((a) => a.status === status).length;
  const openCount = apps.filter((a) => !CLOSED_STATUSES.includes(a.status)).length;

  return (
    <section className="table-view" aria-label="Applications table">
      <div className="chips" role="group" aria-label="Filter by status">
        <button type="button" className="chip" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
          All <b>{apps.length}</b>
        </button>
        <button type="button" className="chip" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>
          Open <b>{openCount}</b>
        </button>
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="chip"
            data-status={status}
            aria-pressed={filter === status}
            onClick={() => setFilter(status)}
          >
            <i />
            {STATUS_LABEL[status]} <b>{count(status)}</b>
          </button>
        ))}
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(({ key, label }) => (
                <th key={key} aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" onClick={() => toggleSort(key)}>
                    {label}
                    <span className="sort-arrow" aria-hidden="true">
                      {sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}
                    </span>
                  </button>
                </th>
              ))}
              <th>
                <span className="th-plain">Posting</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((app) => {
              const href = safeUrl(app.url);
              const overdue =
                !!app.followUpDate && app.followUpDate <= today && !CLOSED_STATUSES.includes(app.status);
              return (
                <tr key={app.id} onClick={() => onOpen(app.id)}>
                  <td>
                    <button type="button" className="row-link" onClick={(e) => { e.stopPropagation(); onOpen(app.id); }}>
                      {app.company}
                    </button>
                  </td>
                  <td>{app.role}</td>
                  <td>
                    <Stamp status={app.status} size="sm" />
                  </td>
                  <td className="mono">{formatDate(app.dateApplied) || '—'}</td>
                  <td className={`mono${overdue ? ' is-overdue' : ''}`}>{formatDate(app.followUpDate) || '—'}</td>
                  <td>
                    {[app.location, app.workMode && WORK_MODE_LABEL[app.workMode]].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>{app.source || '—'}</td>
                  <td className={app.priority === 3 ? 'is-high' : undefined}>{PRIORITY_LABEL[app.priority]}</td>
                  <td>
                    {href ? (
                      <a className="posting-link" href={href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        Open ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="table-empty">No applications with this status.</p>}
      </div>
    </section>
  );
}
