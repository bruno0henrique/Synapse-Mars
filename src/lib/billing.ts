import type { EffectivePlanId, PaidPlanId, PlanId } from './plans';

export type BillingStatus = {
  plan: PlanId;
  effectivePlan: EffectivePlanId;
  subscriptionStatus: string;
  hasActivePlan: boolean;
  canManageSubscription: boolean;
  limits: {
    aiDailyLimit: number;
    projectLimit: number | null;
    balloonsPerProjectLimit: number;
  };
  usage: {
    date: string;
    count: number;
    limit: number;
    remaining: number;
    resetAt: number;
  };
  trial: {
    startedAt: string | null;
    endsAt: string | null;
    isActive: boolean;
    msRemaining: number;
  };
  currentPeriodEnd: string | null;
};

export type BillingLoadState = 'idle' | 'loading' | 'success' | 'error';

export class BillingRequestError extends Error {
  status: number;
  code?: string;
  billing?: BillingStatus;

  constructor(message: string, status: number, code?: string, billing?: BillingStatus) {
    super(message);
    this.name = 'BillingRequestError';
    this.status = status;
    this.code = code;
    this.billing = billing;
  }
}

const PLAN_IDS: readonly PlanId[] = ['trial', 'basic', 'pro'];
const EFFECTIVE_PLAN_IDS: readonly EffectivePlanId[] = ['trial', 'basic', 'pro', 'none'];

function getUsageDateString(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const year = parts.find(part => part.type === 'year')?.value || '1970';
  const month = parts.find(part => part.type === 'month')?.value || '01';
  const day = parts.find(part => part.type === 'day')?.value || '01';

  return `${year}-${month}-${day}`;
}

function getUsageResetAt(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number);
  return Date.UTC(year, month - 1, day + 1, 3, 0, 0);
}

function numberOr(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function nonNegativeNumberOr(value: unknown, fallback: number) {
  return Math.max(0, numberOr(value, fallback));
}

function nullableStringOr(value: unknown, fallback: string | null) {
  return typeof value === 'string' ? value : fallback;
}

export function createSafeBillingStatus(): BillingStatus {
  const today = getUsageDateString();

  return {
    plan: 'trial',
    effectivePlan: 'none',
    subscriptionStatus: 'unavailable',
    hasActivePlan: false,
    canManageSubscription: false,
    limits: {
      aiDailyLimit: 0,
      projectLimit: 0,
      balloonsPerProjectLimit: 0
    },
    usage: {
      date: today,
      count: 0,
      limit: 0,
      remaining: 0,
      resetAt: getUsageResetAt(today)
    },
    trial: {
      startedAt: null,
      endsAt: null,
      isActive: false,
      msRemaining: 0
    },
    currentPeriodEnd: null
  };
}

export function normalizeBillingStatus(data: any): BillingStatus {
  const fallback = createSafeBillingStatus();
  const limitsData = data?.limits || {};
  const usageData = data?.usage || {};
  const trialData = data?.trial || {};
  const aiDailyLimit = nonNegativeNumberOr(limitsData.aiDailyLimit, fallback.limits.aiDailyLimit);
  const usageLimit = nonNegativeNumberOr(usageData.limit, aiDailyLimit);
  const usageCount = nonNegativeNumberOr(usageData.count, fallback.usage.count);

  return {
    plan: PLAN_IDS.includes(data?.plan) ? data.plan : fallback.plan,
    effectivePlan: EFFECTIVE_PLAN_IDS.includes(data?.effectivePlan)
      ? data.effectivePlan
      : fallback.effectivePlan,
    subscriptionStatus: typeof data?.subscriptionStatus === 'string'
      ? data.subscriptionStatus
      : fallback.subscriptionStatus,
    hasActivePlan: typeof data?.hasActivePlan === 'boolean'
      ? data.hasActivePlan
      : fallback.hasActivePlan,
    canManageSubscription: typeof data?.canManageSubscription === 'boolean'
      ? data.canManageSubscription
      : fallback.canManageSubscription,
    limits: {
      aiDailyLimit,
      projectLimit: limitsData.projectLimit === null
        ? null
        : nonNegativeNumberOr(limitsData.projectLimit, fallback.limits.projectLimit || 0),
      balloonsPerProjectLimit: nonNegativeNumberOr(
        limitsData.balloonsPerProjectLimit,
        fallback.limits.balloonsPerProjectLimit
      )
    },
    usage: {
      date: typeof usageData.date === 'string' ? usageData.date : fallback.usage.date,
      count: usageCount,
      limit: usageLimit,
      remaining: nonNegativeNumberOr(
        usageData.remaining,
        Math.max(0, usageLimit - usageCount)
      ),
      resetAt: nonNegativeNumberOr(usageData.resetAt, fallback.usage.resetAt)
    },
    trial: {
      startedAt: nullableStringOr(trialData.startedAt, fallback.trial.startedAt),
      endsAt: nullableStringOr(trialData.endsAt, fallback.trial.endsAt),
      isActive: typeof trialData.isActive === 'boolean'
        ? trialData.isActive
        : fallback.trial.isActive,
      msRemaining: nonNegativeNumberOr(trialData.msRemaining, fallback.trial.msRemaining)
    },
    currentPeriodEnd: nullableStringOr(data?.currentPeriodEnd, fallback.currentPeriodEnd)
  };
}

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function assertOk(response: Response, fallbackMessage: string) {
  const data = await readJson(response);
  const billingPayload = data.billing || (data.usage || data.limits || data.trial ? data : undefined);

  if (!response.ok) {
    throw new BillingRequestError(
      typeof data.error === 'string' ? data.error : fallbackMessage,
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      billingPayload ? normalizeBillingStatus(billingPayload) : undefined
    );
  }

  return data;
}

export async function fetchBillingStatus(
  headers?: HeadersInit,
  options?: { checkoutSessionId?: string | null }
): Promise<BillingStatus> {
  const params = new URLSearchParams();
  if (options?.checkoutSessionId) {
    params.set('session_id', options.checkoutSessionId);
  }

  const query = params.toString();
  const url = query
    ? `/api/get-billing-status?${query}`
    : '/api/get-billing-status';
  const response = await fetch(url, { headers });
  const data = await readJson(response);
  const status = normalizeBillingStatus(data);

  if (!response.ok || data.error) {
    console.error('Erro ao carregar billing:', data.error || response.statusText);
    throw new BillingRequestError(
      typeof data.error === 'string' ? data.error : 'Nao foi possivel carregar billing',
      response.status,
      typeof data.code === 'string' ? data.code : undefined,
      status
    );
  }

  return status;
}

export async function createCheckoutSession(plan: PaidPlanId, headers?: HeadersInit) {
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Content-Type', 'application/json');

  const response = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify({ plan })
  });
  const data = await assertOk(response, 'Nao foi possivel iniciar assinatura');

  if (typeof data.url !== 'string') {
    throw new BillingRequestError('Nao foi possivel iniciar assinatura', response.status);
  }

  return data.url;
}

export async function createCustomerPortal(headers?: HeadersInit) {
  const response = await fetch('/api/create-customer-portal', {
    method: 'POST',
    headers
  });
  const data = await assertOk(response, 'Nao foi possivel abrir gerenciamento');

  if (typeof data.url !== 'string') {
    throw new BillingRequestError('Nao foi possivel abrir gerenciamento', response.status);
  }

  return data.url;
}
