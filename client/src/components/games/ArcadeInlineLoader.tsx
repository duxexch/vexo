import { useEffect, useRef, useCallback } from "react";

interface Props {
  gameSlug: string;
  lang: "ar" | "en";
  onBoot: () => void;
  onEndSession: (p: { score: number; result: "win" | "loss" | "draw"; metadata?: Record<string, unknown> }) => void;
  onReportScore?: (p: { score: number; metadata?: Record<string, unknown> }) => void;
  onError?: (e: string) => void;
}

const SDK_BLACKLIST = ["/games/vex-sdk.js", "/games/_shared/vex-game.js"];
const BOOT_FALLBACK_MS = 2500;

function buildGameUrlCandidates(gameSlug: string): string[] {
  const normalized = gameSlug.trim();
  const underscored = normalized.replace(/-/g, "_");
  const hyphenated = normalized.replace(/_/g, "-");
  const candidates = new Set<string>([
    `/games/${normalized}/index.html`,
    `/games/${hyphenated}/index.html`,
    `/games/${underscored}/index.html`,
    `/games/${hyphenated}.html`,
    `/games/${underscored}.html`,
    `/games/${normalized}.html`,
  ]);
  if (normalized === "stack-tower") {
    candidates.add("/games/stack_tower/index.html");
  }
  if (normalized === "snake") {
    candidates.add("/games/snake_arena/index.html");
  }
  if (normalized === "memory") {
    candidates.add("/games/memory.html");
  }
  if (normalized === "puzzle-challenge" || normalized === "puzzle_challenge") {
    candidates.add("/games/puzzle.html");
  }
  return [...candidates];
}

export default function ArcadeInlineLoader({ gameSlug, lang, onBoot, onEndSession, onReportScore, onError }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const bootedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    cleanup();
    bootedRef.current = false;
    const container = containerRef.current;
    if (!container) return;

    const triggerBoot = () => {
      if (bootedRef.current) return;
      bootedRef.current = true;
      onBoot();
    };

    const bridge = {
      init: () => triggerBoot(),
      endSession: (p: any) => onEndSession({ score: p.score ?? 0, result: p.result ?? "draw", metadata: p.metadata ?? {} }),
      reportScore: (p: any) => onReportScore?.({ score: p.score ?? 0, metadata: p.metadata ?? {} }),
    };

    (window as any).__ARCADE_BRIDGE__ = bridge;

    // Provide inline VEX shim
    (window as any).VEX = {
      init: (config: any) => { triggerBoot(); if (config?.onReady) config.onReady({ language: lang, id: 0 }); },
      endSession: (p: any) => bridge.endSession(p),
      reportScore: (p: any) => bridge.reportScore(p),
    };

    (window as any).VexGame = {
      boot: (opts: any) => {
        triggerBoot();
        if (opts?.onReady) opts.onReady({ language: lang, id: 0 });
      },
      endSession: (p: any) => bridge.endSession(p),
      reportScore: (p: any) => bridge.reportScore(p),
      toast: (msg: string) => { const el = document.createElement("div"); el.textContent = msg; el.style.cssText = "position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:8px 16px;border-radius:8px;z-index:9999;font-family:sans-serif"; document.body.appendChild(el); setTimeout(() => el.remove(), 1800); },
      popScore: (_parent: any, value: any, x: number, y: number) => { const el = document.createElement("div"); el.textContent = typeof value === "string" ? value : (value > 0 ? "+" + value : String(value)); el.style.cssText = `position:fixed;left:${x ?? 50}%;top:${y ?? 30}%;color:#ffb627;font-weight:700;font-size:18px;pointer-events:none;z-index:9999;transition:opacity 0.8s,transform 0.8s`; document.body.appendChild(el); requestAnimationFrame(() => { el.style.transform = "translateY(-30px)"; el.style.opacity = "0"; }); setTimeout(() => el.remove(), 900); },
      confetti: (_durationMs?: number) => { /* no-op inline */ },
      lockScroll: () => { document.body.style.overflow = "hidden"; },
      unlockScroll: () => { document.body.style.overflow = ""; },
    };

    const bootTimer = window.setTimeout(triggerBoot, BOOT_FALLBACK_MS);
    const gameUrls = buildGameUrlCandidates(gameSlug);
    let aborted = false;
    let injectedScripts: HTMLScriptElement[] = [];
    let injectedStyles: HTMLStyleElement[] = [];

    const loadGame = async (): Promise<string> => {
      for (const gameUrl of gameUrls) {
        const res = await fetch(gameUrl);
        if (res.ok) {
          return await res.text();
        }
      }
      throw new Error(`Unable to load arcade game. Tried: ${gameUrls.join(", ")}`);
    };

    loadGame()
      .then(html => {
        if (aborted) return;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        doc.querySelectorAll('style').forEach(node => {
          const s = document.createElement("style");
          s.textContent = node.textContent ?? "";
          container.appendChild(s);
          injectedStyles.push(s);
        });

        doc.querySelectorAll('link[rel="stylesheet"]').forEach(node => {
          const href = node.getAttribute("href");
          if (!href) return;
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          container.appendChild(link);
        });

        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = doc.body.innerHTML;
        tempDiv.querySelectorAll("script").forEach(s => s.remove());
        Array.from(tempDiv.childNodes).forEach(n => container.appendChild(n));

        doc.querySelectorAll("script[src]").forEach(node => {
          const src = node.getAttribute("src");
          if (!src || SDK_BLACKLIST.some(b => src.endsWith(b))) return;
          const s = document.createElement("script");
          s.src = src;
          s.async = false;
          container.appendChild(s);
          injectedScripts.push(s);
        });

        doc.querySelectorAll("script:not([src])").forEach(node => {
          const s = document.createElement("script");
          s.textContent = node.textContent ?? "";
          container.appendChild(s);
          injectedScripts.push(s);
        });

        const shim = document.createElement("script");
        shim.textContent = `window.VEX = window.VEX || { init: function(c){ if(c && c.onReady) c.onReady({language:'${lang}',id:0}); }, endSession: function(p){ if(window.__ARCADE_BRIDGE__) window.__ARCADE_BRIDGE__.endSession(p); }, reportScore: function(p){ if(window.__ARCADE_BRIDGE__) window.__ARCADE_BRIDGE__.reportScore(p); } }; window.VexGame = window.VexGame || { boot: function(o){ if(o && o.onReady) o.onReady({language:'${lang}',id:0}); }, endSession: function(p){ if(window.VEX && window.VEX.endSession) window.VEX.endSession(p); }, reportScore: function(p){ if(window.VEX && window.VEX.reportScore) window.VEX.reportScore(p); } };`;
        container.appendChild(shim);
        injectedScripts.push(shim);
      })
      .catch(e => { if (!aborted) onError?.(String(e)); });

    cleanupRef.current = () => {
      aborted = true;
      window.clearTimeout(bootTimer);
      delete (window as any).__ARCADE_BRIDGE__;
      delete (window as any).VEX;
      delete (window as any).VexGame;
      injectedScripts.forEach(s => s.remove());
      injectedStyles.forEach(s => s.remove());
      while (container.lastChild) container.removeChild(container.lastChild);
    };

    return cleanup;
  }, [gameSlug, lang, onBoot, onEndSession, onReportScore, onError, cleanup]);

  return (
    <div
      ref={containerRef}
      className="w-full flex-1 overflow-auto arcade-game-container"
      style={{ minHeight: 0 }}
      data-game-slug={gameSlug}
    />
  );
}
