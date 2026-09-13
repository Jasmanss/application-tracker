# Application Tracker

A job application tracker that shows every application from wishlist to offer, and flags the ones that need a follow-up.

Your data stays in your browser (localStorage). There's no account or server. Export a JSON backup to keep a copy or move to another device.

## What it tracks

| Group | Fields |
| --- | --- |
| The job | Company, role, job posting link, location, work mode (remote / hybrid / on-site), salary, where you found it |
| Progress | Status, date applied, follow-up date, priority (low / normal / high) |
| People and materials | Contact name, contact email, resume version sent |
| Notes | Free-form notes (interview questions, prep, who you spoke to) |
| History | Every status change with its date, recorded automatically |

### Stages

| Stage | Meaning |
| --- | --- |
| Wishlist | Saved to apply to later |
| Applied | Sent and waiting to hear back |
| Screening | Recruiter call or assessment |
| Interviewing | In interview rounds |
| Offer | Offer in hand |
| Rejected | They passed |
| Ghosted | No reply, even after following up |
| Withdrawn | You pulled out |

## Features

- **Board view.** Drag cards between stages. Rejected, Ghosted and Withdrawn are grouped in one closed column.
- **Table view.** Sort by any column and filter by status.
- **Needs a follow-up list.** Shows applications whose follow-up date has arrived, and anything still in *Applied* after 14 days with no reminder set. One click sets a reminder for a week out or marks the application ghosted.
- **Summary.** Applications sent, how many heard back, how many reached interviews, offers, and how many you sent this week, plus a bar showing the pipeline by stage.
- **Search** across company, role, location, source, contact and notes.
- **Add from email.** Scan your Gmail (read-only, in your browser — see [docs/gmail-setup.md](docs/gmail-setup.md)) or paste any application email; the tracker recognises confirmations, interview invites, offers and rejections from LinkedIn, Indeed, Greenhouse, Lever, Workday and plain recruiter emails, then shows everything for review before importing. Matching applications get a status update instead of a duplicate.
- **Import and export.** CSV for spreadsheets, JSON for full backups including history. CSV import recognises common column names such as *Company*, *Position*, *Stage* and *Link*, and skips duplicates.
- **Undo** for moves, deletes, reminders and imports.
- Keyboard shortcuts: <kbd>/</kbd> to search, <kbd>n</kbd> to add an application.
- Light and dark themes follow your system setting.

## Run it locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build

```bash
npm run build
```

The static site goes to `dist/`. Every push to `main` deploys it to GitHub Pages through `.github/workflows/deploy.yml`.

## Tech

React 19, TypeScript, Vite. No UI or state libraries.

```
src/
  App.tsx            app state, actions, layout
  types.ts           data model, stages, labels
  storage.ts         localStorage + record validation
  io.ts              CSV/JSON import and export
  stats.ts           summary numbers and follow-up rules
  dates.ts           date helpers
  sample.ts          fictional sample data
  components/        Board, TableView, Drawer, Summary, Attention, Stamp, EmptyState
```
