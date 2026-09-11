import { useEffect, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react';
import { addDays, formatDate, toISODate } from '../dates';
import {
  PRIORITY_LABEL,
  STATUSES,
  STATUS_HINT,
  STATUS_LABEL,
  WORK_MODE_LABEL,
  emptyDraft,
  safeUrl,
  toDraft,
  type Application,
  type Draft,
  type Priority,
  type Status,
  type WorkMode,
} from '../types';
import { Stamp } from './Stamp';

interface Props {
  app: Application | null;
  initialStatus: Status;
  today: string;
  onSave: (draft: Draft) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
}

const SOURCES = ['LinkedIn', 'Indeed', 'Company site', 'Referral', 'Recruiter reached out', 'Job board', 'Career fair'];

export function Drawer({ app, initialStatus, today, onSave, onClose, onDelete }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const [initial] = useState<Draft>(() => (app ? toDraft(app) : emptyDraft(initialStatus)));
  const [draft, setDraft] = useState<Draft>(initial);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const errors = {
    company: draft.company.trim() ? '' : 'Add the company name',
    role: draft.role.trim() ? '' : 'Add the role you applied for',
  };
  const href = safeUrl(draft.url);

  function confirmDiscard() {
    return !dirty || window.confirm('Discard your changes to this application?');
  }

  function requestClose() {
    if (confirmDiscard()) dialog.current?.close();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (errors.company || errors.role) {
      setShowErrors(true);
      dialog.current?.querySelector<HTMLInputElement>(errors.company ? '#f-company' : '#f-role')?.focus();
      return;
    }
    onSave({ ...draft, company: draft.company.trim(), role: draft.role.trim() });
    dialog.current?.close();
  }

  function onBackdrop(e: MouseEvent<HTMLDialogElement>) {
    if (e.type === 'mousedown') pressedBackdrop.current = e.target === dialog.current;
    else if (pressedBackdrop.current && e.target === dialog.current) requestClose();
  }

  return (
    <dialog
      ref={dialog}
      className="drawer"
      aria-labelledby="drawer-title"
      onClose={onClose}
      onCancel={(e) => {
        if (!confirmDiscard()) e.preventDefault();
      }}
      onMouseDown={onBackdrop}
      onClick={onBackdrop}
    >
      <form className="drawer-form" onSubmit={submit} noValidate>
        <header className="drawer-head">
          <div className="drawer-title">
            <p className="eyebrow">{app ? 'Application' : 'New application'}</p>
            <h2 id="drawer-title">{draft.company.trim() || 'Untitled company'}</h2>
            <p className="drawer-role">{draft.role.trim() || 'Role not set'}</p>
          </div>
          <Stamp key={draft.status} status={draft.status} size="lg" animate />
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="drawer-body">
          <fieldset>
            <legend>The job</legend>
            <div className="grid-2">
              <Field id="f-company" label="Company" error={showErrors ? errors.company : ''}>
                <input
                  id="f-company"
                  value={draft.company}
                  onChange={(e) => set('company', e.target.value)}
                  aria-invalid={showErrors && !!errors.company}
                  autoFocus={!app}
                  autoComplete="off"
                />
              </Field>
              <Field id="f-role" label="Role" error={showErrors ? errors.role : ''}>
                <input
                  id="f-role"
                  value={draft.role}
                  onChange={(e) => set('role', e.target.value)}
                  aria-invalid={showErrors && !!errors.role}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field
              id="f-url"
              label="Job posting link"
              aside={href ? <a href={href} target="_blank" rel="noreferrer">Open ↗</a> : null}
            >
              <input
                id="f-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={draft.url}
                onChange={(e) => set('url', e.target.value)}
              />
            </Field>
            <div className="grid-2">
              <Field id="f-location" label="Location">
                <input id="f-location" value={draft.location} onChange={(e) => set('location', e.target.value)} />
              </Field>
              <Field id="f-mode" label="Work mode">
                <select id="f-mode" value={draft.workMode} onChange={(e) => set('workMode', e.target.value as WorkMode)}>
                  <option value="">Not sure</option>
                  {Object.entries(WORK_MODE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="f-salary" label="Salary">
                <input id="f-salary" placeholder="e.g. $80k–$95k" value={draft.salary} onChange={(e) => set('salary', e.target.value)} />
              </Field>
              <Field id="f-source" label="Where you found it">
                <input id="f-source" list="sources" value={draft.source} onChange={(e) => set('source', e.target.value)} />
                <datalist id="sources">
                  {SOURCES.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Progress</legend>
            <Field id="f-status" label="Status" hint={STATUS_HINT[draft.status]}>
              <select id="f-status" value={draft.status} onChange={(e) => set('status', e.target.value as Status)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid-2">
              <Field id="f-applied" label="Date applied" aside={!draft.dateApplied ? <button type="button" className="link-btn" onClick={() => set('dateApplied', today)}>Today</button> : null}>
                <input id="f-applied" type="date" value={draft.dateApplied} max={today} onChange={(e) => set('dateApplied', e.target.value)} />
              </Field>
              <Field id="f-follow" label="Follow up on">
                <input id="f-follow" type="date" value={draft.followUpDate} onChange={(e) => set('followUpDate', e.target.value)} />
              </Field>
            </div>
            <div className="quick-dates" aria-label="Set follow-up date">
              {[
                ['In 1 week', 7],
                ['In 2 weeks', 14],
              ].map(([label, days]) => (
                <button key={label} type="button" className="btn small" onClick={() => set('followUpDate', addDays(today, Number(days)))}>
                  {label}
                </button>
              ))}
              {draft.followUpDate && (
                <button type="button" className="btn small ghost" onClick={() => set('followUpDate', '')}>
                  Clear reminder
                </button>
              )}
            </div>
            <div className="field">
              <span className="field-label" id="priority-label">
                Priority
              </span>
              <div className="segmented" role="radiogroup" aria-labelledby="priority-label">
                {([1, 2, 3] as Priority[]).map((p) => (
                  <label key={p} className="segmented-option">
                    <input type="radio" name="priority" checked={draft.priority === p} onChange={() => set('priority', p)} />
                    <span>{PRIORITY_LABEL[p]}</span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>People and materials</legend>
            <div className="grid-2">
              <Field id="f-contact" label="Contact">
                <input id="f-contact" placeholder="Recruiter or referrer" value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />
              </Field>
              <Field id="f-email" label="Contact email">
                <input id="f-email" type="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
              </Field>
            </div>
            <Field id="f-resume" label="Resume version sent">
              <input id="f-resume" placeholder="e.g. Data analyst v2" value={draft.resumeVersion} onChange={(e) => set('resumeVersion', e.target.value)} />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Notes</legend>
            <Field id="f-notes" label="Notes" hideLabel>
              <textarea
                id="f-notes"
                rows={5}
                placeholder="Interview questions, who you spoke to, what to prepare…"
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </Field>
          </fieldset>

          {app && app.history.length > 0 && (
            <section className="timeline" aria-labelledby="history-title">
              <h3 id="history-title">History</h3>
              <ol>
                {[...app.history].reverse().map((h, i) => (
                  <li key={`${h.at}-${i}`} data-status={h.status}>
                    <span className="timeline-status">{STATUS_LABEL[h.status]}</span>
                    <span className="mono">{formatDate(toISODate(new Date(h.at)))}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <footer className="drawer-foot">
          {app && (
            <button type="button" className="btn danger" onClick={() => onDelete(app.id)}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={requestClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            {app ? 'Save changes' : 'Add application'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

interface FieldProps {
  id: string;
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  aside?: ReactNode;
  hideLabel?: boolean;
}

function Field({ id, label, children, error, hint, aside, hideLabel }: FieldProps) {
  return (
    <div className="field">
      <div className={`field-top${hideLabel ? ' visually-hidden' : ''}`}>
        <label htmlFor={id} className="field-label">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}
