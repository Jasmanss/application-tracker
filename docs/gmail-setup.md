# Connect Gmail to Callback

The tracker can scan your Gmail for job application emails — confirmations, interview invites, offers and rejections — and turn them into tracked applications. It reads your mail **in your browser only**, with **read-only** access. Nothing is uploaded to any server.

Because there is no server, you bring your own free Google "Client ID". You create it once, in your own Google account, so the only party with access to your mail is you. It takes about 10 minutes.

## 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and sign in with your Gmail account.
2. Click the project picker in the top bar → **New project**.
3. Name it `application-tracker` → **Create**, then make sure it's selected in the project picker.

## 2. Enable the Gmail API

1. In the left menu, open **APIs & Services → Library**.
2. Search for **Gmail API** → open it → **Enable**.

## 3. Set up the consent screen

1. Open **APIs & Services → OAuth consent screen** (Google sometimes calls this **Google Auth Platform**).
2. If asked to configure: app name `Application Tracker`, support email = your own Gmail address, audience **External**, developer contact = your own Gmail address. Save through the steps — you can skip optional sections.
3. Open the **Audience** (or **Test users**) section and click **Add users**. Add **your own Gmail address**. Leave the app in **Testing** mode — you never need to publish it, because you're the only user.

## 4. Create the Client ID

1. Open **APIs & Services → Credentials** → **Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name: `application-tracker`.
3. Under **Authorized JavaScript origins**, click **Add URI** and add both:
   - `http://localhost:5178`
   - `https://jasmanss.github.io`
4. Leave **Authorized redirect URIs** empty → **Create**.
5. Copy the **Client ID** — it looks like `1234567890-abc123.apps.googleusercontent.com`.

## 5. Paste it into the tracker

1. In the tracker, open **Data → Add from email** and stay on the **Scan Gmail** tab.
2. Paste the Client ID → **Save** → **Scan Gmail**.
3. A Google window opens. Pick your account. Google will warn that the app isn't verified — that's expected, because it's your own private app: click **Continue**, then allow read-only Gmail access.
4. Review what the scan found, untick anything you don't want, and import.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Access blocked: … has not completed the Google verification process" | Add your Gmail address as a **test user** (step 3.3). |
| "The Gmail API isn't enabled" | Step 2 — enable the Gmail API, then wait a minute. |
| "Error 400: origin_mismatch" | The site's address must be listed under **Authorized JavaScript origins** exactly (step 4.3). After adding it, wait a few minutes. |
| Sign-in popup closes immediately | Allow popups for the tracker's site in your browser. |

## What the scan can and can't do

- After the first sign-in, Callback syncs by itself whenever the app is open (on load and every 15 minutes), applying new applications and status changes with an undo. It cannot check mail while the app is closed — there is no server.
- It searches roughly the past year for application-related emails and reads only their sender, subject, date and preview snippet.
- Parsing is best-effort: unusual emails may be missed or mislabeled. Everything is shown for review before it touches your tracker, and importing is undoable.
