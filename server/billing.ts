export type PlanId = 'trial' | 'basic' | 'pro';
export type EffectivePlanId = PlanId | 'none';

export type BillingStatus = {
  plan: PlanId;
  effectivePlan: EffectivePlanId;
  subscriptionStatus: string;
  hasActivePlan: boolean;
  canManageSubscription: boolean;
  limits: PlanLimits;
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

export type PlanLimits = {
  aiDailyLimit: number;
  projectLimit: number | null;
  balloonsPerProjectLimit: number;
};

export type BillingPermissionResult = {
  allowed: boolean;
  status: BillingStatus;
  reason?: 'trial_expired' | 'daily_limit' | 'project_limit' | 'balloon_limit';
};

type BillingRow = {
  clerk_user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: PlanId;
  subscription_status: string;
  trial_started_at: string | Date | null;
  trial_ends_at: string | Date | null;
  current_period_end: string | Date | null;
  ai_usage_date: string | Date | null;
  ai_usage_count: number | string | null;
};

const PLAN_LIMITS: Record<PlanId, PlanLimits> = {
  trial: {
    aiDailyLimit: 3,
    projectLimit: 1,
    balloonsPerProjectLimit: 30
  },
  basic: {
    aiDailyLimit: 15,
    projectLimit: 3,
    balloonsPerProjectLimit: 100
  },
  pro: {
    aiDailyLimit: 50,
    projectLimit: null,
    balloonsPerProjectLimit: 500
  }
};

const LOCKED_LIMITS: PlanLimits = {
  aiDailyLimit: 0,
  projectLimit: 0,
  balloonsPerProjectLimit: 0
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const BILLING_COLUMNS = `
  clerk_user_id,
  stripe_customer_id,
  stripe_subscription_id,
  plan,
  subscription_status,
  trial_started_at,
  trial_ends_at,
  current_period_end,
  ai_usage_date,
  ai_usage_count
`;

function toIso(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? date.toISOString() : null;
}

function toUsageDateString(value: string | Date | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function getUsageDateString(now = new Date()) {
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

function getEffectivePlan(row: BillingRow, now = Date.now()): EffectivePlanId {
  const plan = row.plan || 'trial';
  const paidActive = plan !== 'trial' && ACTIVE_SUBSCRIPTION_STATUSES.has(row.subscription_status);
  if (paidActive) return plan;

  const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  if (trialEndsAt > now) return 'trial';

  return 'none';
}

function getLimitsForEffectivePlan(effectivePlan: EffectivePlanId): PlanLimits {
  return effectivePlan === 'none' ? LOCKED_LIMITS : PLAN_LIMITS[effectivePlan];
}

function numberOr(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function nonNegativeNumberOr(value: unknown, fallback: number) {
  return Math.max(0, numberOr(value, fallback));
}

export function buildSafeBillingStatus(overrides: Partial<BillingStatus> = {}): BillingStatus {
  const today = getUsageDateString();
  const overrideLimits = overrides.limits;
  const limits = {
    aiDailyLimit: nonNegativeNumberOr(overrideLimits?.aiDailyLimit, LOCKED_LIMITS.aiDailyLimit),
    projectLimit: overrideLimits?.projectLimit === null
      ? null
      : nonNegativeNumberOr(overrideLimits?.projectLimit, LOCKED_LIMITS.projectLimit ?? 0),
    balloonsPerProjectLimit: nonNegativeNumberOr(
      overrideLimits?.balloonsPerProjectLimit,
      LOCKED_LIMITS.balloonsPerProjectLimit
    )
  };
  const usageLimit = nonNegativeNumberOr(overrides.usage?.limit, limits.aiDailyLimit);
  const usageCount = nonNegativeNumberOr(overrides.usage?.count, 0);

  return {
    plan: overrides.plan || 'trial',
    effectivePlan: overrides.effectivePlan || 'none',
    subscriptionStatus: overrides.subscriptionStatus || 'unavailable',
    hasActivePlan: overrides.hasActivePlan ?? false,
    canManageSubscription: overrides.canManageSubscription ?? false,
    limits: {
      aiDailyLimit: limits.aiDailyLimit,
      projectLimit: limits.projectLimit,
      balloonsPerProjectLimit: limits.balloonsPerProjectLimit
    },
    usage: {
      date: overrides.usage?.date || today,
      count: usageCount,
      limit: usageLimit,
      remaining: nonNegativeNumberOr(overrides.usage?.remaining, Math.max(0, usageLimit - usageCount)),
      resetAt: nonNegativeNumberOr(overrides.usage?.resetAt, getUsageResetAt(today))
    },
    trial: {
      startedAt: overrides.trial?.startedAt || null,
      endsAt: overrides.trial?.endsAt || null,
      isActive: overrides.trial?.isActive ?? false,
      msRemaining: overrides.trial?.msRemaining ?? 0
    },
    currentPeriodEnd: overrides.currentPeriodEnd || null
  };
}

function buildBillingStatus(row: BillingRow): BillingStatus {
  const now = Date.now();
  const today = getUsageDateString();
  const rowUsageDate = toUsageDateString(row.ai_usage_date);
  const usageCount = rowUsageDate === today ? Number(row.ai_usage_count || 0) : 0;
  const effectivePlan = getEffectivePlan(row, now);
  const limits = getLimitsForEffectivePlan(effectivePlan);
  const trialEndsAtMs = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : 0;
  const trialMsRemaining = Math.max(0, trialEndsAtMs - now);

  return {
    plan: row.plan || 'trial',
    effectivePlan,
    subscriptionStatus: row.subscription_status || 'trialing',
    hasActivePlan: effectivePlan !== 'none',
    canManageSubscription: Boolean(row.stripe_customer_id),
    limits,
    usage: {
      date: today,
      count: usageCount,
      limit: limits.aiDailyLimit,
      remaining: Math.max(0, limits.aiDailyLimit - usageCount),
      resetAt: getUsageResetAt(today)
    },
    trial: {
      startedAt: toIso(row.trial_started_at),
      endsAt: toIso(row.trial_ends_at),
      isActive: effectivePlan === 'trial',
      msRemaining: trialMsRemaining
    },
    currentPeriodEnd: toIso(row.current_period_end)
  };
}

async function selectBillingRow(sql: any, userId: string): Promise<BillingRow | null> {
  const rows = await sql.query(`SELECT ${BILLING_COLUMNS} FROM user_billing WHERE clerk_user_id = $1 LIMIT 1`, [userId]);
  return rows[0] || null;
}

export async function ensureBillingAccount(sql: any, userId: string): Promise<BillingRow> {
  const today = getUsageDateString();
  const insertedRows = await sql`
    INSERT INTO user_billing (clerk_user_id, ai_usage_date)
    VALUES (${userId}, ${today}::date)
    ON CONFLICT (clerk_user_id) DO NOTHING
    RETURNING clerk_user_id, stripe_customer_id, stripe_subscription_id, plan, subscription_status,
      trial_started_at, trial_ends_at, current_period_end, ai_usage_date, ai_usage_count
  `;

  if (insertedRows[0]) return insertedRows[0] as BillingRow;

  const existingRow = await selectBillingRow(sql, userId);
  if (!existingRow) {
    throw new Error('Billing account not found after insert');
  }

  return existingRow;
}

export async function getBillingStatusForUser(sql: any, userId: string) {
  const row = await ensureBillingAccount(sql, userId);
  return buildBillingStatus(row);
}

export async function setStripeCustomerForUser(sql: any, userId: string, stripeCustomerId: string) {
  const [row] = await sql`
    UPDATE user_billing
    SET stripe_customer_id = ${stripeCustomerId}
    WHERE clerk_user_id = ${userId}
    RETURNING clerk_user_id, stripe_customer_id, stripe_subscription_id, plan, subscription_status,
      trial_started_at, trial_ends_at, current_period_end, ai_usage_date, ai_usage_count
  `;

  return row as BillingRow | undefined;
}

export async function markStripeSubscriptionPastDue(sql: any, stripeCustomerId: string, stripeSubscriptionId: string) {
  if (!stripeCustomerId && !stripeSubscriptionId) return;

  await sql`
    UPDATE user_billing
    SET subscription_status = 'past_due'
    WHERE stripe_customer_id = ${stripeCustomerId}
      OR stripe_subscription_id = ${stripeSubscriptionId}
  `;
}

export async function saveStripeSubscriptionState(sql: any, data: {
  clerkUserId?: string | null;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: PlanId;
  subscriptionStatus: string;
  currentPeriodEnd?: Date | null;
}) {
  if (data.clerkUserId) {
    await ensureBillingAccount(sql, data.clerkUserId);
    await sql`
      UPDATE user_billing
      SET stripe_customer_id = ${data.stripeCustomerId},
        stripe_subscription_id = ${data.stripeSubscriptionId},
        plan = ${data.plan},
        subscription_status = ${data.subscriptionStatus},
        current_period_end = ${data.currentPeriodEnd ? data.currentPeriodEnd.toISOString() : null}::timestamptz
      WHERE clerk_user_id = ${data.clerkUserId}
    `;
    return;
  }

  await sql`
    UPDATE user_billing
    SET stripe_subscription_id = ${data.stripeSubscriptionId},
      plan = ${data.plan},
      subscription_status = ${data.subscriptionStatus},
      current_period_end = ${data.currentPeriodEnd ? data.currentPeriodEnd.toISOString() : null}::timestamptz
    WHERE stripe_customer_id = ${data.stripeCustomerId}
      OR stripe_subscription_id = ${data.stripeSubscriptionId}
  `;
}

export async function consumeAiUsageSlot(sql: any, userId: string): Promise<BillingPermissionResult> {
  const status = await getBillingStatusForUser(sql, userId);
  if (!status.hasActivePlan || status.limits.aiDailyLimit <= 0) {
    return { allowed: false, status, reason: 'trial_expired' };
  }

  if (status.usage.count >= status.limits.aiDailyLimit) {
    return { allowed: false, status, reason: 'daily_limit' };
  }

  const today = getUsageDateString();
  const [updatedRow] = await sql`
    UPDATE user_billing
    SET ai_usage_date = ${today}::date,
      ai_usage_count = CASE
        WHEN ai_usage_date <> ${today}::date THEN 1
        ELSE ai_usage_count + 1
      END
    WHERE clerk_user_id = ${userId}
      AND (
        ai_usage_date <> ${today}::date
        OR ai_usage_count < ${status.limits.aiDailyLimit}
      )
    RETURNING clerk_user_id, stripe_customer_id, stripe_subscription_id, plan, subscription_status,
      trial_started_at, trial_ends_at, current_period_end, ai_usage_date, ai_usage_count
  `;

  if (!updatedRow) {
    const latestStatus = await getBillingStatusForUser(sql, userId);
    return { allowed: false, status: latestStatus, reason: 'daily_limit' };
  }

  return { allowed: true, status: buildBillingStatus(updatedRow as BillingRow) };
}

export async function refundAiUsageSlot(sql: any, userId: string) {
  const today = getUsageDateString();
  await sql`
    UPDATE user_billing
    SET ai_usage_count = GREATEST(ai_usage_count - 1, 0)
    WHERE clerk_user_id = ${userId}
      AND ai_usage_date = ${today}::date
      AND ai_usage_count > 0
  `;
}

export async function checkProjectCreationAllowed(sql: any, userId: string): Promise<BillingPermissionResult> {
  const status = await getBillingStatusForUser(sql, userId);
  if (!status.hasActivePlan) {
    return { allowed: false, status, reason: 'trial_expired' };
  }

  if (status.limits.projectLimit === null) {
    return { allowed: true, status };
  }

  const [row] = await sql`
    SELECT COUNT(*)::int AS count
    FROM projects
    WHERE user_id = ${userId}
  `;
  const projectCount = Number(row?.count || 0);

  if (projectCount >= status.limits.projectLimit) {
    return { allowed: false, status, reason: 'project_limit' };
  }

  return { allowed: true, status };
}

export async function checkIdeaSaveAllowed(sql: any, userId: string, projectId: string, incomingIdeaIds: string[], deletedIdeaIds: string[]): Promise<BillingPermissionResult> {
  const status = await getBillingStatusForUser(sql, userId);
  const existingRows = await sql`
    SELECT id
    FROM ideas
    WHERE user_id = ${userId} AND project_id = ${projectId}
  `;
  const existingIds = new Set(existingRows.map((row: any) => String(row.id)));
  const deletedIds = new Set(deletedIdeaIds);
  const incomingIds = new Set(incomingIdeaIds.filter(id => !deletedIds.has(id)));
  const newIds = Array.from(incomingIds).filter(id => !existingIds.has(id));
  const deletedExistingCount = Array.from(deletedIds).filter(id => existingIds.has(id)).length;
  const finalCount = existingIds.size - deletedExistingCount + newIds.length;

  if (!status.hasActivePlan && newIds.length > 0) {
    return { allowed: false, status, reason: 'trial_expired' };
  }

  const limit = status.limits.balloonsPerProjectLimit;
  if (newIds.length > 0 && finalCount > limit) {
    return { allowed: false, status, reason: 'balloon_limit' };
  }

  return { allowed: true, status };
}
