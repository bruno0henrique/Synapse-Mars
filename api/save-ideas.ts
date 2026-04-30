import { checkIdeaSaveAllowed } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { requireAuthenticatedUser } from '../server/request.js';

const MAX_PAYLOAD_BYTES = 512 * 1024;
const MAX_IDEAS_PER_REQUEST = 500;
const MAX_DELETED_IDS_PER_REQUEST = 500;
const MAX_IDEA_BYTES = 16 * 1024;
const MAX_TEXT_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 100;
const MAX_ID_LENGTH = 128;
const MAX_CONNECTIONS_PER_IDEA = 500;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const GENERIC_SAVE_ERROR = 'Nao foi possivel salvar ideias';

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

type SanitizedIdea = {
  id: string;
  text: string;
  category: string;
  connections: string[];
  posX: number;
  posY: number;
  aiGenerated: boolean;
  isCentral: boolean;
};

function parseBody(reqBody: any) {
  return typeof reqBody === 'string' ? JSON.parse(reqBody || '{}') : (reqBody || {});
}

function headerValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function getClientIp(req: any) {
  const forwardedFor = headerValue(req.headers['x-forwarded-for']);
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headerValue(req.headers['x-real-ip']);
  return typeof realIp === 'string' && realIp.trim() ? realIp.trim() : 'unknown';
}

function getBodySize(reqBody: any) {
  if (typeof reqBody === 'string') {
    return Buffer.byteLength(reqBody, 'utf8');
  }

  return Buffer.byteLength(JSON.stringify(reqBody || {}), 'utf8');
}

function isRateLimited(key: string) {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  current.count += 1;

  if (rateLimitStore.size > 1000) {
    for (const [storedKey, entry] of rateLimitStore) {
      if (entry.resetAt <= now) rateLimitStore.delete(storedKey);
    }
  }

  return current.count > RATE_LIMIT_MAX_REQUESTS;
}

function fail(res: any, status: number) {
  return res.status(status).json({ error: GENERIC_SAVE_ERROR });
}

function normalizeId(value: any, fallback?: string) {
  const id = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  if (!id || id.length > MAX_ID_LENGTH) {
    throw new Error('Invalid idea id');
  }

  return id;
}

function normalizeIdArray(value: any) {
  if (!Array.isArray(value)) return [];
  if (value.length > MAX_DELETED_IDS_PER_REQUEST) {
    throw new Error('Too many deleted ids');
  }

  return value.map((id: any) => normalizeId(id)).filter(Boolean);
}

function normalizeString(value: any, fallback: string, maxLength: number) {
  const text = typeof value === 'string' ? value : fallback;
  if (text.length > maxLength) {
    throw new Error('String field too long');
  }

  return text;
}

function normalizeNumber(value: any) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function sanitizeIdea(idea: any): SanitizedIdea {
  if (!idea || typeof idea !== 'object') {
    throw new Error('Invalid idea payload');
  }

  if (Buffer.byteLength(JSON.stringify(idea), 'utf8') > MAX_IDEA_BYTES) {
    throw new Error('Idea payload too large');
  }

  const rawConnections = Array.isArray(idea.connections) ? idea.connections : [];
  if (rawConnections.length > MAX_CONNECTIONS_PER_IDEA) {
    throw new Error('Too many connections');
  }

  const connections = rawConnections.map((id: any) => normalizeId(id));

  return {
    id: normalizeId(idea.id, crypto.randomUUID()),
    text: normalizeString(idea.text, '', MAX_TEXT_LENGTH),
    category: normalizeString(idea.category, 'Outro', MAX_CATEGORY_LENGTH),
    connections,
    posX: normalizeNumber(idea.position?.x),
    posY: normalizeNumber(idea.position?.y),
    aiGenerated: !!idea.aiGenerated,
    isCentral: !!idea.isCentral
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.PRODUCTION_URL || '');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const contentLength = Number(headerValue(req.headers['content-length']) || 0);
  if (contentLength > MAX_PAYLOAD_BYTES || getBodySize(req.body) > MAX_PAYLOAD_BYTES) {
    console.error('Payload too large for save-ideas', { contentLength });
    return fail(res, 413);
  }

  const ipRateKey = `ip:${getClientIp(req)}`;
  if (isRateLimited(ipRateKey)) {
    console.error('IP rate limit exceeded for save-ideas', { ipRateKey });
    return fail(res, 429);
  }

  try {
    const { userId } = await requireAuthenticatedUser(req);

    const userRateKey = `user:${userId}`;
    if (isRateLimited(userRateKey)) {
      console.error('User rate limit exceeded for save-ideas', { userRateKey });
      return fail(res, 429);
    }

    let projectId: string;
    let ideas: SanitizedIdea[];
    let deletedIdeaIds: string[];

    try {
      const body = parseBody(req.body);
      const rawIdeas = Array.isArray(body) ? body : body.ideas;

      if (!Array.isArray(rawIdeas)) {
        throw new Error('Ideas is not an array');
      }

      if (rawIdeas.length > MAX_IDEAS_PER_REQUEST) {
        throw new Error(`Too many ideas: ${rawIdeas.length}`);
      }

      const headerProjectId = headerValue(req.headers['x-project-id']);
      const rawProjectId = typeof body.projectId === 'string' && body.projectId.trim()
        ? body.projectId
        : typeof headerProjectId === 'string' && headerProjectId.trim()
          ? headerProjectId
          : 'default';

      projectId = normalizeId(rawProjectId);
      ideas = rawIdeas.map(sanitizeIdea);
      deletedIdeaIds = normalizeIdArray(body.deletedIdeaIds);
    } catch (validationError) {
      console.error('Invalid save-ideas payload:', validationError);
      return fail(res, 400);
    }
    const deletedSet = new Set(deletedIdeaIds);

    const sql = getSql();
    const permission = await checkIdeaSaveAllowed(
      sql,
      userId,
      projectId,
      ideas.map(idea => idea.id),
      deletedIdeaIds
    );

    if (!permission.allowed) {
      return res.status(402).json({
        error: permission.reason === 'trial_expired' ? 'Plano necessario' : 'Limite de baloes atingido',
        code: permission.reason === 'trial_expired' ? 'PLAN_REQUIRED' : 'BALLOON_LIMIT_REACHED',
        billing: permission.status
      });
    }

    for (const idea of ideas.filter(item => !deletedSet.has(item.id))) {
      const connJson = JSON.stringify(idea.connections);
      const saved = await sql`
        INSERT INTO ideas (id, user_id, project_id, content, category, connections, x, y, ai_generated, is_central)
        VALUES (
          ${idea.id},
          ${userId},
          ${projectId},
          ${idea.text},
          ${idea.category},
          ${connJson}::jsonb,
          ${idea.posX},
          ${idea.posY},
          ${idea.aiGenerated},
          ${idea.isCentral}
        )
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          category = EXCLUDED.category,
          connections = EXCLUDED.connections,
          x = EXCLUDED.x,
          y = EXCLUDED.y,
          ai_generated = EXCLUDED.ai_generated,
          is_central = EXCLUDED.is_central
        WHERE ideas.user_id = ${userId} AND ideas.project_id = ${projectId}
        RETURNING id
      `;

      if (saved.length === 0) {
        console.error('Blocked save-ideas write for foreign idea', { userId, projectId, ideaId: idea.id });
        return fail(res, 403);
      }
    }

    if (deletedIdeaIds.length > 0) {
      await sql`
        DELETE FROM ideas
        WHERE user_id = ${userId} AND project_id = ${projectId} AND id = ANY(${deletedIdeaIds})
      `;
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    if ((error as any)?.statusCode === 401) {
      console.error('Invalid save-ideas auth token:', error);
      return fail(res, 401);
    }

    console.error('Erro ao salvar ideias:', error);
    return fail(res, 500);
  }
}
