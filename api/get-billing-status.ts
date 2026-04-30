import { buildSafeBillingStatus, getBillingStatusForUser, saveStripeSubscriptionState } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { requireClerkUser, setCorsHeaders } from '../server/request.js';
import { getPlanFromPriceId, getStripeClient, type PaidPlanId } from '../server/stripe.js';

const GENERIC_ERROR = 'Nao foi possivel carregar billing';

function queryValue(value: any) {
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

function getSubscriptionPlan(subscription: any) {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  return getPlanFromPriceId(priceId) || getPaidPlanFromMetadata(subscription?.metadata?.plan);
}

function getCurrentPeriodEnd(subscription: any) {
  const seconds = subscription?.current_period_end;
  return typeof seconds === 'number' ? new Date(seconds * 1000) : null;
}

async function syncCheckoutSession(sql: any, userId: string, sessionId: string) {
  if (!sessionId) return;

  const stripe = getStripeClient();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription']
  });

  if (session.metadata?.clerk_user_id !== userId) {
    console.error('Checkout session user mismatch', { userId, sessionId });
    return;
  }

  const subscription = typeof session.subscription === 'string'
    ? await stripe.subscriptions.retrieve(session.subscription)
    : session.subscription;

  if (!subscription) return;

  const plan = getSubscriptionPlan(subscription);
  const stripeCustomerId = getObjectId(subscription.customer || session.customer);

  if (!plan || !stripeCustomerId) {
    console.error('Checkout session without mapped plan/customer', { sessionId });
    return;
  }

  await saveStripeSubscriptionState(sql, {
    clerkUserId: userId,
    stripeCustomerId,
    stripeSubscriptionId: subscription.id,
    plan,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: getCurrentPeriodEnd(subscription)
  });
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, 'OPTIONS,GET');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const { userId } = await requireClerkUser(req);
    const sql = getSql();
    const checkoutSessionId = queryValue(req.query?.session_id);

    if (typeof checkoutSessionId === 'string' && checkoutSessionId) {
      await syncCheckoutSession(sql, userId, checkoutSessionId).catch(syncError => {
        console.error('Checkout billing sync failed:', syncError);
      });
    }

    const status = await getBillingStatusForUser(sql, userId);
    return res.status(200).json(status);
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Billing status auth failed:', error);
      return res.status(401).json({
        ...buildSafeBillingStatus({ subscriptionStatus: 'unauthorized' }),
        error: 'Autenticacao necessaria'
      });
    }

    console.error(GENERIC_ERROR, error);
    return res.status(200).json({
      ...buildSafeBillingStatus({ subscriptionStatus: 'unavailable' }),
      error: GENERIC_ERROR
    });
  }
}
