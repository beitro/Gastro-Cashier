import express from 'express';
import { pool } from './db.mjs';

const app = express();
const port = Number.parseInt(process.env.PORT || '4000', 10);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gastro-cashier-api' });
});

app.get('/api/health/db', async (_req, res) => {
  try {
    const result = await pool.query(
      'SELECT current_database() AS database, current_user AS role, current_setting(\'server_version\') AS version'
    );
    res.json({ status: 'ok', database: result.rows[0].database, role: result.rows[0].role, version: result.rows[0].version });
  } catch (error) {
    console.error('Database health check failed:', error.message);
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Gastro-Cashier API listening on port ${port}`);
});

async function shutdown(signal) {
  console.log(`Received ${signal}; closing API and PostgreSQL pool.`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
