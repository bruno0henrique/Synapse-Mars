import Stripe from 'stripe';
import { markStripeSubscriptionPastDue, saveStripeSubscriptionState, type PlanId } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { getPlanFromPriceId, getStripeClient, type PaidPlanId } from '../server/stripe.js';

const MAX_WEBHOOK_BYTES = 1024 * 1024;

export const config = {
  api: {
    bodyParser: false
  }
};

function headerValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function getObjectId(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'id' in value) {
    return String((value as { id: string }).id);
  }

  return '';
}

function getPaidPlanFromMetadata(value: unknown): PaidPlanId | null {
  return value === 'basic' || value === 'pro' ? value : null;
}

function getSubscriptionPlan(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  return getPlanFromPriceId(priceId) || getPaidPlanFromMetadata(subscription.metadata?.plan);
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription) {
  const seconds = (subscription as any).current_period_end;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;

      if (size > MAX_WEBHOOK_BYTES) {
        reject(new Error('Webhook payload too large'));
        return;
      }

      chunks.push(buffer);
    });

    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function saveSubscription(sql: any, subscription: Stripe.Subscription, forcedPlan?: PlanId) {
  const stripeCustomerId = getObjectId(subscription.customer);
  const stripeSubscriptionId = subscription.id;
  const paidPlan = getSubscriptionPlan(subscription);
  const nextPlan = forcedPlan || paidPlan;

  if (!stripeCustomerId || !nextPlan) {
    console.error('Stripe webhook subscription without mapped plan/customer', {
      stripeCustomerId,
      stripeSubscriptionId,
      priceId: subscription.items.data[0]?.price?.id
    });
    return;
  }

  await saveStripeSubscriptionState(sql, {
    authUserId: subscription.metadata?.auth_user_id || subscription.metadata?.clerk_user_id || null,
    stripeCustomerId,
    stripeSubscriptionId,
    plan: nextPlan,
    subscriptionStatus: forcedPlan === 'trial' ? 'canceled' : subscription.status,
    currentPeriodEnd: forcedPlan === 'trial' ? null : getCurrentPeriodEnd(subscription)
  });
}

async function markInvoicePaymentFailed(sql: any, invoice: Stripe.Invoice) {
  const stripeCustomerId = getObjectId(invoice.customer);
  const stripeSubscriptionId = getObjectId((invoice as any).subscription);

  if (!stripeCustomerId && !stripeSubscriptionId) return;

  await markStripeSubscriptionPastDue(sql, stripeCustomerId, stripeSubscriptionId);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('Missing required env: STRIPE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook indisponivel' });
  }

  const signature = headerValue(req.headers['stripe-signature']);
  if (!signature) {
    return res.status(400).json({ error: 'Assinatura ausente' });
  }

  let event: Stripe.Event;

  try {
    const rawBody = await readRawBody(req);
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error('Stripe webhook signature failed:', error);
    return res.status(400).json({ error: 'Webhook invalido' });
  }

  try {
    const sql = getSql();
    const stripe = getStripeClient();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = getObjectId(session.subscription);

        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await saveSubscription(sql, subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        await saveSubscription(sql, event.data.object as Stripe.Subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        await saveSubscription(sql, event.data.object as Stripe.Subscription, 'trial');
        break;
      }

      case 'invoice.payment_failed': {
        await markInvoicePaymentFailed(sql, event.data.object as Stripe.Invoice);
        break;
      }

      default:
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook handler failed:', error);
    return res.status(500).json({ error: 'Webhook indisponivel' });
  }
}
