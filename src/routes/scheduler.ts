import { Hono } from 'hono';
import { runFlairWipe } from '../core/wipe';

export const scheduler = new Hono();

scheduler.post('/wipe-flair', async (c) => {
  const body = await c.req.json<{ data: { subredditName: string; after?: string } }>();
  await runFlairWipe(body.data.subredditName, body.data.after);
  return c.json({ status: 'success' }, 200);
});