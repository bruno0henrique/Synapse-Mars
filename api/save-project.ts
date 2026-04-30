import { checkProjectCreationAllowed } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { requireAuthenticatedUser } from '../server/request.js';

const GENERIC_SAVE_PROJECT_ERROR = 'Nao foi possivel salvar projeto';

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

  try {
    const { userId } = await requireAuthenticatedUser(req);
    const sql = getSql();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { id, name, description } = body;

    if (!name) {
      return res.status(400).json({ error: 'Nome obrigatorio' });
    }

    let projectId = id;

    if (projectId) {
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
        UPDATE projects
        SET name = ${name}, description = ${description || ''}
        WHERE id = ${projectId} AND user_id = ${userId}
      `;
    } else {
      const permission = await checkProjectCreationAllowed(sql, userId);
      if (!permission.allowed) {
        return res.status(402).json({
          error: 'Limite de projetos atingido',
          code: permission.reason === 'trial_expired' ? 'PLAN_REQUIRED' : 'PROJECT_LIMIT_REACHED',
          billing: permission.status
        });
      }

      projectId = crypto.randomUUID();

      await sql`
        INSERT INTO projects (id, user_id, name, description)
        VALUES (${projectId}, ${userId}, ${name}, ${description || ''})
      `;
    }

    return res.status(200).json({ success: true, id: projectId });
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Invalid save-project auth token:', error);
      return res.status(401).json({ error: 'Autenticacao necessaria' });
    }

    console.error('Erro ao salvar projeto:', error);
    return res.status(500).json({ error: GENERIC_SAVE_PROJECT_ERROR });
  }
}
