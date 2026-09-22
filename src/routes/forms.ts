import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, reddit, redis, scheduler } from '@devvit/web/server';
import { checkFlairPermission } from '../core/wipe';

export const forms = new Hono();

forms.post('/wipe-flair-submit', async (c) => {
  const values = await c.req.json<{ confirm?: string }>();
  if (values.confirm?.trim().toUpperCase() !== 'CONFIRM') {
    return c.json<UiResponse>({ showToast: 'You must type CONFIRM to proceed.' }, 200);
  }

  const info = await reddit.getSubredditInfoById(context.subredditId);
  const subredditName = info.name;
  if (!subredditName) return c.json<UiResponse>({ showToast: "Couldn't resolve subreddit name." }, 200);

  const perm = await checkFlairPermission(subredditName);
  if (!perm.ok) return c.json<UiResponse>({ showToast: perm.message }, 200);

  await redis.set('wipe-progress', JSON.stringify({ cleared: 0, done: false }));

  await scheduler.runJob({
    name: 'wipe-flair-job',
    data: { subredditName },
    runAt: new Date(),
  });

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'wipeFlair',
        form: {
          title: 'Flair Wipe Started',
          fields: [
            {
              name: 'modlog',
              label: 'Mod Log',
              type: 'string',
              defaultValue: `https://www.reddit.com/mod/${subredditName}/log`,
              helpText: 'Filter by "Posts" action type to see flair edits as they happen.',
            },
            {
              name: 'flairedusers',
              label: 'Remaining Flair',
              type: 'string',
              defaultValue: `https://www.reddit.com/mod/${subredditName}/flairedusers`,
              helpText: 'Watch this list empty out as the wipe progresses.',
            },
            {
              name: 'coffee',
              label: 'Enjoyed Wipe Flair?',
              type: 'string',
              defaultValue: 'https://buymeacoffee.com/bknie1',
              helpText: 'Optional tip jar - no obligation, just appreciated.',
            },
          ],
          cancelLabel: 'Close',
        },
      },
    },
    200
  );
});