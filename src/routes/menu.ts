import { Hono } from 'hono';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import type { FormField } from '@devvit/shared-types/shared/form.js';
import { reddit, redis } from '@devvit/web/server';

export const menu = new Hono();

const buildNukeFields = (targetId: string): FormField[] => [
  {
    name: 'targetId',
    label: 'Target ID',
    type: 'string',
    helpText: 'Auto-filled from the selected item.',
    required: true,
    defaultValue: targetId,
  },
  {
    name: 'remove',
    label: 'Remove comments',
    type: 'boolean',
    defaultValue: true,
  },
  {
    name: 'lock',
    label: 'Lock comments',
    type: 'boolean',
    defaultValue: false,
  },
  {
    name: 'skipDistinguished',
    label: 'Skip distinguished comments',
    type: 'boolean',
    defaultValue: false,
  },
];

const buildNukeForm = (title: string, targetId: string) => ({
  fields: buildNukeFields(targetId),
  title,
  acceptLabel: 'Mop',
  cancelLabel: 'Cancel',
});

menu.post('/mop-comment', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  console.log('request', request.targetId);
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopComment',
        form: buildNukeForm('Mop Comments', request.targetId),
      },
    },
    200
  );
});

menu.post('/mop-post', async (c) => {
  const request = await c.req.json<MenuItemRequest>();
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'mopPost',
        form: buildNukeForm('Mop Post Comments', request.targetId),
      },
    },
    200
  );
});

menu.post('/tip-developer', async (c) => {
  const subreddit = await reddit.getCurrentSubreddit();
  const redisKey = `tip-post:${subreddit.id}`;

  const cachedId = await redis.get(redisKey);
  if (cachedId) {
    try {
      const existing = await reddit.getPostById(cachedId as `t3_${string}`);
      return c.json<UiResponse>({ navigateTo: `https://www.reddit.com${existing.permalink}` }, 200);
    } catch {
      // The cached post is gone (deleted, removed) - fall through and make a new one.
    }
  }

  const post = await reddit.submitCustomPost({
    subredditName: subreddit.name,
    title: 'Tip the Wipe Flair developer',
  });
  await redis.set(redisKey, post.id);

  return c.json<UiResponse>({ navigateTo: `https://www.reddit.com${post.permalink}` }, 200);
});

menu.post('/wipe-flair', async (c) => {
  return c.json<UiResponse>(
    {
      showForm: {
        name: 'wipeFlair',
        form: {
          title: '⚠️ Wipe All User Flair',
          fields: [
            {
              name: 'confirm',
              label:
                'This permanently clears ALL user flair in the subreddit. Type CONFIRM to proceed.',
              type: 'string',
              required: true,
            },
          ],
          acceptLabel: 'Wipe All Flair',
          cancelLabel: 'Cancel',
        },
      },
    },
    200
  );
});