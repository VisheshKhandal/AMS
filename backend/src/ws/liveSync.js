import { WebSocketServer } from 'ws';
import { verifyAccessToken } from '../utils/jwt.js';

const PING_INTERVAL_MS = 25000;

let wssInstance = null;

/**
 * WebSocket server for live sync heartbeat (ping/pong).
 * Clients authenticate via ?token=<accessToken> query param.
 */
export function createLiveSyncServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/live' });
  wssInstance = wss;

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    try {
      verifyAccessToken(token);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.isAlive = true;

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        }
      } catch {
        /* ignore malformed messages */
      }
    });

    ws.send(JSON.stringify({ type: 'connected', ts: Date.now() }));
  });

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

/**
 * Broadcast a dashboard refresh hint to all connected clients.
 */
export function broadcastDashboardUpdate(payload = {}) {
  if (!wssInstance) return;
  const message = JSON.stringify({ type: 'dashboard:update', ...payload, ts: Date.now() });
  wssInstance.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}
