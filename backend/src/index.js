import http from 'http';
import { env } from './config/env.js';
import { connectDatabase } from './db/connect.js';
import app from './app.js';
import { createLiveSyncServer } from './ws/liveSync.js';

async function start() {
  await connectDatabase();

  const server = http.createServer(app);
  createLiveSyncServer(server);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Port ${env.port} is already in use. Stop the other process or set PORT in .env.`,
      );
      process.exit(1);
    }
    throw err;
  });

  server.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
    console.log(`Live sync: ws://localhost:${env.port}/ws/live`);
    console.log(`Test route: GET http://localhost:${env.port}/test`);
  });
}

start();
