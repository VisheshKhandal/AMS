/**
 * Live sync WebSocket client — drives "Synced live" indicators from real connection state.
 */
const LiveSync = (() => {
  let ws = null;
  let reconnectTimer = null;
  let status = 'disconnected';
  const listeners = new Set();
  const RECONNECT_MS = 4000;

  function getWsBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'ws://localhost:5000';
    }
    return 'wss://ams-32ig.onrender.com';
  }

  function getWsUrl() {
    const token = typeof Auth !== 'undefined' ? Auth.getToken() : null;
    if (!token) return null;
    return `${getWsBase()}/ws/live?token=${encodeURIComponent(token)}`;
  }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    listeners.forEach((fn) => fn(next));
    updateIndicators(next);
  }

  function statusLabel(next) {
    if (next === 'connected') return 'Synced live';
    if (next === 'connecting') return 'Connecting…';
    return 'Offline';
  }

  function updateIndicators(next) {
    document.querySelectorAll('.live-indicator, .live-pill').forEach((el) => {
      el.classList.remove('is-connected', 'is-disconnected', 'is-connecting');
      el.classList.add(`is-${next}`);

      const label = el.querySelector('.live-label');
      if (label) {
        label.textContent =
          el.classList.contains('live-pill')
            ? next === 'connected'
              ? 'Live'
              : next === 'connecting'
                ? 'Connecting'
                : 'Offline'
            : statusLabel(next);
      }
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_MS);
  }

  function connect() {
    if (typeof Auth === 'undefined' || !Auth.isAuthenticated()) {
      setStatus('disconnected');
      return;
    }

    const url = getWsUrl();
    if (!url) {
      setStatus('disconnected');
      return;
    }

    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setStatus('connecting');

    try {
      ws = new WebSocket(url);
    } catch {
      setStatus('disconnected');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => setStatus('connected');

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'dashboard:update') {
          window.dispatchEvent(new CustomEvent('livesync:dashboard', { detail: msg }));
        }
      } catch {
        /* ignore */
      }
    };

    ws.onclose = () => {
      ws = null;
      setStatus('disconnected');
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    ws?.close();
    ws = null;
    setStatus('disconnected');
  }

  function onStatusChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  return {
    connect,
    disconnect,
    onStatusChange,
    getStatus: () => status,
  };
})();

