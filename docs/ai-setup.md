# AI cleanup for the email reader (optional)

Callback's email reader is pattern-based and free — but some emails are worded in ways no pattern anticipates. With AI cleanup on, **only the emails the patterns can't read** are sent to Claude (Anthropic's AI) to extract the company, position, status, and date. Everything else stays entirely in your browser.

**Cost:** it uses Claude Haiku, the cheapest model — fractions of a cent per email. Typical usage is well under **$1/month**; a $5 minimum top-up usually lasts a year.

**Privacy:** unrecognized emails' text goes to Anthropic's API under your own key. API data is not used for model training. Recognized emails never leave your browser.

## Setup (~5 minutes, one time)

1. Go to [console.anthropic.com](https://console.anthropic.com/) and create an account (or sign in).
2. Open **Billing** and add the minimum credit ($5).
3. Open **API Keys** → **Create key**. Copy the key — it starts with `sk-ant-`.
4. In Callback, open **Data → Add from email**, find **AI cleanup (optional)**, paste the key, **Save**.

The key is stored in your browser only. Remove it any time with the **Remove key** button — the reader falls back to patterns-only.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Your Anthropic API key was rejected" | Re-copy the key from console.anthropic.com — no spaces, starts with `sk-ant-`. |
| Emails still show under "couldn't be read" | With a key saved, that list means even the AI couldn't read them — they're probably not application emails. If one clearly is, use the Paste an email tab and let us know the pattern. |
| Worried about cost | The app sends at most 20 unread emails per scan, ~5 per request, on the cheapest model. Check usage anytime at console.anthropic.com → Usage. |
