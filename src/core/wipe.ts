import { reddit, redis, scheduler } from '@devvit/web/server';

const PROGRESS_KEY = 'wipe-progress';
const BATCH_SIZE = 25;
const MAX_LISTED_FAILURES = 50;

type Skipped = { username: string; reason: string };
type Progress = { cleared: number; failedCount: number; failed: Skipped[]; done: boolean; error?: string };

export async function checkFlairPermission(subredditName: string) {
  const me = await reddit.getCurrentUser();
  if (!me) return { ok: false, message: "Can't resolve current user." };
  const perms = await me.getModPermissionsForSubreddit(subredditName);
  if (!perms.includes('all') && !perms.includes('flair')) {
    return { ok: false, message: 'You need the Manage Flair permission.' };
  }
  return { ok: true, message: '' };
}

async function readProgress(): Promise<Progress> {
  const raw = await redis.get(PROGRESS_KEY);
  const parsed = raw ? (JSON.parse(raw) as Partial<Progress>) : {};
  return {
    cleared: parsed.cleared ?? 0,
    failedCount: parsed.failedCount ?? 0,
    failed: parsed.failed ?? [],
    done: parsed.done ?? false,
  };
}

function describeFailure(raw: string): string {
  if (/404|not.?found|doesn.?t exist|does not exist|USER_DOESNT_EXIST/i.test(raw)) {
    return 'account no longer exists (deleted or suspended)';
  }
  if (/403|forbidden|not allowed/i.test(raw)) return 'Reddit refused the change (permissions)';
  if (/429|rate.?limit|too many/i.test(raw)) return 'rate limited by Reddit';
  if (/500|503|INTERNAL|timeout|timed out/i.test(raw)) return 'Reddit returned a server error for this account';
  return `Reddit rejected the change: ${raw}`;
}

async function clearBatch(
  subredditName: string,
  usernames: string[]
): Promise<{ cleared: number; failed: Skipped[] }> {
  const batch = usernames.map((username) => ({ username, text: '', cssClass: '' }));

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const results = await reddit.setUserFlairBatch(subredditName, batch);
      const failed: Skipped[] = [];
      usernames.forEach((username, i) => {
        const errors = results[i]?.errors;
        if (!errors) return;
        const raw = errors.user ?? errors.css ?? errors.row ?? results[i]?.status ?? 'unknown error';
        failed.push({ username, reason: describeFailure(raw) });
      });
      failed.forEach((f) => console.warn(`skipped u/${f.username}: ${f.reason}`));
      return { cleared: usernames.length - failed.length, failed };
    } catch (err) {
      console.error(`batch attempt ${attempt} failed: ${err instanceof Error ? err.message : String(err)}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }

  let cleared = 0;
  const failed: Skipped[] = [];
  for (const username of usernames) {
    try {
      await reddit.removeUserFlair(subredditName, username);
      cleared++;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const reason = describeFailure(raw);
      console.warn(`skipped u/${username}: ${reason} (${raw})`);
      failed.push({ username, reason });
    }
  }
  return { cleared, failed };
}

// Processes one page of up to 1000 flaired users in batches of 25, then schedules
// the next job with the pagination cursor if there are more pages. A batch that
// keeps failing is retried one user at a time so a single bad account cannot stop the wipe.
export async function runFlairWipe(subredditName: string, after?: string): Promise<void> {
  let clearedThisPage = 0;
  const failedThisPage: Skipped[] = [];

  try {
    const subreddit = await reddit.getSubredditByName(subredditName);

    const opts: { limit: number; after?: string } = { limit: 1000 };
    if (after) opts.after = after;
    const resp = await subreddit.getUserFlair(opts);
    const users = resp.users ?? [];

    const usernames = users.filter((u) => u.user).map((u) => u.user as string);
    console.log(`processing ${usernames.length} users (cursor=${after ?? 'start'})`);

    for (let i = 0; i < usernames.length; i += BATCH_SIZE) {
      const { cleared, failed } = await clearBatch(subredditName, usernames.slice(i, i + BATCH_SIZE));
      clearedThisPage += cleared;
      failedThisPage.push(...failed);
    }

    const prev = await readProgress();
    const progress: Progress = {
      cleared: prev.cleared + clearedThisPage,
      failedCount: prev.failedCount + failedThisPage.length,
      failed: [...prev.failed, ...failedThisPage].slice(0, MAX_LISTED_FAILURES),
      done: false,
    };

    const next = resp.next ?? undefined;
    if (next) {
      await redis.set(PROGRESS_KEY, JSON.stringify(progress));
      await scheduler.runJob({
        name: 'wipe-flair-job',
        data: { subredditName, after: next },
        runAt: new Date(),
      });
      console.log(`page done: cleared ${clearedThisPage} this run, ${progress.cleared} total - continuing from cursor`);
      return;
    }

    await redis.set(PROGRESS_KEY, JSON.stringify({ ...progress, done: true }));
    console.log(`wipe complete: cleared ${progress.cleared} total, ${progress.failedCount} failed`);

    if (progress.failedCount > 0) {
      try {
        await reddit.modMail.createConversation({
          subredditName,
          subject: 'Flair wipe finished with some failures',
          body:
            `The flair wipe cleared ${progress.cleared} users, but ${progress.failedCount} could not be cleared ` +
            `Their flair was left as is, and the wipe continued past them.\n\n` +
            progress.failed.map((f) => `- u/${f.username}: ${f.reason}`).join('\n') +
            (progress.failedCount > progress.failed.length
              ? `\n- and ${progress.failedCount - progress.failed.length} more (listed in the app logs)`
              : ''),
          to: null,
        });
      } catch (mailErr) {
        console.error(`could not send failure summary: ${mailErr instanceof Error ? mailErr.message : String(mailErr)}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`runFlairWipe error: ${message}`);
    const prev = await readProgress();
    const cleared = prev.cleared + clearedThisPage;
    await redis.set(PROGRESS_KEY, JSON.stringify({ ...prev, cleared, error: message }));
    await reddit.modMail.createConversation({
      subredditName,
      subject: 'Flair wipe error',
      body: `The flair wipe job stopped with an error:\n\n> ${message}\n\nUsers cleared so far: ${cleared}`,
      to: null,
    });
  }
}
