import { GoogleGenerativeAI } from '@google/generative-ai';
import { consumeAiUsageSlot, refundAiUsageSlot, type BillingStatus } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { parseBody, requireClerkUser } from '../server/request.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GENERIC_ERROR = 'Nao foi possivel gerar sugestoes';
const MAX_PROMPT_LENGTH = 120_000;

function buildPromptFromPedido(pedido: any) {
  return `Instrucao do Sistema: ${pedido.instrucao_sistema}

Contexto da Rede (Todos os Baloes): ${JSON.stringify(pedido.todos_os_baloes)}

Arvore de Conexoes: ${JSON.stringify(pedido.arvore_de_conexoes)}

Ideia Selecionada: ${JSON.stringify(pedido.ideia_selecionada)}

Comando: ${pedido.comando_acao}`;
}

function parseJsonArray(rawText: string) {
  const jsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response is not an array');
  }

  return parsed;
}

function setAiRateLimitHeaders(res: any, status: BillingStatus) {
  res.setHeader('X-AI-RateLimit-Limit', String(status.usage.limit));
  res.setHeader('X-AI-RateLimit-Remaining', String(status.usage.remaining));
  res.setHeader('X-AI-RateLimit-Reset-At', String(status.usage.resetAt));
  res.setHeader('X-AI-RateLimit-Reset-Seconds', String(Math.max(0, Math.ceil((status.usage.resetAt - Date.now()) / 1000))));
  res.setHeader('X-Billing-Plan', status.effectivePlan);
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.PRODUCTION_URL || '');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'X-AI-RateLimit-Limit, X-AI-RateLimit-Remaining, X-AI-RateLimit-Reset-At, X-AI-RateLimit-Reset-Seconds, X-Billing-Plan');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    let userId = '';
    try {
      const auth = await requireClerkUser(req);
      userId = auth.userId;
    } catch (authError) {
      console.error('Invalid Gemini auth token:', authError);
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('Missing required env: GEMINI_API_KEY');
      return res.status(500).json({ error: GENERIC_ERROR });
    }

    let body: any;
    try {
      body = parseBody(req.body);
    } catch (parseError) {
      console.error('Invalid Gemini request body:', parseError);
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const prompt = typeof body.prompt === 'string'
      ? body.prompt
      : body.pedido && typeof body.pedido === 'object'
        ? buildPromptFromPedido(body.pedido)
        : '';

    if (!prompt.trim()) {
      console.error('Gemini request without prompt');
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    if (prompt.length > MAX_PROMPT_LENGTH) {
      console.error('Gemini prompt too large', { length: prompt.length });
      return res.status(400).json({ error: GENERIC_ERROR });
    }

    const sql = getSql();
    const usageSlot = await consumeAiUsageSlot(sql, userId);
    setAiRateLimitHeaders(res, usageSlot.status);

    if (!usageSlot.allowed) {
      const isDailyLimit = usageSlot.reason === 'daily_limit';
      console.error('AI usage blocked', { userId, reason: usageSlot.reason });
      return res.status(isDailyLimit ? 429 : 402).json({
        error: isDailyLimit ? 'Limite diario de IA atingido' : 'Plano necessario',
        code: isDailyLimit ? 'AI_DAILY_LIMIT_REACHED' : 'PLAN_REQUIRED',
        billing: usageSlot.status
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: { responseMimeType: 'application/json' }
    });

    let parsed: any[];
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      parsed = parseJsonArray(response.text());
    } catch (geminiError) {
      await refundAiUsageSlot(sql, userId).catch(refundError => {
        console.error('Failed to refund AI usage after Gemini error:', refundError);
      });
      console.error('Gemini upstream/request failed:', geminiError);
      return res.status(500).json({ error: GENERIC_ERROR });
    }

    return res.status(200).json(parsed);
  } catch (error) {
    console.error('Erro ao processar Gemini:', error);
    return res.status(500).json({ error: GENERIC_ERROR });
  }
}
