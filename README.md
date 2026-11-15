# UPSMRT Social Studio

Plan, create and publish social posts and reels for Facebook, Instagram, LinkedIn and YouTube — from one app that runs on this Mac.

## Start

Double-click **Start UPSMRT Social Studio.command** (or run `python3 server.py`), then use <http://localhost:8787>.
Nothing to install: it uses the Python that ships with macOS. Keep the window open — scheduled posts publish only while the app is running.

## First steps

1. **Brand kit** — enter your website and press *Scan website*; add logo, colours, voice, guidelines and photos.
2. **Channels** — connect each network (see below).
3. **Settings** — optionally add an Anthropic API key so Claude writes the copy. Without it, drafts are assembled from your website text.
4. **Calendar** — Canadian holidays are already on it. Press *Plan this month* for a month of drafts with visuals, review, then schedule.

## Key dates

On the Calendar, **★ Key dates** suggests moments to post about for your industry: Canadian and US holidays, awareness and business days, industry events, trade shows, and publications. Each comes with a proposed message and visual. Click a category to show or hide it, on the list and on the calendar.
Dates marked **Confirm date** (shown with ≈ on the calendar) are estimated from an event's usual timing; set the exact date before you post.

Every type of date has its own colour and label. Click a type in the calendar legend, or in Key dates, to show or hide it; *Select all* and *Clear all* do it in one click. Under **Categories for your industry** you can add your own types, or have the assistant propose some with their dates (needs an AI key).

## Client brands

The **Client brand** menu at the top of the sidebar switches between brands and creates new ones. Each brand has its own brand kit (logo, colours, typeface, graphic shape, voice, guidelines, photos), library, calendar, key dates, data sources and channel connections. Nothing is shared between brands; only the AI key is common to all.
A new brand can be started from its website address: the scan reads colours, logos, photos and text. Guidelines can be uploaded or linked. UPSMRT stays as the first brand and cannot be deleted.

## Data sources

**Data sources** holds a brand's lists of industry publications, trade shows, competitors and associations: uploaded files (PDF, Word, Excel, CSV, text) or links (web page, Google Drive file or folder, Docs, Sheets, Dropbox, OneDrive; shared with "anyone with the link"). *Read now* has the assistant read the source, visit the websites it lists, and propose dated events. This needs an AI key.
Proposed dates wait in **Dates to review**: correct, accept or reject each one. A date is marked as stated on the source, or as needing confirmation. Editorial deadlines and competitor activity are kept as internal reminders (🔒 on the calendar) and never become posts.

## Suggested posts

For every key date in the next two months, the app adds a suggested post to the calendar (dashed outline, ✦), written for the type of date: a greeting for a holiday; before, opening-day and after posts for a trade show; one post for an awareness day, event or publication. Tick *We are attending* on a trade show for "meet us there" wording.
Nothing is scheduled until you approve it. Under **Posts → Suggested** you can approve, edit, regenerate or dismiss each one, or approve a whole month. Dismissed suggestions do not come back. Switch the feature off in Key dates.

## Online version (Netlify)

The same app runs on Netlify from this repository (`netlify.toml`, `netlify/`): data is kept in Netlify Blobs, scheduled posts publish by themselves, and the app is behind a password set as the `APP_PASSWORD` environment variable in Netlify. The local and online versions do not share data.

## Connecting channels

Each network requires your own developer app (free); this is how they authorise any publishing tool. In each app, register the redirect URI shown on the Channels page (`http://localhost:8787/oauth/callback/<network>`). Channels are connected per brand.

| Network | Where to create the app | Needs |
|---|---|---|
| Facebook + Instagram | developers.facebook.com | Facebook Login for Business; permissions `pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`. Instagram must be a professional account linked to the Page. |
| LinkedIn | linkedin.com/developers | Products "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect". Company Pages also need Community Management API access. |
| YouTube | console.cloud.google.com | YouTube Data API v3 enabled, OAuth client of type "Web application". |

## Where things live

- `data/db.json` — posts, brand kit, settings
- `data/uploads/` — photos, generated visuals and reels
- `data/secrets.json` — channel tokens and API key (this computer only; never commit or share it)
