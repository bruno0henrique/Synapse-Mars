import { ensureBillingAccount, getBillingStatusForUser, setStripeCustomerForUser } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { getAppOrigin, parseBody, requireClerkUser, setCorsHeaders } from '../server/request.js';
import { getPriceIdForPlan, getStripeClient, type PaidPlanId } from '../server/stripe.js';

const GENERIC_ERROR = 'Nao foi possivel iniciar assinatura';

function isPaidPlan(value: unknown): value is PaidPlanId {
  return value === 'basic' || value === 'pro';
}

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const { userId } = await requireClerkUser(req);
    const body = parseBody(req.body);
    const plan = body.plan;

    if (!isPaidPlan(plan)) {
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const sql = getSql();
    const billingRow = await ensureBillingAccount(sql, userId);
    const billingStatus = await getBillingStatusForUser(sql, userId);

    if (billingStatus.effectivePlan === 'basic' || billingStatus.effectivePlan === 'pro') {
      return res.status(409).json({
        error: GENERIC_ERROR,
        code: 'SUBSCRIPTION_ALREADY_ACTIVE'
      });
    }

    const stripe = getStripeClient();
    let customerId = billingRow.stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: {
          clerk_user_id: userId
        }
      });
      customerId = customer.id;
      await setStripeCustomerForUser(sql, userId, customerId);
    }

    const origin = getAppOrigin(req);
    const priceId = getPriceIdForPlan(plan);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      locale: 'pt-BR',
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      metadata: {
        clerk_user_id: userId,
        plan
      },
      subscription_data: {
        metadata: {
          clerk_user_id: userId,
          plan
        }
      },
      success_url: `${origin}/?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?billing=cancelled`
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Checkout auth failed:', error);
      return res.status(401).json({ error: 'Autenticacao necessaria' });
    }

    console.error(GENERIC_ERROR, error);
    return res.status(500).json({ error: GENERIC_ERROR });
  }
}
