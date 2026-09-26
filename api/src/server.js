import { buildApp } from './app.js';
import { migrate, pool } from './db.js';

await migrate();
const app = await buildApp();

// Railway sends SIGTERM on every redeploy; drain in-flight requests before exiting.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    try { await app.close(); } catch (error) { app.log.error(error); }
    await pool.end().catch(() => {});
    process.exit(0);
  });
}

await app.listen({ port: Number(process.env.PORT || 4000), host: '0.0.0.0' });
