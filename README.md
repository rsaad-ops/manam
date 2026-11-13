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

## Connecting channels

Each network requires your own developer app (free); this is how they authorise any publishing tool. In each app, register the redirect URI shown on the Channels page (`http://localhost:8787/oauth/callback/<network>`).

| Network | Where to create the app | Needs |
|---|---|---|
| Facebook + Instagram | developers.facebook.com | Facebook Login for Business; permissions `pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`. Instagram must be a professional account linked to the Page. |
| LinkedIn | linkedin.com/developers | Products "Share on LinkedIn" and "Sign In with LinkedIn using OpenID Connect". Company Pages also need Community Management API access. |
| YouTube | console.cloud.google.com | YouTube Data API v3 enabled, OAuth client of type "Web application". |

## Where things live

- `data/db.json` — posts, brand kit, settings
- `data/uploads/` — photos, generated visuals and reels
- `data/secrets.json` — channel tokens and API key (this computer only; never commit or share it)
