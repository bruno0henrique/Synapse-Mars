import { getSql } from '../server/db.js';
import { parseBody, requireAuthenticatedUser } from '../server/request.js';

const GENERIC_DELETE_PROJECT_ERROR = 'Nao foi possivel excluir projeto';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', process.env.PRODUCTION_URL || '');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,DELETE,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  try {
    const { userId } = await requireAuthenticatedUser(req);
    const sql = getSql();
    const body = parseBody(req.body);
    const projectId = typeof body.projectId === 'string' ? body.projectId : '';

    if (!projectId) {
      return res.status(400).json({ error: 'Projeto obrigatorio' });
    }

    const [existingProject] = await sql`
      SELECT id
      FROM projects
      WHERE id = ${projectId} AND user_id = ${userId}
      LIMIT 1
    `;

    if (!existingProject) {
      return res.status(404).json({ error: 'Projeto nao encontrado' });
    }

    await sql`
      DELETE FROM ideas
      WHERE project_id = ${projectId} AND user_id = ${userId}
    `;

    await sql`
      DELETE FROM projects
      WHERE id = ${projectId} AND user_id = ${userId}
    `;

    return res.status(200).json({ success: true });
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Invalid delete-project auth token:', error);
      return res.status(401).json({ error: 'Autenticacao necessaria' });
    }

    console.error('Erro ao excluir projeto:', error);
    return res.status(500).json({ error: GENERIC_DELETE_PROJECT_ERROR });
  }
}
