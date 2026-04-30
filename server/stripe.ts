import Stripe from 'stripe';

export type PaidPlanId = 'basic' | 'pro';

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('Missing required env: STRIPE_SECRET_KEY');
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

export function getPriceIdForPlan(plan: PaidPlanId) {
  const priceId = plan === 'basic'
    ? process.env.STRIPE_PRICE_ID_BASIC
    : process.env.STRIPE_PRICE_ID_PRO;

  if (!priceId) {
    throw new Error(`Missing Stripe price id for plan: ${plan}`);
  }

  return priceId;
}

export function getPlanFromPriceId(priceId?: string | null): PaidPlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ID_BASIC) return 'basic';
  if (priceId === process.env.STRIPE_PRICE_ID_PRO) return 'pro';
  return null;
}
