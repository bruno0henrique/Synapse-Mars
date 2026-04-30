import React, { useEffect, useState } from 'react';
import { Check, Clock, CreditCard, Crown, Loader2, Sparkles, X, Zap } from 'lucide-react';
import type { BillingLoadState, BillingStatus } from '../../lib/billing';
import { PLAN_OPTIONS, type PaidPlanId, type PlanId } from '../../lib/plans';

interface PlansModalProps {
  isOpen: boolean;
  onClose: () => void;
  billingStatus: BillingStatus;
  billingLoadState: BillingLoadState;
  billingError: string | null;
  onSelectPlan: (plan: PaidPlanId) => void | Promise<void>;
  onManageSubscription: () => void | Promise<void>;
  isActionLoading?: boolean;
}

type IconComponent = React.ComponentType<{ size?: number; className?: string }>;

const planIcons: Record<PlanId, IconComponent> = {
  trial: Sparkles,
  basic: Zap,
  pro: Crown
};

const PLAN_DISPLAY_ORDER: PlanId[] = ['pro', 'basic', 'trial'];

const PLAN_VISUAL_COPY: Record<PlanId, {
  name: string;
  badge: string;
  benefit: string;
  detail: string;
}> = {
  trial: {
    name: 'Gratuito',
    badge: '7 dias',
    benefit: 'Explore o fluxo neural sem compromisso.',
    detail: 'Ideal para validar a experiência antes de assinar.'
  },
  basic: {
    name: 'Básico',
    badge: 'Essencial',
    benefit: 'Mais espaço para organizar mapas pequenos.',
    detail: 'Para quem usa IA em ciclos leves de planejamento.'
  },
  pro: {
    name: 'Pro',
    badge: 'Mais recomendado',
    benefit: 'O melhor equilíbrio para usar IA com frequência.',
    detail: 'Feito para mapas maiores, rotina de análise e expansão.'
  }
};

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

function formatTimeUntil(ms: number) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const visibleMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${String(visibleMinutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  }

  return `${seconds}s`;
}

function getSafeUsage(status: BillingStatus) {
  const usage = (status as Partial<BillingStatus>).usage;
  const limit = Number(usage?.limit);
  const remaining = Number(usage?.remaining);
  const resetAt = Number(usage?.resetAt);

  return {
    limit: Number.isFinite(limit) ? Math.max(0, limit) : 0,
    remaining: Number.isFinite(remaining) ? Math.max(0, remaining) : 0,
    resetAt: Number.isFinite(resetAt) ? Math.max(0, resetAt) : 0
  };
}

function getNotice(status: BillingStatus, now: number, loadState: BillingLoadState, billingError: string | null) {
  if (loadState === 'loading') {
    return {
      title: 'Atualizando plano',
      text: 'Buscando seu status de assinatura.'
    };
  }

  if (loadState === 'error') {
    return {
      title: 'Status indisponivel',
      text: billingError || 'Nao foi possivel atualizar agora. Voce ainda pode escolher um plano.'
    };
  }

  if (!status.hasActivePlan) {
    return {
      title: 'Sem plano ativo',
      text: 'Assine um plano para liberar IA e recursos premium.'
    };
  }

  const usage = getSafeUsage(status);
  const msUntilReset = Math.max(0, usage.resetAt - now);
  if (usage.limit > 0 && usage.remaining <= 0 && msUntilReset > 0) {
    return {
      title: 'Limite diario atingido',
      text: `Novo uso de IA libera em ${formatTimeUntil(msUntilReset)}.`
    };
  }

  if (status.effectivePlan === 'trial') {
    return {
      title: 'Gratuito ativo',
      text: 'Seu plano gratuito esta ativo.'
    };
  }

  return {
    title: 'Plano ativo',
    text: 'Sua assinatura esta ativa no Synapse IA.'
  };
}

function StatusCard({
  title,
  text,
  isLoading
}: {
  title: string;
  text: string;
  isLoading: boolean;
}) {
  return (
    <section className="box-border w-full min-w-0 rounded-[1.35rem] border border-purple-300/15 bg-white/[0.055] shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:rounded-[1.75rem]">
      <div className="box-border flex w-full min-w-0 items-center gap-4 !p-4 sm:gap-5 sm:!p-5 lg:!p-6">
        <span className="box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-purple-300/15 bg-purple-500/15 !p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:h-14 sm:w-14">
          <Clock className="text-purple-300" size={22} />
        </span>

        <div className="box-border flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="min-w-0 text-base font-bold leading-6 text-white sm:text-lg">
            {title}
          </p>
          <p className="min-w-0 text-sm leading-6 text-gray-400">
            {text}
          </p>
        </div>

        {isLoading && (
          <span className="box-border hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/5 sm:inline-flex">
            <Loader2 className="animate-spin text-purple-300" size={20} />
          </span>
        )}
      </div>
    </section>
  );
}

function PriceBox({
  price,
  usageLimit,
  benefit,
  highlighted
}: {
  price: string;
  usageLimit: string;
  benefit: string;
  highlighted?: boolean;
}) {
  return (
    <section
      className={cx(
        'box-border flex w-full min-w-0 flex-col gap-2.5 rounded-2xl border !p-4 sm:!p-5',
        highlighted
          ? 'border-purple-300/25 bg-purple-500/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
          : 'border-white/10 bg-black/20'
      )}
    >
      <p className="min-w-0 break-words text-2xl font-bold leading-8 text-white sm:text-3xl sm:leading-9">
        {price}
      </p>
      <p className="min-w-0 text-xs font-bold uppercase leading-5 tracking-widest text-purple-300">
        {usageLimit}
      </p>
      <p className="min-w-0 text-sm leading-5 text-gray-400">
        {benefit}
      </p>
    </section>
  );
}

function PlanCard({
  plan,
  billingStatus,
  onSelectPlan,
  onManageSubscription,
  isActionLoading
}: {
  plan: (typeof PLAN_OPTIONS)[number];
  billingStatus: BillingStatus;
  onSelectPlan: (plan: PaidPlanId) => void | Promise<void>;
  onManageSubscription: () => void | Promise<void>;
  isActionLoading?: boolean;
}) {
  const Icon = planIcons[plan.id];
  const visual = PLAN_VISUAL_COPY[plan.id];
  const isCurrent = billingStatus?.effectivePlan === plan.id;
  const hasPaidPlan = billingStatus?.effectivePlan === 'basic' || billingStatus?.effectivePlan === 'pro';
  const isPaidOption = plan.id === 'basic' || plan.id === 'pro';
  const shouldOpenPortal = Boolean(hasPaidPlan && isPaidOption && billingStatus?.canManageSubscription);
  const disabled = isActionLoading || !isPaidOption || (isCurrent && !shouldOpenPortal);
  const ctaLabel = isCurrent && shouldOpenPortal
    ? 'Gerenciar assinatura'
    : isCurrent
      ? 'Plano atual'
      : shouldOpenPortal
      ? 'Gerenciar assinatura'
      : plan.ctaLabel;

  const handleClick = () => {
    if (!isPaidOption || disabled) return;
    if (shouldOpenPortal) {
      void onManageSubscription();
      return;
    }

    if (plan.id === 'basic' || plan.id === 'pro') {
      void onSelectPlan(plan.id);
    }
  };

  return (
    <article
      className={cx(
        'box-border flex h-full w-full min-w-0 rounded-[1.75rem] border bg-white/[0.045] shadow-[0_22px_70px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-all duration-300 sm:rounded-[2rem]',
        plan.highlighted
          ? 'border-purple-300/40 bg-purple-500/[0.07] shadow-[0_26px_80px_rgba(0,0,0,0.42),0_0_0_1px_rgba(216,180,254,0.10),0_0_34px_rgba(168,85,247,0.13)]'
          : 'border-white/10 hover:border-white/15 hover:bg-white/[0.06]'
      )}
    >
      <div className="box-border flex w-full min-w-0 flex-col gap-4 !p-5 sm:min-h-[430px] sm:gap-5 sm:!p-6 lg:min-h-[455px] lg:!p-7">
        <header className="box-border flex w-full min-w-0 items-start justify-between gap-4">
          <span
            className={cx(
              'box-border inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border !p-3',
              plan.highlighted
                ? 'border-purple-400/20 bg-purple-500/20'
                : 'border-white/10 bg-white/10'
            )}
          >
            <Icon className={plan.highlighted ? 'text-purple-300' : 'text-gray-300'} size={22} />
          </span>

          <span
            className={cx(
              'box-border inline-flex min-h-9 max-w-full shrink-0 items-center justify-center whitespace-nowrap rounded-full !px-3 !py-2 text-center text-[10px] font-bold uppercase leading-4 tracking-widest',
              isCurrent
                ? 'bg-emerald-500/15 text-emerald-300'
                : plan.highlighted
                  ? 'border border-purple-300/20 bg-purple-300/10 text-purple-100 shadow-[0_0_18px_rgba(168,85,247,0.12)]'
                  : 'bg-white/10 text-gray-300'
            )}
          >
            {isCurrent ? 'Atual' : visual.badge}
          </span>
        </header>

        <div className="box-border flex w-full min-w-0 flex-col gap-2.5">
          <h3 className="min-w-0 text-2xl font-bold leading-8 tracking-tight text-white">
            {visual.name}
          </h3>
          <p className="min-w-0 text-sm leading-6 text-gray-300">
            {visual.detail}
          </p>
        </div>

        <PriceBox
          price={plan.price}
          usageLimit={plan.aiLimitLabel}
          benefit={visual.benefit}
          highlighted={plan.highlighted}
        />

        <ul className="box-border flex w-full min-w-0 flex-col gap-3">
          {plan.features.map((feature) => (
            <li key={feature} className="box-border flex w-full min-w-0 items-start gap-3">
              <span className="!mt-0.5 box-border inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 !p-1.5">
                <Check className="text-emerald-300" size={16} />
              </span>
              <span className="min-w-0 text-sm leading-6 text-gray-300">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="box-border !mt-auto w-full min-w-0 !pt-2">
          <button
            type="button"
            disabled={disabled}
            onClick={handleClick}
            className={cx(
              'box-border inline-flex min-h-[48px] w-full min-w-0 items-center justify-center rounded-2xl !px-5 !py-3 text-center text-sm font-bold leading-5 transition-all duration-200 focus-visible:ring-2 focus-visible:ring-purple-300/45',
              isCurrent
                ? 'bg-white/10 text-white'
                : plan.highlighted
                  ? 'bg-white text-purple-950 shadow-[0_14px_34px_rgba(168,85,247,0.18)] hover:bg-purple-100 disabled:bg-white/40'
                  : 'border border-white/10 bg-white/5 text-white hover:border-purple-300/25 hover:bg-white/10 disabled:text-gray-500'
            )}
          >
            {isActionLoading && isPaidOption ? 'Aguarde...' : ctaLabel}
          </button>
        </div>
      </div>
    </article>
  );
}

export const PlansModal: React.FC<PlansModalProps> = ({
  isOpen,
  onClose,
  billingStatus,
  billingLoadState,
  billingError,
  onSelectPlan,
  onManageSubscription,
  isActionLoading = false
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isOpen) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  if (!isOpen) return null;

  const notice = getNotice(billingStatus, now, billingLoadState, billingError);
  const orderedPlans = PLAN_DISPLAY_ORDER
    .map(planId => PLAN_OPTIONS.find(plan => plan.id === planId))
    .filter((plan): plan is (typeof PLAN_OPTIONS)[number] => Boolean(plan));

  return (
    <div className="fixed inset-0 z-[110] box-border flex items-center justify-center !p-3 animate-in fade-in duration-300">
      <div
        className="absolute inset-0 box-border bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative z-10 box-border flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-6xl min-w-0 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#08070d]/80 shadow-[0_35px_120px_rgba(0,0,0,0.72)] backdrop-blur-2xl animate-in zoom-in-95 duration-300 sm:rounded-[2.25rem] lg:rounded-[2.5rem]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.16),transparent_68%)]" />
        <div className="box-border flex min-h-0 w-full min-w-0 flex-col !p-4 sm:!p-6 lg:!p-8">
          <header className="box-border w-full min-w-0 shrink-0">
            <div className="box-border flex w-full min-w-0 items-start justify-between gap-4 border-b border-white/5 !pb-4 sm:items-center sm:gap-6 sm:!pb-6">
              <div className="box-border flex min-w-0 items-center gap-4 sm:gap-5">
                <span className="box-border inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] border border-purple-400/20 bg-purple-500/20 !p-3 sm:h-16 sm:w-16 sm:rounded-[1.5rem] sm:!p-4">
                  <CreditCard className="text-purple-300" size={26} />
                </span>

                <div className="box-border flex min-w-0 flex-col gap-1.5">
                  <h2 className="min-w-0 text-xl font-bold leading-7 tracking-tight text-white sm:text-2xl">
                    Planos Synapse IA
                  </h2>
                  <p className="min-w-0 text-xs font-bold uppercase leading-5 tracking-widest text-purple-300">
                    Assinatura mensal
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar planos"
                className="box-border inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/5 !p-3 text-gray-300 transition-colors hover:bg-white/10 hover:text-white sm:h-14 sm:w-14 sm:rounded-[1.35rem]"
              >
                <X size={26} />
              </button>
            </div>
          </header>

          <div className="box-border flex min-h-0 w-full min-w-0 flex-1 !pt-4 sm:!pt-6 lg:!pt-7">
            <div className="custom-scrollbar box-border min-h-0 w-full min-w-0 overflow-y-auto !px-1 !pb-3 !pr-3 sm:!px-2 sm:!pb-4 sm:!pr-4 lg:!pb-5 lg:!pr-5 [scrollbar-gutter:stable]">
              <div className="box-border flex w-full min-w-0 flex-col gap-5 space-y-5 !pb-2 sm:gap-6 sm:space-y-6 lg:!pb-3">
                <StatusCard
                  title={notice.title}
                  text={notice.text}
                  isLoading={billingLoadState === 'loading'}
                />

                <div className="box-border grid w-full min-w-0 grid-cols-1 gap-5 sm:gap-6 lg:grid-cols-3">
                  {orderedPlans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      billingStatus={billingStatus}
                      onSelectPlan={onSelectPlan}
                      onManageSubscription={onManageSubscription}
                      isActionLoading={isActionLoading}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
