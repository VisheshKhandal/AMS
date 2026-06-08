import http from 'http';
import { env } from './config/env.js';
import { connectDatabase } from './db/connect.js';
import app from './app.js';
import { createLiveSyncServer } from './ws/liveSync.js';

async function start() {
  try {
    await connectDatabase();

    const server = http.createServer(app);

    // WebSocket Live Sync
    createLiveSyncServer(server);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${env.port} is already in use.`);
        process.exit(1);
      }

      console.error('Server error:', err);
      process.exit(1);
    });

    const PORT = env.port || process.env.PORT || 5000;

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`✅ MongoDB connected successfully`);
      console.log(`✅ WebSocket server initialized`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
