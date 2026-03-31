#!/usr/bin/env node

import { spawnSync } from "node:child_process";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3001",
    username: "admin",
    password: process.env.ADMIN_SMOKE_PASSWORD || "",
    aiContainer: "vex-ai-agent",
    includeFallback: true,
    timeoutMs: 10000,
    chatMessage: "report summary please",
  };

  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (part === "--skip-fallback") {
      args.includeFallback = false;
      continue;
    }
    if (part === "--include-fallback") {
      args.includeFallback = true;
      continue;
    }

    const [key, value] = part.split("=");
    if (!value) continue;

    if (key === "--base-url") args.baseUrl = value.replace(/\/+$/, "");
    if (key === "--username") args.username = value;
    if (key === "--password") args.password = value;
    if (key === "--ai-container") args.aiContainer = value;
    if (key === "--timeout-ms") args.timeoutMs = Number.parseInt(value, 10) || args.timeoutMs;
    if (key === "--chat-message") args.chatMessage = value;
  }

  return args;
}

function runDocker(args) {
  const res = spawnSync("docker", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

async function requestJson({ baseUrl, path, method = "GET", token, body, timeoutMs = 10000 }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      json: parsed,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function fail(message, extra) {
  if (extra !== undefined) {
    console.error("[smoke-ai-admin]", message, extra);
  } else {
    console.error("[smoke-ai-admin]", message);
  }
  process.exit(1);
}

async function waitForHealthy(baseUrl, token, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const health = await requestJson({
      baseUrl,
      path: "/api/admin/ai-agent/health",
      token,
      timeoutMs: Math.min(timeoutMs, 5000),
    });

    if (health.ok && health.json?.healthy === true) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

async function main() {
  const options = parseArgs(process.argv);
  if (!options.password) {
    fail("Admin password is required. Pass --password=... or set ADMIN_SMOKE_PASSWORD.");
  }

  console.log("[smoke-ai-admin] Starting smoke checks...");
  const login = await requestJson({
    baseUrl: options.baseUrl,
    path: "/api/admin/login",
    method: "POST",
    body: { username: options.username, password: options.password },
    timeoutMs: options.timeoutMs,
  });

  if (!login.ok || !login.json?.token) {
    fail("Admin login failed", login);
  }

  const token = login.json.token;
  console.log("[smoke-ai-admin] Admin login OK.");

  const health = await requestJson({
    baseUrl: options.baseUrl,
    path: "/api/admin/ai-agent/health",
    token,
    timeoutMs: options.timeoutMs,
  });
  if (!health.ok || health.json?.healthy !== true) {
    fail("Health endpoint failed", health);
  }

  const report = await requestJson({
    baseUrl: options.baseUrl,
    path: "/api/admin/ai-agent/report",
    token,
    timeoutMs: options.timeoutMs,
  });
  if (!report.ok || typeof report.json?.source !== "string") {
    fail("Report endpoint failed", report);
  }

  const chat = await requestJson({
    baseUrl: options.baseUrl,
    path: "/api/admin/ai-agent/chat",
    token,
    method: "POST",
    body: { message: options.chatMessage },
    timeoutMs: options.timeoutMs,
  });
  if (!chat.ok || typeof chat.json?.source !== "string") {
    fail("Chat endpoint failed", chat);
  }

  const snapshot = await requestJson({
    baseUrl: options.baseUrl,
    path: "/api/admin/ai-agent/project-snapshot",
    token,
    method: "POST",
    body: {
      notes: "smoke-ai-admin snapshot",
      tags: ["smoke", "ai-agent"],
    },
    timeoutMs: options.timeoutMs,
  });
  if (!snapshot.ok || snapshot.json?.success !== true) {
    fail("Project snapshot endpoint failed", snapshot);
  }

  const result = {
    login: "ok",
    health: {
      healthy: health.json?.healthy,
      source: health.json?.health?.service,
    },
    report: {
      source: report.json?.source,
      hasExternal: Boolean(report.json?.external),
      hasLocalFallback: Boolean(report.json?.localFallback),
    },
    chat: {
      source: chat.json?.source,
      replyPreview: String(chat.json?.reply || "").slice(0, 120),
    },
    snapshot: "ok",
    fallback: {
      attempted: false,
      passed: false,
      skippedReason: "",
    },
  };

  let stoppedByScript = false;
  try {
    if (options.includeFallback) {
      result.fallback.attempted = true;

      const ps = runDocker(["ps", "--format", "{{.Names}}"]); 
      if (!ps.ok) {
        result.fallback.skippedReason = "docker daemon unavailable";
      } else {
        const names = ps.stdout.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
        if (!names.includes(options.aiContainer)) {
          result.fallback.skippedReason = `container ${options.aiContainer} not running`;
        } else {
          const stop = runDocker(["stop", options.aiContainer]);
          if (!stop.ok) {
            fail("Failed to stop ai-agent container", stop);
          }
          stoppedByScript = true;

          const fallbackReport = await requestJson({
            baseUrl: options.baseUrl,
            path: "/api/admin/ai-agent/report",
            token,
            timeoutMs: options.timeoutMs,
          });
          if (!fallbackReport.ok || fallbackReport.json?.source !== "local-fallback") {
            fail("Fallback report did not switch to local-fallback", fallbackReport);
          }

          const fallbackChat = await requestJson({
            baseUrl: options.baseUrl,
            path: "/api/admin/ai-agent/chat",
            token,
            method: "POST",
            body: { message: "fallback check" },
            timeoutMs: options.timeoutMs,
          });
          if (!fallbackChat.ok || fallbackChat.json?.source !== "local-fallback") {
            fail("Fallback chat did not switch to local-fallback", fallbackChat);
          }

          result.fallback.passed = true;
        }
      }
    }
  } finally {
    if (stoppedByScript) {
      const start = runDocker(["start", options.aiContainer]);
      if (!start.ok) {
        fail("Failed to restart ai-agent container after fallback test", start);
      }

      const recovered = await waitForHealthy(options.baseUrl, token, 45000);
      if (!recovered) {
        fail("ai-agent did not recover to healthy state after restart");
      }
    }
  }

  console.log("[smoke-ai-admin] Done.");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  fail("Unexpected failure", error instanceof Error ? error.message : String(error));
});
