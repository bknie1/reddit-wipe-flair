import { Hono } from 'hono';
import type { PaymentHandlerRequest, PaymentHandlerResponse } from '@devvit/web/shared';

export const payments = new Hono();

const TIP_SKUS = new Set(['tip-coffee', 'tip-nice-coffee', 'tip-lunch']);

payments.post('/fulfill', async (c) => {
  const order = await c.req.json<PaymentHandlerRequest>();

  if (!order.products.some((p) => TIP_SKUS.has(p.sku))) {
    return c.json<PaymentHandlerResponse>({ success: false, reason: 'Unrecognized product.' }, 200);
  }

  // A tip grants nothing in return, so there's nothing to fulfill beyond accepting the order.
  console.log(`tip received: order ${order.id} (${order.products.map((p) => p.sku).join(', ')})`);

  return c.json<PaymentHandlerResponse>({ success: true }, 200);
});
