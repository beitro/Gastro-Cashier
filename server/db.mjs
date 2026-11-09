import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required by the API server.');
}

const isNeon = /\.neon\.tech$/i.test(new URL(connectionString).hostname);
export const pool = new Pool({
  connectionString,
  max: Number.parseInt(process.env.PG_POOL_MAX || '10', 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  // Neon connections must use TLS. The URL may also carry sslmode=require.
  ...(isNeon ? { ssl: { rejectUnauthorized: true } } : {}),
});

pool.on('error', (error) => {
  // Never log connection strings or credentials.
  console.error('Unexpected idle PostgreSQL client error:', error.message);
});
