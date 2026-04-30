import { neon } from '@neondatabase/serverless';
import { verifyToken } from '@clerk/backend';

const GENERIC_GET_IDEAS_ERROR = 'Nao foi possivel carregar ideias';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.PRODUCTION_URL || '');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Autenticacao necessaria' });
  }

  try {
    const token = authHeader.split(' ')[1];
    const { sub: userId } = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });

    const databaseUrl = process.env.NEON_API_URL;
    if (!databaseUrl || (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://'))) {
      console.error('Invalid database configuration for get-ideas');
      return res.status(500).json({ error: GENERIC_GET_IDEAS_ERROR });
    }

    const rawProjectId = req.query?.projectId;
    const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : (rawProjectId || 'default');
    const sql = neon(databaseUrl);
    const ideas = await sql`
      SELECT *
      FROM ideas
      WHERE user_id = ${userId} AND project_id = ${projectId}
    `;

    const mappedIdeas = ideas.map((i: any) => ({
      id: i.id,
      text: i.content,
      category: i.category || 'Outro',
      position: {
        x: parseFloat(i.x) || 0,
        y: parseFloat(i.y) || 0
      },
      connections: typeof i.connections === 'string' ? JSON.parse(i.connections) : (i.connections || []),
      isCentral: i.is_central || false,
      aiGenerated: i.ai_generated || false,
      width: 280,
      height: 160,
      projectId: i.project_id || projectId
    }));

    return res.status(200).json(mappedIdeas);
  } catch (error: any) {
    console.error('Erro ao buscar ideias:', error);
    return res.status(500).json({ error: GENERIC_GET_IDEAS_ERROR });
  }
}
