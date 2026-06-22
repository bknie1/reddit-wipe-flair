# Wipe Flair

A Reddit moderation tool that clears **all** user flair in a subreddit with a single click. Built on Devvit. Useful for resetting a community's flair — for example, before rolling out a new ranking or flair system — without editing users one at a time.

## Quick Start (for moderators)

1. Install **Wipe Flair** on your subreddit from the Reddit app directory: **Mod Tools → Community Apps → Browse Apps**, search "Wipe Flair", click **Install**.
2. On your subreddit, open the **mod tools menu** → **Wipe All User Flair**.
3. Type `CONFIRM` in the dialog and submit.
4. The wipe runs in the background. Track progress via the **Check Flair Wipe Progress** menu item, which links you to:
   - **Mod Log** (`reddit.com/mod/SUBREDDIT/log`) — filter by "Posts" action type to see flair edits as they happen.
   - **Remaining Flair** (`reddit.com/mod/SUBREDDIT/flairedusers`) — watch the list empty out.
5. If the job encounters an error, you'll receive an **internal modmail** with the error message and a count of how many users were cleared before it stopped.

> ⚠️ **This is irreversible.** Flair is cleared, not backed up. If you might want the current flair back, export it first from the User Flair page.

If this saved you time, [buy me a coffee](https://buymeacoffee.com/bknie1)!

## Requirements

- The **Manage Flair** (or full) moderator permission on the subreddit.
- User flair enabled on the subreddit (Mod Tools → Look and Feel → User Flair).

## How It Works

The wipe runs as a **background scheduler job** that chains itself page by page, so it completes regardless of subreddit size — no single job times out mid-run.

1. **Menu** → the "Wipe All User Flair" item opens a confirmation form.
2. **Confirmation** → you must type `CONFIRM`. The handler verifies your flair permission, then schedules the first job.
3. **Background job** → fetches up to 1,000 flaired users, clears them in batches of 25 (with automatic retries on timeout), then schedules the next job with the pagination cursor if more pages remain.
4. **Progress** → open "Check Flair Wipe Progress" from the mod menu for direct links to the mod log and flairedusers page. On error, a modmail is sent to the mod team with the error message and cleared count.

## For Developers

### Tech Stack

- [Devvit](https://developers.reddit.com/): Reddit's app platform
- [Vite](https://vite.dev/): build tool
- [Hono](https://hono.dev/): backend routing
- [TypeScript](https://www.typescriptlang.org/)

### Node Version

Requires **Node 22.12+** (or 20.19+). If `npm run dev` or `npx devvit upload` fails with a `rolldown` native binding error, you're on an older Node:

    nvm install 22.12.0
    nvm use 22.12.0

Then delete `node_modules` and `package-lock.json` and reinstall.

### Local Development

    npm install
    npx devvit login
    npm run dev          # playtests on your dev subreddit

### Project Structure

    src/
    ├── index.ts             # Hono server setup and route mounting
    ├── core/
    │   └── wipe.ts          # Permission check + roster pagination + batch-clear
    └── routes/
        ├── api.ts           # Public API endpoints
        ├── forms.ts         # Confirmation form handler (schedules the job)
        ├── menu.ts          # Mod menu items (wipe + progress links)
        ├── scheduler.ts     # Background wipe job handler
        └── triggers.ts      # App lifecycle triggers

### Publishing

    npm run deploy            # type-check, lint, build, upload
    npm run launch            # deploy + publish to the app directory

## Notes & Caveats

- **Irreversible**: no undo, no backup. Flair is cleared outright.
- **Batch size**: 25 users per `setUserFlairBatch` call, with up to 3 retries on HTTP timeout. Larger batches caused Reddit API timeouts in testing.
- **Permissions**: requires `reddit: true` in `devvit.json` and the Manage Flair (or full) mod permission to run.
