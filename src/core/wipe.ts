import { reddit, redis, scheduler } from '@devvit/web/server';

const PROGRESS_KEY = 'wipe-progress';

export async function checkFlairPermission(subredditName: string) {
  const me = await reddit.getCurrentUser();
  if (!me) return { ok: false, message: "Can't resolve current user." };
  const perms = await me.getModPermissionsForSubreddit(subredditName);
  if (!perms.includes('all') && !perms.includes('flair')) {
    return { ok: false, message: 'You need the Manage Flair permission.' };
  }
  return { ok: true, message: '' };
}

// Processes one page of up to 1000 flaired users, clears their flair in
// batches of 100, then schedules the next job with the pagination cursor if
// there are more pages. This keeps each job well within Devvit's runtime limit.
export async function runFlairWipe(subredditName: string, after?: string): Promise<void> {
  try {
    const subreddit = await reddit.getSubredditByName(subredditName);

    const opts: { limit: number; after?: string } = { limit: 1000 };
    if (after) opts.after = after;
    const resp = await subreddit.getUserFlair(opts);
    const users = resp.users ?? [];

    const usernames = users.filter((u) => u.user).map((u) => u.user as string);
    console.log(`processing ${usernames.length} users (cursor=${after ?? 'start'})`);

    let cleared = 0;
    for (let i = 0; i < usernames.length; i += 25) {
      const batch = usernames.slice(i, i + 25).map((username) => ({ username, text: '', cssClass: '' }));
      let results: Awaited<ReturnType<typeof reddit.setUserFlairBatch>> = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          results = await reddit.setUserFlairBatch(subredditName, batch);
          break;
        } catch (batchErr) {
          if (attempt === 3) throw batchErr;
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
      cleared += results.filter((r) => !r.errors).length;
    }

    const existing = await redis.get(PROGRESS_KEY);
    const prev = existing ? (JSON.parse(existing) as { cleared: number }) : { cleared: 0 };
    const totalCleared = prev.cleared + cleared;

    const next = resp.next ?? undefined;
    if (next) {
      await redis.set(PROGRESS_KEY, JSON.stringify({ cleared: totalCleared, done: false }));
      await scheduler.runJob({
        name: 'wipe-flair-job',
        data: { subredditName, after: next },
        runAt: new Date(),
      });
      console.log(`page done: cleared ${cleared} this run, ${totalCleared} total — continuing from cursor`);
    } else {
      await redis.set(PROGRESS_KEY, JSON.stringify({ cleared: totalCleared, done: true }));
      console.log(`wipe complete: cleared ${totalCleared} total`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`runFlairWipe error: ${message}`);
    const existing = await redis.get(PROGRESS_KEY);
    const prev = existing ? (JSON.parse(existing) as { cleared: number; done: boolean }) : { cleared: 0, done: false };
    await redis.set(PROGRESS_KEY, JSON.stringify({ ...prev, error: message }));
    await reddit.modMail.createConversation({
      subredditName,
      subject: 'Flair wipe error',
      body: `The flair wipe job stopped with an error:\n\n> ${message}\n\nUsers cleared so far: ${prev.cleared ?? 0}`,
      to: null,
    });
  }
}
