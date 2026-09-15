import { describe, expect, it } from 'vitest';
import type { Application } from '../types';
import { mapAiResults } from './ai';
import { parseEmail, parsePastedEmail, reconcile, type EmailInput } from './parse';

const email = (overrides: Partial<EmailInput>): EmailInput => ({
  from: 'Careers <careers@acmecorp.com>',
  subject: 'Thank you for your application',
  body: '',
  date: '2026-09-14',
  id: 'msg-1',
  ...overrides,
});

const app = (overrides: Partial<Application>): Application =>
  ({
    id: 'a1',
    company: 'Acme',
    role: '',
    url: '',
    location: '',
    workMode: '',
    salary: '',
    source: '',
    status: 'applied',
    dateApplied: '2026-06-01',
    followUpDate: '',
    contactName: '',
    contactEmail: '',
    resumeVersion: '',
    priority: 2,
    notes: '',
    history: [{ status: 'applied', at: '2026-06-01T12:00:00Z' }],
    createdAt: '2026-06-01T12:00:00Z',
    updatedAt: '2026-06-01T12:00:00Z',
    ...overrides,
  }) as Application;

describe('company extraction', () => {
  it('reads LinkedIn confirmations', () => {
    const r = parseEmail(
      email({
        from: 'LinkedIn <jobs-noreply@linkedin.com>',
        subject: 'Jasman, your application was sent to Shopify',
        body: 'Your application was sent to Shopify. Data Analyst · Toronto, ON. © 2026 LinkedIn Corporation',
      }),
    );
    expect(r?.company).toBe('Shopify');
    expect(r?.status).toBe('applied');
    expect(r?.source).toBe('LinkedIn');
  });

  it('reads Indeed "applied to X at Y on Indeed"', () => {
    const r = parseEmail(
      email({
        from: 'Indeed Apply <indeedapply@indeed.com>',
        subject: 'Application submitted: Data Analyst at Halcyon Health',
        body: 'You applied to Data Analyst at Halcyon Health on Indeed.',
      }),
    );
    expect(r?.company).toBe('Halcyon Health');
    expect(r?.role).toBe('Data Analyst');
  });

  it('finds the company in a footer ("Early talent programs at Lyft")', () => {
    const r = parseEmail(
      email({
        from: 'Recruiting <no-reply@smartrecruiters.com>',
        subject: 'Thank you for your application!',
        body: 'We will review your submission. --- Early talent programs at Lyft. © 2026 Lyft, Inc.',
      }),
    );
    expect(r?.company).toBe('Lyft');
  });

  it('finds the company in a sign-off ("Lyft Talent Acquisition")', () => {
    const r = parseEmail(
      email({
        from: 'Careers <no-reply@myworkday.com>',
        subject: 'Thank you for your application',
        body: 'Thank you for your application to the Data Analyst position. Best regards, Lyft Talent Acquisition',
      }),
    );
    expect(r?.company).toBe('Lyft');
    expect(r?.role).toBe('Data Analyst');
  });

  it('mines Workday sender slugs (lyft@myworkday.com)', () => {
    const r = parseEmail(
      email({
        from: 'Workday <lyft@myworkday.com>',
        subject: 'Your application has been received',
        body: 'Thank you for your interest. We have received your application and will be in touch.',
      }),
    );
    expect(r?.company).toBe('Lyft');
  });

  it('mines Teamtailor-style subdomain slugs', () => {
    const r = parseEmail(
      email({
        from: 'No Reply <no-reply@halcyon-health.mail.teamtailor.com>',
        subject: 'We received your application',
        body: 'Thanks! Your application is in our system.',
      }),
    );
    expect(r?.company).toBe('Halcyon Health');
  });

  it('uses Reply-To when From is an ATS', () => {
    const r = parseEmail(
      email({
        from: 'Recruiting <no-reply@greenhouse.io>',
        replyTo: 'careers@lyft.com',
        subject: 'Application received',
        body: 'Thanks for your application. We will review it shortly.',
      }),
    );
    expect(r?.company).toBe('Lyft');
  });

  it('reads label-line roles ("Position: Data Analyst")', () => {
    const r = parseEmail(
      email({
        subject: 'We received your application',
        body: 'Details — Position: Data Analyst II Location: Remote. Thank you for applying.',
      }),
    );
    expect(r?.role).toBe('Data Analyst II');
  });

  it('rescues follow-ups that only mention a tracked company', () => {
    const r = parseEmail(
      email({
        from: 'Talent Team <no-reply@ashbyhq.com>',
        subject: 'An update on your candidacy',
        body: 'Hi Jasman, unfortunately Maple & Pixel will not be moving forward with your application at this time.',
      }),
      ['Maple & Pixel', 'Northwind Labs'],
    );
    expect(r?.company).toBe('Maple & Pixel');
    expect(r?.status).toBe('rejected');
  });

  it('gives up when several tracked companies match', () => {
    const r = parseEmail(
      email({
        from: 'Digest <no-reply@ashbyhq.com>',
        subject: 'Your applications this week',
        body: 'Updates on your applications at Maple & Pixel and Northwind Labs.',
      }),
      ['Maple & Pixel', 'Northwind Labs'],
    );
    expect(r).toBeNull();
  });
});

describe('the application gate', () => {
  it('ignores receipts and shopping email', () => {
    const r = parseEmail(
      email({
        from: 'Uber Eats <noreply@uber.com>',
        subject: 'Your Friday order receipt',
        body: 'Thanks for your order! Total $23.40',
      }),
    );
    expect(r).toBeNull();
  });

  it('passes ATS-sender emails with weak wording (two-signal rule)', () => {
    const r = parseEmail(
      email({
        from: 'Acme Recruiting <recruiting@acme.dev>',
        subject: 'Next steps',
        body: 'Hi Jasman, following up on the Data Analyst position. Are you free this week for a quick chat?',
      }),
    );
    expect(r?.company).toBe('Acme');
  });

  it('never invents a company from a bare sign-off', () => {
    const r = parseEmail(
      email({
        from: 'Careers <no-reply@myworkday.com>',
        subject: 'Thank you for your application',
        body: 'We appreciate your interest. Best regards, The Talent Acquisition Team',
      }),
    );
    expect(r).toBeNull();
  });
});

describe('reconcile', () => {
  const parsedFor = (status: Application['status'], date: string, company = 'Maple & Pixel') => ({
    company,
    role: 'UX Engineer',
    status,
    date,
    source: 'Email',
    evidence: 'subj',
    gist: '',
    id: `m-${date}`,
  });
  const ghosted = app({
    company: 'Maple & Pixel',
    role: 'UX Engineer',
    status: 'ghosted',
    updatedAt: '2026-08-10T12:00:00Z',
    history: [
      { status: 'applied', at: '2026-04-01T12:00:00Z' },
      { status: 'ghosted', at: '2026-08-10T12:00:00Z' },
    ],
  });

  it('revives a ghosted app when they email after the ghosting', () => {
    const [s] = reconcile([parsedFor('interviewing', '2026-09-12')], [ghosted]);
    expect(s.action).toBe('update');
    expect(s.status).toBe('interviewing');
  });

  it('converts a ghosted app on a late rejection', () => {
    const [s] = reconcile([parsedFor('rejected', '2026-09-12')], [ghosted]);
    expect(s.action).toBe('update');
  });

  it('does not revive from emails older than the ghosting', () => {
    const [s] = reconcile([parsedFor('interviewing', '2026-06-15')], [ghosted]);
    expect(s.action).toBe('skip');
  });

  it('never reopens rejected applications', () => {
    const rejected = app({ company: 'Juniper', role: 'UX Engineer', status: 'rejected' });
    const [s] = reconcile([parsedFor('interviewing', '2026-09-12', 'Juniper')], [rejected]);
    expect(s.action).toBe('skip');
  });

  it('moves an applied app forward on a screening email', () => {
    const applied = app({ company: 'Quarry Cloud', role: '' });
    const [s] = reconcile([parsedFor('screening', '2026-09-12', 'Quarry Cloud')], [applied]);
    expect(s.action).toBe('update');
  });
});

describe('pasted emails', () => {
  it('extracts headers and parses the whole paste', () => {
    const input = parsePastedEmail(
      'From: Stripe <no-reply@greenhouse.io>\nSubject: Thank you for applying to Stripe!\nDate: Tue, 8 Sep 2026 10:00:00 -0700\n\nThank you for applying to the Software Engineer, Payments position at Stripe.',
    );
    const r = parseEmail(input);
    expect(r?.company).toBe('Stripe');
    expect(r?.role).toBe('Software Engineer');
    expect(r?.date).toBe('2026-09-08');
  });
});

describe('AI result mapping', () => {
  const emails = [
    email({ id: 'x1', subject: 'Welcome to the process', date: '2026-09-10' }),
    email({ id: 'x2', subject: 'Newsletter', date: '2026-09-10' }),
  ];

  it('maps valid entries and drops non-application ones', () => {
    const raw = `Here you go:\n[
      {"i": 0, "is_job_application_email": true, "company": "Lyft", "role": "Data Analyst", "status": "interviewing", "applied_date": "2026-09-01"},
      {"i": 1, "is_job_application_email": false, "company": null, "role": null, "status": null, "applied_date": null}
    ]`;
    const out = mapAiResults(raw, emails);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ company: 'Lyft', role: 'Data Analyst', status: 'interviewing', date: '2026-09-01', id: 'x1' });
    expect(out[0].gist).toBe('Interview invite');
  });

  it('survives junk replies and bad fields', () => {
    expect(mapAiResults('no json here', emails)).toHaveLength(0);
    expect(mapAiResults('[{"i": 9, "is_job_application_email": true, "company": "X"}]', emails)).toHaveLength(0);
    const out = mapAiResults('[{"i": 0, "is_job_application_email": true, "company": "Lyft", "status": "nonsense", "applied_date": "bad"}]', emails);
    expect(out[0]).toMatchObject({ status: 'applied', date: '2026-09-10' });
  });
});
