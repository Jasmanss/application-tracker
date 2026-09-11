import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { formatDate } from '../dates';
import {
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  STATUS_HINT,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  type Application,
  type Status,
} from '../types';
import { Stamp } from './Stamp';

interface Props {
  apps: Application[];
  today: string;
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status) => void;
  onAdd: (status: Status) => void;
}

export function Board({ apps, today, onOpen, onMove, onAdd }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<Status | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<Status, Application[]>();
    for (const app of apps) map.set(app.status, [...(map.get(app.status) ?? []), app]);
    for (const list of map.values()) {
      list.sort((a, b) => b.priority - a.priority || b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [apps]);

  function endDrag() {
    setDragId(null);
    setOver(null);
  }

  function renderColumn(status: Status, closed = false) {
    const list = grouped.get(status) ?? [];
    return (
      <section
        key={status}
        className={`column${closed ? ' is-closed' : ''}${over === status ? ' is-over' : ''}`}
        data-status={status}
        aria-label={`${STATUS_LABEL[status]}: ${list.length}`}
        onDragOver={(e: DragEvent) => {
          if (!dragId) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          if (over !== status) setOver(status);
        }}
        onDragLeave={(e: DragEvent<HTMLElement>) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setOver((current) => (current === status ? null : current));
          }
        }}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('text/plain') || dragId;
          endDrag();
          if (id) onMove(id, status);
        }}
      >
        <header className="column-head" title={STATUS_HINT[status]}>
          <Stamp status={status} />
          <span className="column-count">{list.length}</span>
        </header>
        <div className="column-cards">
          {list.map((app) => (
            <Card
              key={app.id}
              app={app}
              today={today}
              dragging={dragId === app.id}
              onOpen={onOpen}
              onDragStart={setDragId}
              onDragEnd={endDrag}
            />
          ))}
          {list.length === 0 && <p className="column-empty">{dragId ? 'Drop here' : STATUS_HINT[status]}</p>}
        </div>
        {!closed && (
          <button
            type="button"
            className="column-add"
            onClick={() => onAdd(status)}
            aria-label={`Add application to ${STATUS_LABEL[status]}`}
          >
            + Add
          </button>
        )}
      </section>
    );
  }

  return (
    <div className="board">
      {ACTIVE_STATUSES.map((status) => renderColumn(status))}
      <div className="closed-stack">{CLOSED_STATUSES.map((status) => renderColumn(status, true))}</div>
    </div>
  );
}

interface CardProps {
  app: Application;
  today: string;
  dragging: boolean;
  onOpen: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
}

function Card({ app, today, dragging, onOpen, onDragStart, onDragEnd }: CardProps) {
  const closed = CLOSED_STATUSES.includes(app.status);
  const followUpDue = !closed && !!app.followUpDate && app.followUpDate <= today;
  const meta = [app.location, app.workMode && WORK_MODE_LABEL[app.workMode]].filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      className={`card${dragging ? ' is-dragging' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', app.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart(app.id);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(app.id)}
      onKeyDown={(e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(app.id);
        }
      }}
    >
      <span className="card-top">
        <span className="card-company">{app.company}</span>
        {app.priority === 3 && <span className="card-priority">High</span>}
      </span>
      <span className="card-role">{app.role}</span>
      {meta && <span className="card-meta">{meta}</span>}
      <span className="card-foot">
        <span className="mono">
          {app.dateApplied ? `Applied ${formatDate(app.dateApplied)}` : `Saved ${formatDate(app.createdAt.slice(0, 10))}`}
        </span>
        {followUpDue && <span className="card-due">Follow up</span>}
      </span>
    </div>
  );
}
