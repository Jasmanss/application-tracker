import { addDays, todayISO } from './dates';
import { newId } from './storage';
import { emptyDraft, type Application, type Draft, type Status } from './types';

type Sample = Partial<Draft> & Pick<Draft, 'company' | 'role'>;

/** Fictional applications for trying the tracker out. Dates are relative to today. */
export function sampleApps(): Application[] {
  const today = todayISO();
  const ago = (days: number) => addDays(today, -days);
  const stamp = (days: number) => new Date(`${ago(days)}T15:00:00`).toISOString();

  const make = (sample: Sample, steps: [Status, number][]): Application => {
    const history = steps.map(([status, days]) => ({ status, at: stamp(days) }));
    const status = steps[steps.length - 1][0];
    const appliedStep = steps.find(([s]) => s !== 'wishlist');
    return {
      ...emptyDraft(status),
      dateApplied: appliedStep ? ago(appliedStep[1]) : '',
      ...sample,
      status,
      id: newId(),
      history,
      createdAt: history[0].at,
      updatedAt: history[history.length - 1].at,
    };
  };

  return [
    make(
      {
        company: 'Northwind Labs',
        role: 'Frontend Developer',
        location: 'Toronto, ON',
        workMode: 'hybrid',
        salary: '$95k–$110k',
        source: 'LinkedIn',
        priority: 3,
        contactName: 'Priya Raman (recruiter)',
        followUpDate: addDays(today, 2),
        resumeVersion: 'Frontend v3',
        notes: 'Second round is system design with the platform team. Ask about the on-call rotation.',
      },
      [['applied', 24], ['screening', 17], ['interviewing', 9]],
    ),
    make(
      {
        company: 'Halcyon Health',
        role: 'Junior Data Analyst',
        workMode: 'remote',
        source: 'Company site',
        followUpDate: ago(2),
        notes: 'Take-home SQL assessment submitted. Recruiter said to expect news within a week.',
      },
      [['applied', 12], ['screening', 6]],
    ),
    make(
      { company: 'Pinecrest Analytics', role: 'Business Intelligence Analyst', location: 'Austin, TX', workMode: 'onsite', source: 'Indeed' },
      [['applied', 18]],
    ),
    make(
      {
        company: 'Orbital Pay',
        role: 'Software Engineer, Payments',
        workMode: 'remote',
        salary: '$120k',
        source: 'Referral',
        priority: 3,
        contactName: 'Marcus Lee',
      },
      [['applied', 4]],
    ),
    make(
      { company: 'Quarry Cloud', role: 'DevOps Engineer', location: 'Denver, CO', workMode: 'hybrid', source: 'Wellfound' },
      [['applied', 1]],
    ),
    make(
      {
        company: 'Lumen Freight',
        role: 'Full-stack Developer',
        location: 'Vancouver, BC',
        workMode: 'hybrid',
        salary: '$105k + bonus',
        source: 'LinkedIn',
        priority: 3,
        followUpDate: addDays(today, 3),
        notes: 'Offer deadline is Friday. Compare benefits with Northwind before answering.',
      },
      [['applied', 40], ['screening', 33], ['interviewing', 26], ['offer', 2]],
    ),
    make(
      { company: 'Juniper Games', role: 'QA Engineer', location: 'Montreal, QC', workMode: 'hybrid', source: 'Company site' },
      [['applied', 30], ['screening', 22], ['rejected', 15]],
    ),
    make(
      { company: 'Maple & Pixel', role: 'UX Engineer', workMode: 'remote', source: 'LinkedIn' },
      [['applied', 45], ['ghosted', 10]],
    ),
    make(
      { company: 'Tidewater Energy', role: 'IT Support Analyst', location: 'Halifax, NS', source: 'Job board' },
      [['wishlist', 2]],
    ),
    make(
      { company: 'Brightline Transit', role: 'Data Engineer', location: 'New York, NY', workMode: 'hybrid', priority: 3, followUpDate: addDays(today, 5), notes: 'Applications close at the end of the month.' },
      [['wishlist', 6]],
    ),
  ];
}
