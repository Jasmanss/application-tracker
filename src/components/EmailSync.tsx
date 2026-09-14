import { useEffect, useRef, useState } from 'react';
import { addDays, formatDate, isISODate, todayISO } from '../dates';
import { fetchApplicationEmails, parseCandidates } from '../email/gmail';
import { parseEmail, parsePastedEmail, reconcile, type Suggestion } from '../email/parse';
import { readPref, writePref } from '../storage';
import type { Application } from '../types';
import { Stamp } from './Stamp';

const SETUP_GUIDE_URL = 'https://github.com/Jasmanss/callback/blob/main/docs/gmail-setup.md';

interface Props {
  apps: Application[];
  onImport: (suggestions: Suggestion[]) => void;
  onClose: () => void;
}

type Tab = 'gmail' | 'paste';

export function EmailSync({ apps, onImport, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('gmail');
  const [clientId, setClientId] = useState(() => readPref('gmailClientId') ?? '');
  const [idInput, setIdInput] = useState(clientId);
  const [since, setSince] = useState(() => {
    const saved = readPref('gmailScanSince');
    return saved && isISODate(saved) ? saved : addDays(todayISO(), -90);
  });
  const [autoSync, setAutoSync] = useState(() => readPref('gmailAutoSync') !== 'off');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [pasted, setPasted] = useState('');

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
  }, []);

  function switchTab(next: Tab) {
    setTab(next);
    setSuggestions(null);
    setError('');
  }

  function saveClientId() {
    const id = idInput.trim();
    writePref('gmailClientId', id);
    setClientId(id);
    setError('');
  }

  async function scan() {
    setBusy(true);
    setError('');
    setSuggestions(null);
    try {
      const emails = await fetchApplicationEmails(clientId, since, (p) => setProgress(p.step));
      const parsed = await parseCandidates(clientId, emails, since, (p) => setProgress(p.step));
      setSuggestions(reconcile(parsed, apps));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The scan failed. Try again in a minute.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function readPasted() {
    setError('');
    const parsed = parseEmail(parsePastedEmail(pasted));
    if (!parsed) {
      setSuggestions(null);
      setError(
        'Couldn’t find application details in that text. Paste the whole email, including its subject line if you can.',
      );
      return;
    }
    setSuggestions(reconcile([parsed], apps));
  }

  function toggle(key: string) {
    setSuggestions((current) => current!.map((s) => (s.key === key ? { ...s, checked: !s.checked } : s)));
  }

  const chosen = suggestions?.filter((s) => s.checked && s.action !== 'skip') ?? [];
  const actionable = suggestions?.filter((s) => s.action !== 'skip') ?? [];
  const skipped = (suggestions?.length ?? 0) - actionable.length;
  const newCount = chosen.filter((s) => s.action === 'new').length;
  const updateCount = chosen.length - newCount;

  function importChosen() {
    onImport(chosen);
    dialog.current?.close();
  }

  return (
    <dialog ref={dialog} className="modal" aria-labelledby="email-sync-title" onClose={onClose}>
      <header className="modal-head">
        <h2 id="email-sync-title">Add from email</h2>
        <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="Close">
          ×
        </button>
      </header>

      <div className="modal-body">
        <div className="segmented" role="group" aria-label="How to read email">
          <button type="button" aria-pressed={tab === 'gmail'} onClick={() => switchTab('gmail')}>
            Scan Gmail
          </button>
          <button type="button" aria-pressed={tab === 'paste'} onClick={() => switchTab('paste')}>
            Paste an email
          </button>
        </div>

        {tab === 'gmail' && (
          <>
            <p className="modal-note">
              Signs in to Google read-only and looks for confirmations, interview invites, offers and rejections from
              the past year. Emails are read in this browser only — nothing is uploaded anywhere.
            </p>

            {!clientId ? (
              <div className="setup-box">
                <p>
                  One-time setup: Gmail access needs your own free Google “Client ID” (about 10 minutes to create).{' '}
                  <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">
                    Follow the step-by-step guide ↗
                  </a>
                  , then paste the ID here.
                </p>
                <div className="setup-row">
                  <label className="visually-hidden" htmlFor="client-id">
                    Google OAuth Client ID
                  </label>
                  <input
                    id="client-id"
                    placeholder="1234…abcd.apps.googleusercontent.com"
                    value={idInput}
                    onChange={(e) => setIdInput(e.target.value)}
                  />
                  <button type="button" className="btn primary" disabled={!idInput.trim()} onClick={saveClientId}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="scan-row">
                  <div className="field since-field">
                    <label className="field-label" htmlFor="scan-since">
                      Scan emails after
                    </label>
                    <input
                      id="scan-since"
                      type="date"
                      value={since}
                      max={todayISO()}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (isISODate(value)) {
                          setSince(value);
                          writePref('gmailScanSince', value);
                        }
                      }}
                    />
                  </div>
                  <div className="quick-dates" role="group" aria-label="Quick ranges">
                    {(
                      [
                        ['Last month', -30],
                        ['Last 3 months', -90],
                        ['This year', null],
                      ] as [string, number | null][]
                    ).map(([label, days]) => {
                      const value = days === null ? `${todayISO().slice(0, 4)}-01-01` : addDays(todayISO(), days);
                      return (
                        <button
                          key={label}
                          type="button"
                          className="btn small"
                          aria-pressed={since === value}
                          onClick={() => {
                            setSince(value);
                            writePref('gmailScanSince', value);
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="scan-row">
                  <button type="button" className="btn primary" disabled={busy} onClick={scan}>
                    {busy ? progress || 'Scanning…' : `Scan Gmail since ${formatDate(since)}`}
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setClientId('');
                      setIdInput(clientId);
                    }}
                  >
                    Change Client ID
                  </button>
                </div>
                <label className="auto-toggle">
                  <input
                    type="checkbox"
                    checked={autoSync}
                    onChange={(e) => {
                      setAutoSync(e.target.checked);
                      writePref('gmailAutoSync', e.target.checked ? 'on' : 'off');
                    }}
                  />
                  <span>
                    Sync by itself while Callback is open
                    <small>
                      Runs when you open the app and every 15 minutes after — new applications and status changes are
                      applied automatically, with an undo.
                    </small>
                  </span>
                </label>
              </>
            )}
          </>
        )}

        {tab === 'paste' && (
          <>
            <p className="modal-note">
              Copy a job application email — confirmation, interview invite, offer or rejection — and paste it here.
              Including the From and Subject lines helps.
            </p>
            <label className="visually-hidden" htmlFor="pasted-email">
              Pasted email
            </label>
            <textarea
              id="pasted-email"
              className="paste-box"
              rows={8}
              placeholder={'Subject: Thank you for applying to Acme\n\nHi Jasman, thanks for applying to the Data Analyst role…'}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button type="button" className="btn primary" disabled={!pasted.trim()} onClick={readPasted}>
              Read email
            </button>
          </>
        )}

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        {suggestions && (
          <div className="sug-results">
            {actionable.length === 0 ? (
              <p className="modal-note">
                {suggestions.length === 0
                  ? 'No application emails found.'
                  : 'Everything found is already in your tracker — nothing new to add.'}
              </p>
            ) : (
              <>
                <ul className="sug-list">
                  {actionable.map((s) => (
                    <li key={s.key}>
                      <label className="sug" title={s.evidence}>
                        <input type="checkbox" checked={s.checked} onChange={() => toggle(s.key)} />
                        <span className="sug-main">
                          <b>{s.company}</b>
                          {s.role && <span className="sug-role"> — {s.role}</span>}
                        </span>
                        <span className={`sug-action is-${s.action}`}>{s.action === 'new' ? 'New' : 'Update'}</span>
                        <Stamp status={s.status} size="sm" />
                        <span className="mono">Applied {formatDate(s.date)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="sug-foot">
                  {skipped > 0 && <span className="field-hint">{skipped} already tracked and up to date.</span>}
                  <span className="spacer" />
                  <button type="button" className="btn primary" disabled={chosen.length === 0} onClick={importChosen}>
                    {[newCount > 0 && `add ${newCount} new`, updateCount > 0 && `update ${updateCount}`]
                      .filter(Boolean)
                      .join(' and ')
                      .replace(/^./, (c) => c.toUpperCase()) || 'Import'}
                  </button>
                </div>
              </>
            )}
            {actionable.length === 0 && skipped > 0 && (
              <p className="field-hint">{skipped} matched applications you already track.</p>
            )}
          </div>
        )}
      </div>
    </dialog>
  );
}
