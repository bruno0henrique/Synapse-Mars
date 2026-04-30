export type PlanId = 'trial' | 'basic' | 'pro';
export type EffectivePlanId = PlanId | 'none';
export type PaidPlanId = 'basic' | 'pro';

export type PlanOption = {
  id: PlanId;
  name: string;
  badge: string;
  price: string;
  aiLimitLabel: string;
  description: string;
  features: string[];
  ctaLabel: string;
  highlighted?: boolean;
};

export const PLAN_OPTIONS: PlanOption[] = [
  {
    id: 'trial',
    name: 'Trial gratis',
    badge: '7 dias',
    price: 'R$ 0',
    aiLimitLabel: '3 usos de IA / dia',
    description: 'Para testar o Synapse IA com limites iniciais.',
    features: [
      '7 dias após o primeiro acesso',
      '1 projeto',
      '30 balões por projeto'
    ],
    ctaLabel: 'Plano trial'
  },
  {
    id: 'basic',
    name: 'Basico',
    badge: 'Mensal',
    price: 'R$ 9,90/mes',
    aiLimitLabel: '15 usos de IA / dia',
    description: 'Para uso leve com mais espaço de organização.',
    features: [
      'Até 3 projetos',
      'Até 100 balões por projeto',
      'Dados sempre acessíveis'
    ],
    ctaLabel: 'Assinar Basico'
  },
  {
    id: 'pro',
    name: 'Pro',
    badge: 'Mais completo',
    price: 'R$ 24,90/mes',
    aiLimitLabel: '50 usos de IA / dia',
    description: 'Para uso frequente e recursos premium futuros.',
    features: [
      'Projetos ilimitados',
      'Até 500 balões por projeto',
      'Recursos premium futuros'
    ],
    ctaLabel: 'Assinar Pro',
    highlighted: true
  }
];
