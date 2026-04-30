import type { BillingStatus } from '../../lib/billing';
import type { EffectivePlanId } from '../../lib/plans';

export type AiMode = 'proximos_passos' | 'causa_raiz' | 'expandir_ideias';
export type ActionType = AiMode | 'causa-raiz' | 'proximo-passo' | 'expandir';

type AiConnectionKind = 'direct' | 'branch';

type AiIdeaLike = {
  id: string;
  text?: string;
  content?: string;
  category?: string | null;
  connections?: string[];
};

type AiContextLimits = {
  directLimit: number;
  branchLimitPerDirect: number;
  totalLimit: number;
};

export type AiContextItem = {
  content: string;
  category: string;
  connection: AiConnectionKind;
};

export type AiContextPayload = {
  selected: {
    content: string;
    category: string;
  };
  mode: AiMode;
  context: AiContextItem[];
};

export type RespostaIAItem = { texto: string; categoria: string };

export type AiRateLimitInfo = {
  limit: number;
  remaining: number;
  resetAt: number;
};

export type AiSuggestionResult = {
  items: Array<{ text: string; category: string }>;
  rateLimit?: AiRateLimitInfo;
};

export class AiRequestError extends Error {
  status: number;
  rateLimit?: AiRateLimitInfo;
  code?: string;
  billing?: BillingStatus;

  constructor(message: string, status: number, rateLimit?: AiRateLimitInfo, code?: string, billing?: BillingStatus) {
    super(message);
    this.name = 'AiRequestError';
    this.status = status;
    this.rateLimit = rateLimit;
    this.code = code;
    this.billing = billing;
  }
}

const FRIENDLY_AI_ERROR = 'Nao foi possivel gerar sugestoes agora. Verifique sua sessao e tente novamente.';

const PLAN_CONTEXT_LIMITS: Record<'free' | 'basic' | 'pro', AiContextLimits> = {
  free: { directLimit: 5, branchLimitPerDirect: 0, totalLimit: 5 },
  basic: { directLimit: 5, branchLimitPerDirect: 1, totalLimit: 15 },
  pro: { directLimit: 10, branchLimitPerDirect: 3, totalLimit: 30 }
};

const MODE_INSTRUCTIONS: Record<AiMode, string> = {
  proximos_passos: 'Gere acoes, etapas, prioridades, decisoes, tarefas, validacoes ou caminhos praticos para avancar.',
  causa_raiz: 'Investigue causas, fatores ocultos, bloqueios, riscos, gargalos, hipoteses e perguntas de diagnostico.',
  expandir_ideias: 'Crie possibilidades, variacoes, aprofundamentos, perguntas exploratorias, alternativas e conexoes relacionadas.'
};

const FALLBACK_SUGGESTIONS: Record<AiMode, Array<{ text: string; category: string }>> = {
  proximos_passos: [
    { text: 'Definir primeira acao', category: 'Proximo passo' },
    { text: 'Priorizar proxima etapa', category: 'Prioridade' },
    { text: 'Validar dependencia principal', category: 'Validacao' }
  ],
  causa_raiz: [
    { text: 'Levantar causa provavel', category: 'Causa' },
    { text: 'Mapear bloqueio oculto', category: 'Bloqueio' },
    { text: 'Validar hipotese critica', category: 'Hipotese' }
  ],
  expandir_ideias: [
    { text: 'Explorar novo angulo', category: 'Ideia' },
    { text: 'Criar variacao relacionada', category: 'Variacao' },
    { text: 'Conectar possibilidade futura', category: 'Possibilidade' }
  ]
};

function readAiRateLimit(headers: Headers): AiRateLimitInfo | undefined {
  const limit = Number(headers.get('X-AI-RateLimit-Limit'));
  const remaining = Number(headers.get('X-AI-RateLimit-Remaining'));
  const resetAt = Number(headers.get('X-AI-RateLimit-Reset-At'));

  if (!Number.isFinite(limit) || !Number.isFinite(remaining) || !Number.isFinite(resetAt)) {
    return undefined;
  }

  return { limit, remaining, resetAt };
}

function compactText(value: unknown, fallback = '') {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

  return text || fallback;
}

function normalizeMode(actionType?: ActionType | string): AiMode {
  if (actionType === 'proximos_passos' || actionType === 'proximo-passo') return 'proximos_passos';
  if (actionType === 'causa_raiz' || actionType === 'causa-raiz') return 'causa_raiz';
  if (actionType === 'expandir_ideias' || actionType === 'expandir') return 'expandir_ideias';

  return 'expandir_ideias';
}

function getLimitsForPlan(effectivePlan?: EffectivePlanId | null): AiContextLimits {
  if (effectivePlan === 'pro') return PLAN_CONTEXT_LIMITS.pro;
  if (effectivePlan === 'basic') return PLAN_CONTEXT_LIMITS.basic;

  return PLAN_CONTEXT_LIMITS.free;
}

function getIdeaId(idea: AiIdeaLike | undefined) {
  return compactText(idea?.id);
}

function getIdeaContent(idea: Partial<AiIdeaLike> | undefined, fallback = '') {
  return compactText(idea?.text ?? idea?.content, fallback);
}

function getIdeaCategory(idea: Partial<AiIdeaLike> | undefined) {
  return compactText(idea?.category, 'Sem categoria');
}

function getConnectionIds(idea: AiIdeaLike | undefined) {
  return Array.isArray(idea?.connections)
    ? idea.connections.map(id => String(id))
    : [];
}

function areConnected(a: AiIdeaLike, b: AiIdeaLike) {
  const aId = getIdeaId(a);
  const bId = getIdeaId(b);

  if (!aId || !bId) return false;

  return getConnectionIds(a).includes(bId) || getConnectionIds(b).includes(aId);
}

function toContextItem(idea: AiIdeaLike, connection: AiConnectionKind): AiContextItem {
  return {
    content: getIdeaContent(idea),
    category: getIdeaCategory(idea),
    connection
  };
}

function normalizeSuggestionCategory(rawCategory: unknown, mode: AiMode) {
  const fallback = FALLBACK_SUGGESTIONS[mode][0].category;
  const category = compactText(rawCategory, fallback);
  const normalized = category
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (normalized === 'causa-raiz' || normalized === 'causa raiz') return 'Causa raiz';
  if (normalized === 'proximo-passo' || normalized === 'proximo passo') return 'Proximo passo';
  if (normalized === 'solucao') return 'Solução';

  return category.split(/\s+/).slice(0, 3).join(' ').slice(0, 40).trim() || fallback;
}

function normalizeSuggestionText(rawText: unknown, fallback: string) {
  const text = compactText(rawText, fallback);
  return text.length <= 90 ? text : `${text.slice(0, 87).trim()}...`;
}

function normalizeSuggestions(data: unknown, mode: AiMode): Array<{ text: string; category: string }> {
  const fallback = FALLBACK_SUGGESTIONS[mode];
  const rawItems = Array.isArray(data) ? data : [];
  const normalized = rawItems.slice(0, 3).map((item: any, index) => ({
    text: normalizeSuggestionText(item?.text ?? item?.texto, fallback[index].text),
    category: normalizeSuggestionCategory(item?.category ?? item?.categoria, mode)
  }));

  while (normalized.length < 3) {
    normalized.push(fallback[normalized.length]);
  }

  return normalized;
}

export function buildAiContextForPlan(
  ideas: AiIdeaLike[],
  selectedId: string,
  effectivePlan?: EffectivePlanId | null,
  mode: AiMode = 'expandir_ideias'
): AiContextPayload {
  const selected = ideas.find(idea => getIdeaId(idea) === selectedId);
  const selectedKey = selectedId || getIdeaId(selected);
  const limits = getLimitsForPlan(effectivePlan);
  const context: AiContextItem[] = [];

  if (!selected || !selectedKey) {
    return {
      selected: {
        content: '',
        category: 'Sem categoria'
      },
      mode,
      context
    };
  }

  const seenIds = new Set<string>([selectedKey]);
  const allDirectIds = new Set<string>();
  const allDirectIdeas = ideas.filter(idea => {
    const ideaId = getIdeaId(idea);
    const isDirect = Boolean(ideaId && !seenIds.has(ideaId) && areConnected(selected, idea));
    if (isDirect) allDirectIds.add(ideaId);
    return isDirect;
  });
  const directIdeas = allDirectIdeas.slice(0, limits.directLimit);

  for (const directIdea of directIdeas) {
    const directId = getIdeaId(directIdea);
    if (!directId || seenIds.has(directId) || context.length >= limits.totalLimit) continue;

    seenIds.add(directId);
    context.push(toContextItem(directIdea, 'direct'));
  }

  if (limits.branchLimitPerDirect > 0 && context.length < limits.totalLimit) {
    for (const directIdea of directIdeas) {
      let branchCount = 0;

      for (const candidate of ideas) {
        const candidateId = getIdeaId(candidate);
        if (!candidateId || seenIds.has(candidateId)) continue;
        if (allDirectIds.has(candidateId)) continue;
        if (!areConnected(directIdea, candidate)) continue;

        seenIds.add(candidateId);
        context.push(toContextItem(candidate, 'branch'));
        branchCount += 1;

        if (branchCount >= limits.branchLimitPerDirect || context.length >= limits.totalLimit) break;
      }

      if (context.length >= limits.totalLimit) break;
    }
  }

  return {
    selected: {
      content: getIdeaContent(selected),
      category: getIdeaCategory(selected)
    },
    mode,
    context
  };
}

export function buildAiPrompt(payload: AiContextPayload) {
  return `Voce e a IA do Synapse IA, um mapa visual de pensamento.
O balao selecionado e o foco principal. Os baloes conectados sao contexto semantico.
As categorias indicam o tipo de ideia. O campo connection indica relacao direta ou ramificacao.
O mapa e uma rede de ideias, nao uma lista isolada.

Modo selecionado: ${payload.mode}
Objetivo do modo: ${MODE_INSTRUCTIONS[payload.mode]}

Adapte o raciocinio ao dominio aparente quando houver evidencia no contexto: estudo, negocio, conteudo, planejamento, problema pratico, produto/software, criatividade, vida pessoal ou processo de trabalho.
Use o contexto conectado sem copiar literalmente baloes existentes. Evite repeticao, respostas genericas e sugestoes longas.
Nao misture modos. Nao assuma um dominio especifico sem evidencia. Cada sugestao deve virar um novo balao.

Contexto:
${JSON.stringify(payload)}

Retorne apenas JSON valido, sem Markdown e sem texto antes ou depois.
Formato obrigatorio:
[{"text":"sugestao curta para novo balao","category":"categoria curta"}]
Regras: exatamente 3 sugestoes; text ate 90 caracteres; category curta de 1 a 3 palavras; category nunca vazia.`;
}

export async function pedirSugestaoIA(
  mainIdea: string,
  currentContext: AiIdeaLike[],
  selectedNode: AiIdeaLike,
  actionType: ActionType,
  headers?: HeadersInit,
  effectivePlan?: EffectivePlanId | null
): Promise<AiSuggestionResult> {
  try {
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Content-Type', 'application/json');

    if (!requestHeaders.has('Authorization')) {
      throw new Error('Token de autenticacao ausente');
    }

    const mode = normalizeMode(actionType);
    const selectedId = getIdeaId(selectedNode);
    let payload = buildAiContextForPlan(currentContext, selectedId, effectivePlan, mode);

    if (!payload.selected.content) {
      payload = {
        ...payload,
        selected: {
          content: getIdeaContent(selectedNode, mainIdea),
          category: getIdeaCategory(selectedNode)
        }
      };
    }

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ prompt: buildAiPrompt(payload) })
    });

    const rateLimit = readAiRateLimit(response.headers);

    if (!response.ok) {
      let errorBody: any = {};
      try {
        errorBody = await response.json();
      } catch {
        errorBody = {};
      }

      console.error('Falha ao chamar a IA:', { status: response.status });
      throw new AiRequestError(
        FRIENDLY_AI_ERROR,
        response.status,
        rateLimit,
        typeof errorBody.code === 'string' ? errorBody.code : undefined,
        errorBody.billing
      );
    }

    const data = await response.json();
    return { items: normalizeSuggestions(data, mode), rateLimit };
  } catch (error) {
    console.error('Erro ao chamar a IA:', error);
    if (error instanceof AiRequestError) {
      throw error;
    }

    throw new AiRequestError(FRIENDLY_AI_ERROR, 0);
  }
}
