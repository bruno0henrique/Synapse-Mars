import { neon } from '@neondatabase/serverless';

export function getSql() {
  const databaseUrl = process.env.NEON_API_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!databaseUrl || (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://'))) {
    throw new Error('Invalid database configuration');
  }

  return neon(databaseUrl);
}
