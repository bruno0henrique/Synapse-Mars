import { ensureBillingAccount } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { getAppOrigin, requireAuthenticatedUser, setCorsHeaders } from '../server/request.js';
import { getStripeClient } from '../server/stripe.js';

const GENERIC_ERROR = 'Nao foi possivel abrir gerenciamento';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res, 'OPTIONS,POST');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const { userId } = await requireAuthenticatedUser(req);
    const sql = getSql();
    const billingRow = await ensureBillingAccount(sql, userId);

    if (!billingRow.stripe_customer_id) {
      return res.status(404).json({ error: GENERIC_ERROR });
    }

    const stripe = getStripeClient();
    const origin = getAppOrigin(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: billingRow.stripe_customer_id,
      return_url: `${origin}/?billing=portal`
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Portal auth failed:', error);
      return res.status(401).json({ error: 'Autenticacao necessaria' });
    }

    console.error(GENERIC_ERROR, error);
    return res.status(500).json({ error: GENERIC_ERROR });
  }
}
