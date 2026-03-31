#!/usr/bin/env node

import { WebSocket } from 'ws';

function parseArgs(argv) {
  const args = {
    baseUrl: process.env.WS_SMOKE_BASE_URL || process.env.BASE_URL || 'http://localhost:3001',
    timeoutMs: Number.parseInt(process.env.WS_SMOKE_TIMEOUT_MS || '', 10) || 12000,
    heartbeatWaitMs: Number.parseInt(process.env.WS_SMOKE_HEARTBEAT_WAIT_MS || '', 10) || 55000,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    const [key, value] = part.split('=');
    if (!value) continue;

    if (key === '--base-url') {
      args.baseUrl = value;
      continue;
    }

    if (key === '--timeout-ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.timeoutMs = parsed;
      }
      continue;
    }

    if (key === '--heartbeat-wait-ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.heartbeatWaitMs = parsed;
      }
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, '');
  return args;
}

function fail(message, details) {
  if (details !== undefined) {
    console.error('[smoke:ws-heartbeat]', message, details);
  } else {
    console.error('[smoke:ws-heartbeat]', message);
  }
  process.exit(1);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForOpen(ws, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`WebSocket did not open within ${timeoutMs}ms`));
    }, timeoutMs);

    const onOpen = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('open', onOpen);
      ws.off('error', onError);
    };

    ws.on('open', onOpen);
    ws.on('error', onError);
  });
}

function waitForPongMessage(ws, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Did not receive pong message within ${timeoutMs}ms`));
    }, timeoutMs);

    const onMessage = (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message?.type === 'pong') {
          cleanup();
          resolve(message);
        }
      } catch {
        // Ignore unrelated non-JSON frames.
      }
    };

    const onClose = (code, reason) => {
      cleanup();
      reject(new Error(`Socket closed while waiting for pong: code=${code} reason=${reason.toString()}`));
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('close', onClose);
      ws.off('error', onError);
    };

    ws.on('message', onMessage);
    ws.on('close', onClose);
    ws.on('error', onError);
  });
}

async function sendApplicationPing(ws, timeoutMs) {
  const waitPong = waitForPongMessage(ws, timeoutMs);
  ws.send(JSON.stringify({ type: 'ping', payload: { ts: Date.now() } }));
  await waitPong;
}

function toWebSocketUrl(baseUrl) {
  if (baseUrl.startsWith('https://')) {
    return `wss://${baseUrl.slice('https://'.length)}`;
  }

  if (baseUrl.startsWith('http://')) {
    return `ws://${baseUrl.slice('http://'.length)}`;
  }

  if (baseUrl.startsWith('ws://') || baseUrl.startsWith('wss://')) {
    return baseUrl;
  }

  return `ws://${baseUrl}`;
}

async function main() {
  const options = parseArgs(process.argv);

  const health = await fetch(`${options.baseUrl}/`);
  if (!health.ok) {
    fail(`Health endpoint returned ${health.status} at ${options.baseUrl}/`);
  }
  console.log(`[smoke:ws-heartbeat] PASS health (${health.status})`);

  const wsUrl = `${toWebSocketUrl(options.baseUrl)}/ws/game`;
  const ws = new WebSocket(wsUrl);
  let sawServerPingFrame = false;
  let unexpectedClose = null;

  ws.on('ping', () => {
    sawServerPingFrame = true;
  });

  ws.on('close', (code, reason) => {
    if (!unexpectedClose && code !== 1000) {
      unexpectedClose = { code, reason: reason.toString() };
    }
  });

  try {
    await waitForOpen(ws, options.timeoutMs);
    console.log('[smoke:ws-heartbeat] PASS websocket open');

    await sendApplicationPing(ws, options.timeoutMs);
    console.log('[smoke:ws-heartbeat] PASS application ping->pong');

    await delay(options.heartbeatWaitMs);

    if (unexpectedClose || ws.readyState !== WebSocket.OPEN) {
      fail('WebSocket closed unexpectedly during heartbeat window', unexpectedClose || { readyState: ws.readyState });
    }

    if (!sawServerPingFrame) {
      fail(`Did not observe server heartbeat ping frame within ${options.heartbeatWaitMs}ms`);
    }
    console.log('[smoke:ws-heartbeat] PASS observed server heartbeat frame');

    await sendApplicationPing(ws, options.timeoutMs);
    console.log('[smoke:ws-heartbeat] PASS post-heartbeat ping->pong');

    ws.close(1000, 'smoke-complete');
    await delay(150);

    console.log('[smoke:ws-heartbeat] All checks passed.');
  } catch (error) {
    fail('WebSocket heartbeat smoke failed', error instanceof Error ? error.message : String(error));
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.terminate();
    }
  }
}

main().catch((error) => {
  fail('Unexpected error during heartbeat smoke test', error instanceof Error ? error.message : String(error));
});
