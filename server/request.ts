import { verifyToken } from '@clerk/backend';

export const GENERIC_BILLING_ERROR = 'Nao foi possivel processar billing';

export function setCorsHeaders(res: any, methods = 'OPTIONS,POST') {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.PRODUCTION_URL || '');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Stripe-Signature');
}

export function parseBody(reqBody: any) {
  return typeof reqBody === 'string' ? JSON.parse(reqBody || '{}') : (reqBody || {});
}

export function getBearerToken(authHeader: any) {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (typeof rawHeader !== 'string') return '';

  const match = rawHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export async function requireClerkUser(req: any) {
  const token = getBearerToken(req.headers['authorization']);
  if (!token) {
    const error = new Error('Missing bearer token');
    (error as any).statusCode = 401;
    throw error;
  }

  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  if (!clerkSecretKey) {
    throw new Error('Missing required env: CLERK_SECRET_KEY');
  }

  const verifiedToken = await verifyToken(token, { secretKey: clerkSecretKey });
  const userId = verifiedToken.sub || '';

  if (!userId) {
    const error = new Error('Token without user id');
    (error as any).statusCode = 401;
    throw error;
  }

  return { userId };
}

export function getAppOrigin(req: any) {
  if (process.env.PRODUCTION_URL) return process.env.PRODUCTION_URL.replace(/\/$/, '');

  const rawHost = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
  const forwardedProto = Array.isArray(req.headers['x-forwarded-proto'])
    ? req.headers['x-forwarded-proto'][0]
    : req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' && forwardedProto ? forwardedProto : 'http';

  return rawHost ? `${proto}://${rawHost}` : 'http://localhost:5173';
}

export function sendGenericError(res: any, error: unknown, status = 500) {
  console.error(GENERIC_BILLING_ERROR, error);
  return res.status(status).json({ error: GENERIC_BILLING_ERROR });
}
