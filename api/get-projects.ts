import { ensureBillingAccount } from '../server/billing.js';
import { getSql } from '../server/db.js';
import { requireAuthenticatedUser } from '../server/request.js';

const GENERIC_GET_PROJECTS_ERROR = 'Nao foi possivel carregar projetos';

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

  try {
    const { userId } = await requireAuthenticatedUser(req);
    const sql = getSql();
    await ensureBillingAccount(sql, userId).catch((billingError) => {
      console.error('Billing bootstrap skipped in get-projects:', billingError);
    });

    const projects = await sql`
      SELECT *
      FROM projects
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
    `;

    if (projects.length === 0) {
      const defaultId = crypto.randomUUID();
      await sql`
        INSERT INTO projects (id, user_id, name, description)
        VALUES (${defaultId}, ${userId}, 'Projeto 1', 'Meu primeiro mapa mental')
      `;

      const [newProject] = await sql`SELECT * FROM projects WHERE id = ${defaultId}`;
      if (newProject) {
        projects.push(newProject);
      }
    }

    const mappedProjects = projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      createdAt: p.created_at
    }));

    return res.status(200).json(mappedProjects);
  } catch (error: any) {
    if (error?.statusCode === 401) {
      console.error('Invalid get-projects auth token:', error);
      return res.status(401).json({ error: 'Autenticacao necessaria' });
    }

    console.error('Erro ao buscar projetos:', error);
    return res.status(500).json({ error: GENERIC_GET_PROJECTS_ERROR });
  }
}
