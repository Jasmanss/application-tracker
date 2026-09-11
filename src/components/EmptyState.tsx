import { Stamp } from './Stamp';

interface Props {
  onAdd: () => void;
  onImport: () => void;
  onSample: () => void;
}

export function EmptyState({ onAdd, onImport, onSample }: Props) {
  return (
    <section className="empty">
      <div className="empty-stamps" aria-hidden="true">
        <Stamp status="applied" size="lg" />
        <Stamp status="interviewing" size="lg" />
        <Stamp status="offer" size="lg" />
      </div>
      <h1>Every application, from sent to signed.</h1>
      <p>
        Add the jobs you've applied to, or the ones you plan to. Drag them across stages as you hear back, and the
        tracker flags anything that's waiting on a follow-up.
      </p>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={onAdd}>
          Add your first application
        </button>
        <button type="button" className="btn" onClick={onImport}>
          Import CSV or JSON
        </button>
        <button type="button" className="link-btn" onClick={onSample}>
          Try it with sample data
        </button>
      </div>
      <p className="fine-print">
        Everything is saved in this browser only. Use <b>Data → Export JSON backup</b> to keep a copy or move to another
        device.
      </p>
    </section>
  );
}
